# Railyard

A small but deep browser-based train transport game in the spirit of Transport Fever and Railway
Empire: lay track on a procedurally generated map, build stations, define lines, buy trains and haul
passengers, mail and raw materials through production chains. Towns grow when they are served well,
industries expand when their output is moved, and new locomotives arrive as the decades pass.

No game engine, no runtime dependencies: TypeScript + Vite + Canvas 2D, HUD in plain HTML/CSS.

## Play

```
npm install
npm run dev          # http://localhost:5173  (add ?seed=1234 for a specific map)
```

Build a line in four steps: **T** lay track (click start, click end – the route is planned for you,
bridges and tunnels included; middle-click adds waypoints to steer it), **S** place stations within
3 tiles of towns or industries, **L** create a line and click stations to add stops, **V** buy a
locomotive with matching wagons. A short tutorial walks you through it on a new game.

| Key | Action |
|---|---|
| Space, 1–4 | Pause, 1×/2×/4×/8× speed |
| T / S / X | Track / Station / Demolish tool |
| L / V / F / O | Lines / Vehicles / Finances / Settings |
| Arrows, wheel, right-drag | Pan, zoom, pan |
| Middle-click | Add a waypoint while laying track |
| Esc | Cancel tool / close panel / close dialog |
| Ctrl+S / Ctrl+L | Quick save / quick load |

## How it works

- **Cargo chains**: Forest → Logs → Sawmill → Planks → Town; Coal + Iron Ore → Steel Mill → Steel →
  Factory → Goods → Town; Farm → Grain → Food Plant → Food → Town; Oil Well → Oil → Refinery → Fuel →
  Town. Passengers and mail flow between towns following a gravity model.
- **Station rating** per cargo decides how much of the nearby production reaches your station:
  frequent, fast trains and short queues keep it high.
- **Hubs**: cargo has a destination and transfers between lines at shared stations automatically.
- **Traffic**: trains reserve the track ahead of them and lock single-track sections by direction;
  add platforms or passing loops where trains queue.
- **Eras**: steam (1900), diesel (1935), electric (1965) locomotives with different speed, power and cost.
- **Progress**: yearly report, achievements, 12-month profit charts per line and train, station traffic
  statistics, configurable start money and UI size in the settings.

## Develop

```
npm run typecheck    # tsc
npm test             # vitest unit tests (generator, track graph, routing, save codec, headless game)
npm run test:e2e     # Playwright smoke test (boots the game and builds a working line)
npm run build        # production build in dist/
```

The simulation (`src/sim`, `src/track`, `src/world`) has no DOM dependencies and runs headless in
tests. All game state is plain data (`src/core/types.ts`); every mutation goes through
`src/app/commands.ts`. Balance numbers live in `src/data/balance.ts`.
