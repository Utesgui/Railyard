# Start page, world styles and scenarios

## Start page

On the first visit (no autosave in this browser, no `?seed=` in the URL) the game opens on the start page instead of dropping into a random map. Afterwards the autosave is resumed directly; the start page is then the **main menu**, reachable from Settings, the Goals panel and the game-over dialog. Opening it pauses the game, Escape or *Continue* resumes it at the previous speed. Anything that replaces the running game asks first.

- **New game**: world style, map size, seed (with *Random*), start money and start year (1900 steam, 1935 diesel, 1965 electric). A live preview shows the terrain, towns and industries of the chosen seed and lists their numbers. The choices are remembered.
- **Scenarios**: cards in campaign order with difficulty, tagline and a completed star; the detail shows the description, objectives, map preview and facts, and *Play*.
- **Load game**: autosave, quick save and the five slots with their summary, plus import of a save file.

## World styles (`src/world/gen/presets.ts`)

| Style | What changes |
| --- | --- |
| Classic | the default noise terrain |
| Great plains | almost no hills, no mountains, little water, sparse forest, large features |
| Highlands | hills from the median up, mountains above the 86th percentile, dense forest |
| Archipelago | 42 % water, strong edge fall-off, small features; every island of 50+ tiles is usable land |
| The Ridge | a north–south mountain wall with a wobbling crest and a few passes; towns are placed east of it, raw industries west |
| The Long Valley | a meandering river along the long axis, low ground beside it, mountain rims |

A style is a set of terrain knobs (`TerrainParams`: water / hills / mountain quantiles, forest share, edge fall-off, noise scale) plus an optional **shape** function that adds height after the thresholds are fixed, so it overrides the noise (+0.7 forces a mountain, −1 forces water). Placement bias regions restrict where towns, raw industries and processors may go.

## Hand-drawn maps (`src/world/gen/drawn.ts`)

A drawn map is a list of geographic features on a base terrain, plus explicit towns and industries:

| Feature | Fields |
| --- | --- |
| `river` | polyline points and a width in tiles; the line meanders with noise and is rasterised 4-connected so bridges and the land mass stay consistent |
| `lake` | centre and radius, wobbly rim |
| `zone` | polygon, terrain, density 0–1 (noise-clumped) and clump scale |
| `blob` | circle, terrain, density fading toward the rim |

| `ships` | polyline of water tiles, speed (tiles per day) and dwell days: a decorative barge shuttles along it, its position a pure function of game time |

Zones and blobs are drawn first and cleaned with the majority filter, water goes on top. Towns are `{ name, x, y, pop, perks? }` and grow their building blob like generated ones; industries are `{ type, x, y, name, perks?, level? }` and slide to the nearest free 2×2 footprint if the drawn spot is taken. Perks are fixed price modifiers (see ECONOMY.md).

### Passau district

`PASSAU_MAP` in `src/data/scenarios.ts` is the Landkreis Passau at roughly half a kilometre per tile, 128×96, north up, from real coordinates (x = (lon − 13.01°) × 147, y = (48.77° − lat) × 210):

- Rivers: the Danube from the west edge past Vilshofen and Windorf to Passau, then wider east past Obernzell to the Austrian border; the Inn from the south edge past Neuhaus and Neuburg; the Ilz from the north; the Vils through Aidenbach into the Danube at Vilshofen; the Rott through the south past Kößlarn, Rotthalmünster, Pocking and Ruhstorf into the Inn; the lake at Eging am See.
- Terrain: Bavarian Forest (forest and hills) north of the Danube with granite mountains in the north-east (Dreisessel) and north; the Neuburger Wald between Inn and Danube east of Passau; rolling Rottal farmland in the south; flat river valleys.
- 48 towns from Passau (4,800) to the Innviertel villages (300); Bad Füssing (+20 % passengers), Bad Griesbach (+15 %), Passau (+10 %) and Schärding (+10 %) carry passenger perks. The Austrian side across the Inn and the Danube has Schärding, Wernstein, Schardenberg, Suben, Taufkirchen an der Pram, Diersbach, Andorf, Enzenkirchen, Raab, Münzkirchen, St. Roman, Esternberg, Vichtenstein, Kopfing, St. Aegidi, Engelhartszell and Waldkirchen am Wesen, with the wooded Sauwald plateau between the Danube and the Pram valley.
- Industries: four forests (Sonnen, Fürstenstein, Breitenberg, Neuburger Wald), sawmills in Tittling and Hauzenberg, four Rottal farms, the Aldersbach brewery (+10 % food) and the Pocking dairy; the Kropfmühl graphite mine below Hauzenberg (a real one, worked since the 15th century); **Bayernhafen Passau** on the Danube's north bank below the Ilz mouth, a river port that takes graphite, coal, iron ore and oil at +10 % and ships it out of the map; a coal mine at the Dreisessel and an iron mine on the Brotjacklriegel (fictional, so the map has coal and ore); two oil wells in the flat Pram valley in the south-east; on the Austrian side two Innviertel farms, the Schärding brewery (+10 % food), the Sauwald forest and sawmill. A barge shuttles between the port and the eastern edge of the map.
- Objectives: connect Passau, Vilshofen and Pocking; serve 12 towns; 4,000 t planks; 3,000 t food; 1,500 t graphite; 30,000 passengers.

## Scenarios (`src/data/scenarios.ts`)

| Scenario | Map | Start | Objectives |
| --- | --- | --- | --- |
| Green Valley (easy) | classic 64×48 | $600k, 1900 | serve 4 towns, run 3 trains, deliver 500 t logs, hold $700k |
| Twin Cities (easy) | plains 96×64, two cities of 5,000–6,500 as far apart as possible | $600k | connect the two biggest towns, 60,000 passengers, 4,000 bags of mail, $1.5M |
| Passau District (medium) | drawn 128×96 | $750k | connect Passau, Vilshofen and Pocking; serve 12 towns; 4,000 t planks; 3,000 t food; 1,500 t graphite; 30,000 passengers |
| Over the Ridge (medium) | ridge 128×96 | $750k | 3,000 t coal, 2,000 t planks, serve 6 industries, $1.5M |
| Coal Country (medium) | highlands 96×64, 4–5 coal mines, 3 iron mines, 2 steel mills, no oil | $700k | 6,000 t coal, 2,000 t steel, 1,500 crates goods, a level-4 coal mine |
| Great Plains (medium) | plains 176×120, 22 towns | $800k | serve 20,000 inhabitants, 60,000 passengers, 5,000 t grain, $1.5M revenue in twelve months |
| The Long Valley (medium) | valley 192×48, 14 towns | $650k | serve 10 towns, 15 trains, 2,000 t food, $2M |
| Thousand Bridges (hard) | archipelago 96×64 | $900k | serve 8 towns, 10 stations, 6 kinds of cargo, $2M |
| Hard Times (hard) | classic 96×64 | $200k, deadline end of 1915 | hold $1M, serve 6 towns |

Goals (`src/sim/goals.ts`) are numbers the player pushes up, read from data the game already tracks: cash, delivered units per cargo, passengers, towns and industries served, connected towns (stations in their catchments reach each other over the line network), trains, stations, an industry level, twelve-month revenue, served population, distinct cargo kinds. They are evaluated at month end. When all are met the scenario is **won**; when a deadline passes first it is **failed**. Either way the game continues, the result is shown once and stored in the save (`state.scenario`, save schema 6) and won scenarios are marked on the start page.

The **Goals** panel (G, toolbar badge "met/total") lists the objectives with progress bars, and the achievements; in free play it shows the achievements only.
