# Economy — revenue and local prices

## Revenue for a delivery

Every time a wagon is unloaded (at its destination or at a transfer hub) the company is paid

```
revenue = amount × baseValue(cargo) × price × d(distance) × timeFactor
```

| Term | Meaning |
| --- | --- |
| `amount` | units unloaded (t, kl, crates, bags, pax) |
| `baseValue(cargo)` | $ per unit per tile, from `src/data/cargo.ts` (passengers 1.0 … goods 2.6) |
| `price` | local price multiplier, see below (1 = base value) |
| `d(distance)` | octile distance in tiles between the loading station and the unloading station; above 40 tiles only a quarter of the extra distance counts (`B.distanceCap`) |
| `timeFactor` | `clamp(1.25 − 0.5 × days / transitDays, 0.4, 1.25)`: fast deliveries earn up to +25 %, slow ones as little as 40 % |

Nothing is paid for the cargo itself: the company is a carrier. Delivered inputs are converted by the receiving plant into its output, which then appears at the stations in its range.

## Local prices

Before this change every steel mill paid the same for coal and every mine's coal was worth the same. Now each producer has a **supply premium** per output cargo and each receiver has a **demand price** per accepted cargo. Both are percentages of the base value in the range 75–135 % (`B.priceMin` / `B.priceMax`), and the multiplier of a delivery is

```
price = supply(origin station, cargo) × demand(destination station, cargo)
```

`supply` is the best premium among the producers of that cargo in the loading station's catchment; `demand` is the price of the receiver that actually takes the cargo at the unloading station (the first accepting industry in the catchment, else the town). Passengers and mail have no supply premium; towns only apply perks to them.

The reasons are visible everywhere the price matters: the industry and town panels list every modifier (hover a row for the full text), the map tooltip summarises them ("Sawmill · pays for logs 113 % · sells planks 100 %") and station cargo rows show what the destination pays ("to Whitby Mill (pays 112 %)").

### Supply premium (what a producer's output is worth)

| Producer | Modifier | Effect |
| --- | --- | --- |
| Coal / iron mine | ≥ 20 hill or mountain tiles within 3 → *Rich deposit*; ≥ 10 → *Good deposit*; < 5 → *Shallow deposit* | +12 % / +6 % / −5 % |
| Forest | ≥ 22 forest tiles within 3 → *Old-growth forest*; ≥ 12 → *Dense forest*; < 8 → *Thin forest* | +10 % / +5 % / −6 % |
| Farm | ≥ 30 grass tiles → *Fertile plain*; ≥ 20 → *Good soil*; ≥ 2 water tiles → *River water*; ≥ 12 hill tiles → *Stony ground* | +10 % / +4 % / +4 % / −6 % |
| Oil well | ≥ 8 hill tiles → *Deep field*; ≥ 3 water tiles → *Shore field* | +8 % / +4 % |
| Processors (sawmill, steel mill, factory, food plant, refinery) | a town of ≥ 1,500 within 12 tiles → *Skilled workforce*; nearest town farther than 14 → *Remote plant* | +8 % / −5 % |
| Everyone | other producers of the same cargo within 16 tiles → *Crowded market* | −6 % each, at most −18 % |
| Scenario perks | e.g. *Brewery tradition* on the Aldersbach brewery | as defined |

### Demand price (what a receiver pays)

| Receiver | Modifier | Effect |
| --- | --- | --- |
| Industry | nearest producer of the cargo ≥ 30 tiles away (or none) → *Far from suppliers*; ≥ 18 → *No supplier nearby*; ≤ 8 → *Supplier next door* | +15 % / +8 % / −8 % |
| Industry | other consumers of the cargo within 14 tiles → *Competing buyers* | +4 % each, at most +8 % |
| Industry | ≥ 2 water tiles within 2 → *River access (barges compete)*; ≥ 10 hill tiles within 3 → *Hill site* | −5 % / +5 % |
| Town (planks, goods, food, fuel) | population ≥ 2,500 → *Big market*; ≥ 1,200 → *Town market*; < 500 → *Village market* | +10 % / +4 % / −6 % |
| Town | nearest other town ≥ 18 tiles → *Remote town*; ≥ 3 water tiles within 3 → *River town* | +8 % / −4 % |
| Scenario perks | e.g. *Thermal spa* (+20 % passengers) in Bad Füssing | as defined |

Factors depend only on the map and the town populations, so they are the same for every player on a seed, need no save field and change slowly. They are cached on the runtime and refreshed at every month end (towns grow).

### Where cargo goes

An industry's output goes to the reachable acceptor whose receiver **pays best**; at equal prices to the one with the fewest transfers, then the nearest (`chooseFreightDest`). So connecting a second, better-paying plant redirects the flow to it, and the station cargo rows tell you why.

### Balance

The average multiplier over a generated map is close to 1: most producers carry one or two small bonuses, crowded areas carry a malus, and remote plants pay the most. Old saves work unchanged; their revenue simply starts to vary by ±10–30 % per route from the next delivery on.
