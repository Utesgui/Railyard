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

## Audit 2 implemented (docs/UI-UX-AUDIT-2.md)

### Must: errors and misleading states

- Processors use the same "< 60 % of last month's output moved" warning as raw industries; a full station pile is its own diagnosis ("Station pile full").
- Station cargo rows check whether any line stopping here has a train with a matching wagon class; otherwise a badge names the missing wagon ("No train here can load Planks · Needs a Box Car on a line stopping here") with a Depot button. The line panel lists "Can carry: …" from its trains.
- The year-end toast reports the operating result and the net including investments separately; its colour follows the operating result. "Report" on the toast opens the year report.
- Year report setting: *Dialog at slow speeds* (default, ≤ 2×), *Always*, *Never*; the report is always reachable from Finances and from the year rows in Alerts.
- Toasts: at most three (two below 420 px), bottom-left beside the panel column, identical messages collapse to "(×N)", per-train messages collapse to "N trains forced their way out of …" / "have no route to …" / "broke down"; hover pauses the timer.
- Alerts filter "Money" is now "Company" (achievements, year results).
- Autosave also on `visibilitychange: hidden` and `pagehide` (when autosave is enabled).
- Alerts rows: icon, text and Show button in fixed grid columns. Four KPIs render as 2×2 (values never wrap).
- Wording: congestion message says "add platforms or a second track" (matches the Double track tool); the train state is "Blocked" everywhere.
- Station labels are ellipsised above 26 characters and flip above the station when a town label sits below.
- Cargo waiting longer than a year reads "waiting over a year on average".

### Should: cause → action

- Status blocks (train, station cargo, industry) follow one pattern: badge, action buttons, hint line. Blocked → "Double track" (opens the tool at the train); No route → "Show" and "Open line"; industry → "Station tool" / "Open lines" / "Open station".
- Contracts button carries a badge with open offers; each offer states whether the destination has a station on a line and how much of the cargo you moved last month.
- Demolish removes a whole segment (junction to junction) with a translucent preview and the refund in the context bar; Shift-click removes a single piece. **Ctrl+Z** (or "Undo build" in the context bar) takes back the last track build at full refund within 60 s, as long as the track is unchanged and no train uses it.
- Line editor: "Insert stops after stop N" puts new stops at that position (marker in the list, hint in the context bar).
- Line legs on the map follow the routed track (route cache, at most three new routes per frame); unreachable legs are dashed red.
- "Buy same again" on the train panel; quantity ×1…×5 in the depot; "Replace locomotives" on a line quotes every stopped train via `quoteRefit` and applies the refits.
- Station preview also reports "Shares its catchment with …".
- Fleet "Problems" filter has cause chips with counts.
- Touch: two-finger pinch zoom, − / + buttons in the minimap corner.
- Keyboard: Enter selects the hovered tile in Inspect; W toggles the World panel; help lists W, A, Ctrl+Z, Shift-click and Enter.

### Can: overviews from existing data

- **World** panel (W): Towns (population, growth, cargo accepted, status) and Industries (chain, output moved, diagnosis) with KPIs; rows open the entity.
- Depot shows a collapsible "Coming and going" timeline of locomotive introduction and retirement years.
- Save slots store year, cash, trains and seed next to the timestamp (`railyard:meta:<slot>`); the game-over dialog uses the same summary.

### Waiting cargo on the map

`src/render/cargoLayer.ts` draws a small plate to the right of each station with one row per waiting cargo type (largest first, up to four rows, "+N" for more). Each row is a stack of cargo icons whose size and count grow with the amount:

| Waiting | Icon size (world px) | One icon per | Icons |
| --- | --- | --- | --- |
| < 40 | 5 | 10 units | 1–4 |
| 40–99 | 7 | 25 units | 2–4 |
| ≥ 100 | 9 | 50 units | 2–4 |

A red line under a row means the pile is at the station's capacity (production is being lost). The layer is hidden below zoom 0.75, icons are drawn 30 % larger between 0.75 and 1, the exact figures are in the hover tooltip and the station's Cargo tab, and the layer can be switched off in Settings → Display ("Show waiting cargo at stations on the map"). Tiers are unit-tested in `src/app/trackEdit.test.ts`.

### Tests

- `src/app/trackEdit.test.ts`: undo at full refund, undo refused after a change, segment removal refund equals the quote, cargo tiers.
- e2e: Ctrl+Z refund through the real track tool, World panel navigation.

## Known limits

- Stops cannot be reordered by drag; use the up/down buttons or "Insert stops after".
- Wagons in the consist editor are removed by clicking them; there is no in-place reordering (order has no gameplay effect).
- Line legs follow the routed track only while the route cache has the leg; the first frames after a track change may show straight legs until the routes are recomputed.
- Contract rewards are booked as revenue of the delivered cargo; a separate premium series would need a booking change and a schema migration.
- Table columns in Finances scroll horizontally on narrow panels by design.
- The HUD size uses CSS `zoom`; very old browsers without `zoom` support keep 100 %.
- Not implemented from audit 2: load and station-traffic histories (need schema fields and a migration), objectives beyond achievements, a two-train comparison view, and moving the remaining hard-coded UI strings into `t()`.

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
