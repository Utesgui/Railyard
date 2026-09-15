type Child = Node | string | number | null | undefined | false | Child[];

export interface Props {
  className?: string;
  id?: string;
  title?: string;
  style?: Partial<CSSStyleDeclaration>;
  dataset?: Record<string, string>;
  onClick?: (ev: MouseEvent) => void;
  onInput?: (ev: Event) => void;
  onChange?: (ev: Event) => void;
  onKeyDown?: (ev: KeyboardEvent) => void;
  disabled?: boolean;
  type?: string;
  value?: string;
  placeholder?: string;
  checked?: boolean;
  min?: string;
  max?: string;
  step?: string;
  html?: string;
  attrs?: Record<string, string>;
}

function append(el: Node, child: Child): void {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) {
    for (const c of child) append(el, c);
    return;
  }
  if (child instanceof Node) el.appendChild(child);
  else el.appendChild(document.createTextNode(String(child)));
}

/** Minimal element factory. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el: HTMLElement = document.createElement(tag);
  if (props) {
    if (props.className) el.className = props.className;
    if (props.id) el.id = props.id;
    if (props.title) el.title = props.title;
    if (props.style) Object.assign(el.style, props.style);
    if (props.dataset) for (const k of Object.keys(props.dataset)) el.dataset[k] = props.dataset[k];
    if (props.onClick) el.addEventListener('click', props.onClick);
    if (props.onInput) el.addEventListener('input', props.onInput);
    if (props.onChange) el.addEventListener('change', props.onChange);
    if (props.onKeyDown) el.addEventListener('keydown', props.onKeyDown);
    if (props.disabled !== undefined) (el as unknown as HTMLButtonElement).disabled = props.disabled;
    if (props.type !== undefined) (el as unknown as HTMLInputElement).type = props.type;
    if (props.value !== undefined) (el as unknown as HTMLInputElement).value = props.value;
    if (props.placeholder !== undefined) (el as unknown as HTMLInputElement).placeholder = props.placeholder;
    if (props.checked !== undefined) (el as unknown as HTMLInputElement).checked = props.checked;
    if (props.min !== undefined) (el as unknown as HTMLInputElement).min = props.min;
    if (props.max !== undefined) (el as unknown as HTMLInputElement).max = props.max;
    if (props.step !== undefined) (el as unknown as HTMLInputElement).step = props.step;
    if (props.html !== undefined) el.innerHTML = props.html;
    if (props.attrs) for (const k of Object.keys(props.attrs)) el.setAttribute(k, props.attrs[k]);
  }
  for (const c of children) append(el, c);
  return el as HTMLElementTagNameMap[K];
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function replace(el: Element, ...children: Child[]): void {
  clear(el);
  for (const c of children) append(el, c);
}

export function button(label: Child, onClick: (ev: MouseEvent) => void, className = 'btn', title?: string): HTMLButtonElement {
  const b = h('button', { className, onClick, title, type: 'button' }, label);
  return b;
}

export function row(...children: Child[]): HTMLDivElement {
  return h('div', { className: 'row' }, ...children);
}

export function kv(key: string, valueEl: Node | string, valueClass = ''): HTMLDivElement {
  return h('div', { className: 'kv' }, h('span', { className: 'k' }, key), h('span', { className: 'v ' + valueClass }, valueEl));
}

export function kvGrid(...pairs: (HTMLElement | null | false)[]): HTMLDivElement {
  return h('div', { className: 'kv-grid' }, ...pairs);
}

/** Change detector for cached DOM fragments: the first call always reports a change. */
export function memo(): { changed(key: string): boolean; reset(): void } {
  let last: string | undefined;
  return {
    changed(key: string) {
      if (key === last) return false;
      last = key;
      return true;
    },
    reset() {
      last = undefined;
    },
  };
}

export function section(title: string, ...children: Child[]): HTMLElement {
  return h('div', { className: 'section' }, h('h3', null, title), ...children);
}

export function sectionMeta(title: string, meta: Child, ...children: Child[]): HTMLElement {
  return h('div', { className: 'section' }, h('h3', null, title, h('span', { className: 'meta' }, meta)), ...children);
}

export function collapsible(title: string, open: boolean, ...children: Child[]): HTMLDetailsElement {
  const d = h('details', { className: 'section' }, h('summary', null, title), ...children);
  d.open = open;
  return d;
}

export function emptyState(text: Child, ...actions: Child[]): HTMLElement {
  return h('div', { className: 'empty' }, h('div', null, text), actions.length ? h('div', { className: 'row' }, ...actions) : null);
}

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

export function badge(tone: Tone, text: Child, title?: string): HTMLElement {
  return h('span', { className: `badge ${tone}`, title }, text);
}

export function kpi(label: string, value: Child, opts: { sub?: Child; tone?: 'pos' | 'neg' | ''; title?: string } = {}): HTMLElement {
  return h('div', { className: 'kpi', title: opts.title }, h('div', { className: 'k' }, label), h('div', { className: 'v ' + (opts.tone ?? '') }, value), opts.sub ? h('div', { className: 's' }, opts.sub) : null);
}

export function kpis(...items: Child[]): HTMLElement {
  const n = items.filter((x) => x !== null && x !== undefined && x !== false).length;
  return h('div', { className: `kpis n${n}` }, ...items);
}

export interface ListRowOptions {
  icon?: Child;
  title: Child;
  sub?: Child;
  value?: Child;
  valueClass?: string;
  onClick?: () => void;
  trailing?: Child[];
  selected?: boolean;
  ariaLabel?: string;
}

/** A list row; becomes a real button when it is clickable so it works with the keyboard. */
export function listRow(o: ListRowOptions): HTMLElement {
  const inner: Child[] = [
    o.icon ?? null,
    h('div', { className: 'main' }, h('div', { className: 'title' }, o.title), o.sub !== undefined && o.sub !== null && o.sub !== '' ? h('div', { className: 'sub' }, o.sub) : null),
    o.value !== undefined ? h('div', { className: 'val ' + (o.valueClass ?? '') }, o.value) : null,
    ...(o.trailing ?? []),
  ];
  const cls = 'list-row' + (o.onClick ? ' clickable' : '') + (o.selected ? ' selected' : '');
  if (o.onClick) {
    const b = h('button', { className: cls, onClick: o.onClick, type: 'button' }, ...inner);
    if (o.ariaLabel) b.setAttribute('aria-label', o.ariaLabel);
    return b;
  }
  return h('div', { className: cls }, ...inner);
}

export function meter(frac: number, tone: 'ok' | 'warn' | 'danger' | '' = '', title?: string): HTMLElement {
  const pct = Math.max(0, Math.min(1, frac)) * 100;
  return h('div', { className: `meter ${tone}`, title }, h('i', { style: { width: `${pct.toFixed(0)}%` } }));
}

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export function tabs(items: TabItem[], active: string, onChange: (id: string) => void): HTMLElement {
  const bar = h('div', { className: 'panel-tabs', attrs: { role: 'tablist' } });
  for (const it of items) {
    const b = h('button', { type: 'button', attrs: { role: 'tab', 'aria-selected': String(it.id === active) }, onClick: () => onChange(it.id) }, it.label, it.count !== undefined ? h('span', { className: 'count' }, String(it.count)) : null);
    bar.appendChild(b);
  }
  return bar;
}

/** Update aria-selected on an existing tab bar. */
export function setActiveTab(bar: HTMLElement, active: string, ids: string[]): void {
  const btns = bar.querySelectorAll('button');
  btns.forEach((b, i) => b.setAttribute('aria-selected', String(ids[i] === active)));
}
