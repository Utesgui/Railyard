# HUD redesign — change log, fixed bugs, known limits

This document summarises the UI/UX rework of the Railyard HUD. The simulation, commands,
routing, balance and save format were not changed except where listed under *Simulation
groundwork*; every UI action still goes through the command layer.

## Architecture

| Area | Before | After |
| --- | --- | --- |
| Styling | ad-hoc rules per panel | design tokens in `src/style.css` (surfaces, text, accent/primary, status colours, spacing, type scale) and shared components (`.btn` variants, `.panel-*`, `.kpi`, `.badge`, `.list-row`, `.meter`, `.tbl`, `.dialog`, `.notif`, `.contract`) |
| Layout | absolutely placed boxes | three-row HUD grid (`#topbar`, `#stage`, `#bottombar`); the stage holds the panel column, minimap, context bar, toasts and dialogs. Container queries (`@container hud`) switch to a bottom-sheet panel and icon-only toolbar below 640 px; key hints and group labels drop out at 1500 / 1000 px |
| Dialogs | one function with ad-hoc speed handling | `DialogManager` (`src/ui/dialogs.ts`): pauses once, remembers the previous speed across replaced dialogs, restores it only on the last close and never after the state was replaced (new game / load); focus trap, `role`/`aria-modal`/`aria-labelledby`, Escape and backdrop, focus returns to the opener |
| Panels | one panel, rebuilt from scratch | `PanelHost` with a navigation stack (`open` replaces, `push` adds a level, `back` returns with the scroll position), per-panel UI memory (active tab, sort, filter), standard header/body/footer helpers and a wide variant for tables |
| Hotkeys | fired even while typing in dialogs | ignored while a dialog is open; a focused button keeps Space/Enter; mouse clicks no longer leave HUD buttons focused |
| Hint line | free text at the bottom | context bar: active tool, next step, validity and price (track preview, station, double track, demolish), or the dismissable tutorial step |

## Panels

- **Top bar**: cash (click opens finances) with the *last completed month's operating result* labelled as such (revenue minus running costs, maintenance and interest); date; pause + speed buttons with `aria-pressed`; train and line counters that open Fleet / Lines; alerts bell with an unread badge based on notification ids (not on the 50-entry ring length).
- **Toolbar**: Build (Inspect, Track, Station, Double track, Demolish) and Manage (Lines, Fleet, Finances, Contracts, Settings) groups with icons, labels and key hints; minimap toggle on small screens (M).
- **Fleet** (new): KPIs, search, sort, All / Problems / Stopped filters, status badges, shortcut to the depot.
- **Train**: status badge and sentence, KPIs, consist strip with cargo, performance rating, control (stop / resume / refit / assign line with an explanation when disabled), statistics, 12-month chart, sell in the footer with confirmation.
- **Depot**: buy and refit modes; locomotive radio cards with specs, wagon catalogue, consist editor, summary and performance; footer shows the total (buy) or the *net* price from `quoteRefit` (refit) with a breakdown, disabled reasons and a cargo-loss warning. Refits are applied atomically by `refitTrain`; a refit without changes cannot be applied and costs nothing.
- **Lines / Line**: list with health badges; editor with route band (numbered stops in the line colour, rules as toggles, move/remove), mode toggle, colour grid, trains, chart, cargo delivered; delete guard; Buy train opens the depot for the line.
- **Station**: Overview / Cargo / Links / Traffic tabs. Cargo shows waiting amounts per destination with rating meters and what the catchment accepts; Links lists reachable stations from the next-hop table; Traffic shows this month and last month separately (picked up ↑ / delivered ↓).
- **Industry / Town**: status badge (no station, station not on a line, low transport share), KPIs, production this vs last month. "To stations" is the amount that entered station piles (limited by station capacity and ratings); processors convert each input independently.
- **Finances** (wide): KPIs (cash, loan, last-month operating result, net over completed months), loan actions with reasons, 12/36-month period for the cash line chart and net bar chart, monthly table with every cost category (including *Other* = contract penalties), revenue by cargo (last / this month), lines sorted by profit.
- **Contracts**: Offers / Active / History tabs with counts; the penalty is visible before accepting; history distinguishes completed, failed (with the penalty actually charged), expired and declined.
- **Alerts**: unread state via notification ids; opening the panel marks everything seen; filters (all, warnings, money, info); date, severity icon and a Show button per message.
- **Settings**: sections for new game, saves (metadata, overwrite/load/delete confirmations), autosave, sound (value + mute), display (UI size, coverage, lines), progress (achievements, tutorial), help (keyboard & mouse dialog, also `?`).
- **Year report**: "Population served" now counts inhabitants of towns covered by a station on a line (each town once); the previous total is shown as "Map population".

