import type { Game } from '../../app/Game';
import { TrainState, type Train } from '../../core/types';
import { consistInfo } from '../../sim/train/consist';
import { trainAgeYears } from '../../sim/train/step';
import { badge, button, clear, emptyState, h, kpi, kpis, listRow, section, tabs } from '../dom';
import { fmtInt, fmtMoney, fmtMoneyShort, fmtPct } from '../format';
import { uiIcon } from '../icons';
import type { PanelHost } from './PanelHost';
import { lineColor, openEntity, trainProblem, trainStatus, yearsText } from './shared';

type SortKey = 'name' | 'line' | 'profit' | 'age' | 'load' | 'status';
type Filter = 'all' | 'problems' | 'stopped';

interface FleetMemory {
  q: string;
  sort: SortKey;
  filter: Filter;
  /** problem chip within the Problems filter ('' = all problems) */
  cause: string;
}

const SORTS: [SortKey, string][] = [
  ['name', 'Name'],
  ['line', 'Line'],
  ['profit', 'Profit (last month)'],
  ['load', 'Load factor'],
  ['age', 'Age'],
  ['status', 'Status'],
];

/** Fleet overview: every train with its status, filters, sorting and a shortcut to the depot. */
export function registerFleetPanel(host: PanelHost): void {
  host.register('fleet', (game: Game, host) => {
    const mem = host.state<FleetMemory>('fleet', () => ({ q: '', sort: 'status', filter: 'all', cause: '' }));
    const chips = h('div', { className: 'row chips' });
    const search = h('input', { type: 'search', placeholder: 'Search trains or lines', value: mem.q, attrs: { 'aria-label': 'Search trains' }, onInput: () => { mem.q = search.value; rebuild(); } });
    const sortSel = h('select', { attrs: { 'aria-label': 'Sort by' }, onChange: () => { mem.sort = sortSel.value as SortKey; rebuild(); } });
    for (const [k, label] of SORTS) {
      const opt = h('option', { value: k }, label);
      if (k === mem.sort) opt.selected = true;
      sortSel.appendChild(opt);
    }
    const tabBar = h('div');
    const kpiWrap = h('div');
    const list = h('div', { className: 'list' });
    const body = host.body(kpiWrap, h('div', { className: 'row' }, h('div', { className: 'grow' }, search), sortSel), tabBar, chips, list);
    const buyBtn = button('Buy train', () => host.push('depot', -1), 'btn primary');
    const el = host.frame(host.header('Fleet', { eyebrow: 'Company' }), body, host.foot(h('span', { className: 'grow hint' }, 'Click a train for details'), buyBtn));

    const counts = () => {
      const s = game.state;
      let problems = 0;
      let stopped = 0;
      for (const tr of s.trains) {
        if (trainProblem(s, tr, game.rt)) problems++;
        if (tr.state === TrainState.Stopped) stopped++;
      }
      return { all: s.trains.length, problems, stopped };
    };

    const matches = (tr: Train): boolean => {
      const c = trainProblem(game.state, tr, game.rt);
      if (mem.filter === 'problems' && !c) return false;
      if (mem.filter === 'problems' && mem.cause && c !== mem.cause) return false;
      if (mem.filter === 'stopped' && tr.state !== TrainState.Stopped) return false;
      if (!mem.q) return true;
      const q = mem.q.toLowerCase();
      const line = game.rt.lineById.get(tr.lineId);
      return tr.name.toLowerCase().includes(q) || (line?.name.toLowerCase().includes(q) ?? false);
    };

    const sorted = (): Train[] => {
      const s = game.state;
      const rt = game.rt;
      const arr = s.trains.filter(matches);
      const lineName = (tr: Train) => rt.lineById.get(tr.lineId)?.name ?? '';
      const rank = (tr: Train) => (trainProblem(s, tr, rt) ? 0 : tr.state === TrainState.Stopped ? 1 : 2);
      arr.sort((a, b) => {
        switch (mem.sort) {
          case 'name':
            return a.name.localeCompare(b.name);
          case 'line':
            return lineName(a).localeCompare(lineName(b)) || a.name.localeCompare(b.name);
          case 'profit':
            return b.profitLastMonth - a.profitLastMonth;
          case 'load':
            return b.loadFactorLastMonth - a.loadFactorLastMonth;
          case 'age':
            return a.boughtDay - b.boughtDay;
          default:
            return rank(a) - rank(b) || a.name.localeCompare(b.name);
        }
      });
      return arr;
    };

    let listKey = '';
    const rebuild = () => {
      const s = game.state;
      const rt = game.rt;
      const c = counts();
      clear(tabBar);
      tabBar.appendChild(
        tabs(
          [
            { id: 'all', label: 'All', count: c.all },
            { id: 'problems', label: 'Problems', count: c.problems },
            { id: 'stopped', label: 'Stopped', count: c.stopped },
          ],
          mem.filter,
          (id) => {
            mem.filter = id as Filter;
            rebuild();
          },
        ),
      );
      clear(chips);
      chips.hidden = mem.filter !== 'problems';
      if (mem.filter === 'problems') {
        const byCause = new Map<string, number>();
        for (const tr of s.trains) {
          const p = trainProblem(s, tr, rt);
          if (p) byCause.set(p, (byCause.get(p) ?? 0) + 1);
        }
        if (mem.cause && !byCause.has(mem.cause)) mem.cause = '';
        const chip = (label: string, cause: string, n: number) => h('button', { className: 'btn small toggle', type: 'button', attrs: { 'aria-pressed': String(mem.cause === cause) }, onClick: () => { mem.cause = cause; rebuild(); } }, label, h('span', { className: 'count' }, String(n)));
        chips.append(chip('All problems', '', [...byCause.values()].reduce((a, b) => a + b, 0)), ...[...byCause].sort((a, b) => b[1] - a[1]).map(([cause, n]) => chip(cause, cause, n)));
      }
      clear(list);
      if (s.trains.length === 0) {
        list.appendChild(
          emptyState(
            s.lines.length ? 'No trains yet. Buy a train and assign it to a line.' : 'No trains yet. Create a line with two stops first, then buy a train for it.',
            s.lines.length ? button('Buy train', () => host.push('depot', -1), 'btn small primary') : button('Go to lines', () => host.open('lines'), 'btn small primary'),
          ),
        );
        return;
      }
      const rows = sorted();
      for (const tr of rows) {
        const line = rt.lineById.get(tr.lineId);
        const st = trainStatus(tr, rt);
        const problem = trainProblem(s, tr, rt);
        list.appendChild(
          listRow({
            icon: h('span', { className: 'swatch', style: { background: line ? lineColor(line.color) : 'transparent', border: line ? 'none' : '1px dashed var(--border-strong)' }, title: line ? line.name : 'No line' }),
            title: tr.name,
            sub: `${line ? line.name : 'No line'} · ${st.text}`,
            value: fmtMoney(tr.profitLastMonth),
            valueClass: tr.profitLastMonth >= 0 ? 'good' : 'warn',
            trailing: [badge(problem ? (st.tone === 'neutral' ? 'warn' : st.tone) : st.tone, problem ?? st.short)],
            onClick: () => openEntity(game, host, 'train', tr.id),
            ariaLabel: `${tr.name}, ${st.text}, profit last month ${fmtMoney(tr.profitLastMonth)}`,
          }),
        );
      }
      if (rows.length === 0) list.appendChild(emptyState('No trains match the current search or filter.'));
    };

    let kpiKey = '';
    const update = () => {
      const s = game.state;
      const rt = game.rt;
      let enRoute = 0;
      let profit = 0;
      let run = 0;
      let problems = 0;
      let loads = 0;
      let loadN = 0;
      for (const tr of s.trains) {
        if (tr.state === TrainState.Moving) enRoute++;
        profit += tr.profitLastMonth;
        run += consistInfo(tr).runCost;
        if (trainProblem(s, tr, rt)) problems++;
        if (tr.loadFactorLastMonth > 0) {
          loads += tr.loadFactorLastMonth;
          loadN++;
        }
      }
      const kk = `${s.trains.length}|${enRoute}|${Math.round(profit)}|${Math.round(run)}|${problems}|${loadN ? Math.round((loads / loadN) * 100) : -1}`;
      if (kk !== kpiKey) {
        kpiKey = kk;
        clear(kpiWrap);
        kpiWrap.appendChild(
          kpis(
            kpi('Trains', fmtInt(s.trains.length), { sub: `${enRoute} en route` }),
            kpi('Problems', fmtInt(problems), { tone: problems ? 'neg' : '' }),
            kpi('Profit', fmtMoneyShort(profit), { tone: profit >= 0 ? 'pos' : 'neg', sub: 'last month, all trains' }),
            kpi('Running cost', `${fmtMoneyShort(run)}/mo`, { sub: loadN ? `avg load ${fmtPct(loads / loadN)}` : 'no load data yet' }),
          ),
        );
      }
      const lk =
        s.trains
          .map((tr) => `${tr.id}:${tr.name}:${tr.lineId}:${tr.state}:${tr.blockedTicks > 60 ? 'b' : ''}:${Math.round(tr.profitLastMonth)}:${trainProblem(s, tr, rt) ?? ''}:${Math.round(trainAgeYears(s, tr))}`)
          .join('|') + `#${mem.q}#${mem.sort}#${mem.filter}#${mem.cause}#${s.lines.map((l) => l.name).join(',')}`;
      if (lk !== listKey) {
        listKey = lk;
        rebuild();
      }
      buyBtn.disabled = s.lines.length === 0;
      buyBtn.title = s.lines.length === 0 ? 'Create a line first' : 'Open the depot';
    };
    update();
    void uiIcon;
    void yearsText;
    return { el, update };
  });
}