## Simulation groundwork (stage 2)

- `Notification.id`, `notificationSeq`, `notificationsSeen` — unread counting independent of the ring; `Commands.markNotificationsSeen()`.
- Contracts: `deliveryMonths`, statuses `expired` / `declined` / `failed` / `done`, `penaltyCharged`, `closedDay`; declined and expired offers cost nothing.
- `Commands.quoteRefit()` / `refitTrain()` — validated, atomic refit that keeps loaded wagons of a kept type; `replaceLoco` now goes through it.
- `servedPopulation()` in `sim/cargoRouting.ts`.
- Save schema 5 with a migration for older saves.
- Tests: `src/app/refit.test.ts`, `src/sim/notify.test.ts`, extended `contracts.test.ts`, `codec.test.ts`; e2e `tests/e2e/ui.spec.ts` (panel toggling, dialog pause/hotkey blocking/speed restore, prompt typing, fleet → train → back, refit no-op, alerts badge).

## Bugs fixed along the way

- Opening the depot with no line selected refitted train 0 (argument encoding clash). Depot arguments are now `>= 0` line id, `-1` choose line, `<= -2` refit train.
- Dialogs restored the game speed after a new game / load had replaced the state, and a second dialog reset the remembered speed.
- Space / Enter after clicking a HUD button both activated the button again and fired the game hotkey.
- The alerts badge was derived from the ring length and reset on every load.
- "Population served" in the year report counted the whole map.
- Lists that were rebuilt at 10 Hz swallowed clicks; all lists now rebuild only when their content key changes.

## Audit coverage (docs/UI-UX-AUDIT.md)

Every P0 and P1 finding of the audit is addressed: unchanged refits are free and cannot be applied, refits are atomic with a net price, dialogs keep one pause/speed lifecycle and Escape works inside inputs, the HUD stays usable at 390 px, minimap and toolbar no longer overlap at any UI size, "this month" and "last month" are separate everywhere, the year report distinguishes served and map population, Fleet replaces the old Vehicles entry, the depot has readable vehicle cards (the "+" tile jumps to the catalogue), purchase and refit prerequisites are shown before clicking, line rows carry rules on their own line with a keyboard-reachable colour grid, lists render their empty state on first open, finance figures are labelled and broken down, contract penalties and exact dates are visible before accepting and expired offers are not "failed", cache keys include names, colours, destinations and the running month (chart labels move on even when values repeat), the alerts badge is id-based, and destructive actions ask for confirmation while command failures are reported.

From the detail sections: the station tool previews what a station would collect from; station cargo rows show last pickup, pickup speed, average waiting age and patience; towns list every accepted cargo; industries diagnose "no station", "not on a line", "no destination" (using the simulation's own lookup) and "no inputs"; lines can be searched and sorted; charts are taller, have exact tooltips and a collapsible data table; the bankruptcy dialog lists the saves that actually exist.

## Known limits

- Stops cannot be reordered by drag; use the up/down buttons.
- Wagons in the consist editor are removed by clicking them; there is no in-place reordering (order has no gameplay effect).
- Lines on the map are drawn as straight connections between stops, not as the routed track (stated in the Lines panel).
- Contract rewards are booked as revenue of the delivered cargo; a separate premium series would need a booking change and a schema migration.
- Table columns in Finances scroll horizontally on narrow panels by design.
- The HUD size uses CSS `zoom`; very old browsers without `zoom` support keep 100 %.

## Telemetry proposal (not implemented)

If usage data is wanted later, these events would cover the questions the redesign raises, without touching the simulation:

| Event | Fields | Question |
| --- | --- | --- |
| `panel_open` | panel, arg kind, source (toolbar / hotkey / map / link), depth | Which entry points are used; is the navigation stack useful |
| `dialog_result` | kind, action (confirm / cancel / escape / backdrop) | Are confirmations understood or dismissed by reflex |
| `refit_apply` | net, wagons bought / sold, cargo lost | Does the net-price footer prevent surprise charges |
| `tool_cancel` | tool, step (anchor / preview / invalid) | Where players abandon the build flow |
| `viewport` | width, height, ui scale, container mode | How often the narrow layout is actually used |

All events would be opt-in and local (no backend exists); a first implementation could write them to `localStorage` for export.
