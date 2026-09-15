# Railyard – UI/UX-Audit 2 (nach dem Redesign)

Stand: 15. September 2026, Commit `27f7647` auf `main`. **Umsetzungsstand:** alle Muss- und Sollte-Punkte sowie die Kann-Punkte ohne Schemaänderung sind umgesetzt, siehe Abschnitt „Audit 2 implemented“ in [UI-REDESIGN.md](UI-REDESIGN.md); offen bleiben die dort genannten Grenzen. Vorgänger: [UI-UX-AUDIT.md](UI-UX-AUDIT.md), Umsetzung dokumentiert in [UI-REDESIGN.md](UI-REDESIGN.md).

## Methode und Grenzen

- Gespielt mit Seed 4242 im Chromium-Headless über die echten Werkzeuge (Bahnhof-, Gleiswerkzeug per Maus, Linien und Züge per Command-API): eine Passagierlinie zwischen den zwei nächsten Städten, eine Holzlinie Forst → Sägewerk mit „Vollbeladung“, drei Züge. Drei Spieljahre bei 8×, danach Massenkauf von 25 Zügen auf einer Linie (Geld per Debug-Zugriff) für Stau- und Listentests.
- Alle Panels mit gefüllten Daten, drei Jahresberichte, ein angenommener Auftrag, lange Namen (Bahnhof mit 41 Zeichen, Zug mit 32 Zeichen), Ansichten 1440×900, 1280×720 bei 150 %, 768×640 mit Dialog, 390×844 mit Panel und Toasts.
- Messwerte: `ui.update()` mit offenem Flottenpanel und 28 Zügen 0,03 ms; 61 fps im Leerlauf; drei Spieljahre bei 8× rund 140 s Echtzeit. Keine Konsolenfehler oder -warnungen im gesamten Lauf.
- Code gelesen: HUD, Panels, Dialoge, Eingabe, CSS, Charts, Commands, relevante Sim-Teile (Dwell, Tick, Contracts, Notify).
- Nicht geprüft: Import/Export end-to-end, Touch-Geräte real (nur Code), Bildschirmleser, Browser außer Chromium.

## Kurzfazit

Das Grundgerüst trägt: Panels, Dialoge, Hotkeys, Listen und Empty States verhalten sich konsistent, die Performance ist unkritisch. Was jetzt auffällt, sind weniger Layoutfehler als **Erklärungslücken in der Spielmechanik** (Fracht, die niemand abholen kann; „Served“, obwohl nichts bewegt wird), **Unterbrechungen im Spielfluss** (Jahresbericht, Toast-Stapel) und **fehlende Bulk- und Komfortaktionen** ab etwa zehn Zügen. Dazu kommen einige kleine, konkrete Fehler.

## Muss: Fehler und Irreführungen

| Prio | Befund | Nachweis | Vorschlag |
|---|---|---|---|
| P0 | **Verarbeiter zeigt „Served“ (grün), obwohl 0 % des Outputs bewegt werden.** Die Warnschwelle „< 60 % bewegt“ gilt in `entityPanels.ts` nur für Rohstoffbetriebe (`raw`). | Sägewerk nach 3 Jahren: „Served · 0% of last month's output was moved“, produziert 90, zu Bahnhöfen 0, weil das Bretterlager der Station voll ist. | Schwelle für alle Betriebe anwenden; bei vollem Stationslager eigene Diagnose „Stationslager voll (300/300)“. |
| P0 | **Fracht entsteht für ein Ziel, das kein Zug an diesem Bahnhof transportieren kann.** Bretter am Sägewerksbahnhof „to Bramwell“, 300/300, „never picked up“, Rating 25 %. Die Holzlinie hat nur Holzwagen. Der Spieler sieht das Problem, aber nicht die Ursache. | Station „Westmoor East“, Tab Cargo. | Pro Frachtzeile prüfen, ob eine hier haltende Linie einen Zug mit passender Wagenklasse hat; sonst Badge „Kein Zug auf den Linien hier kann Planks laden (braucht Box Car)“ mit Link zum Depot der Linie. Gleiches Signal in der Linien-Ansicht („Diese Linie kann tragen: Logs“). |
| P1 | **Jahresergebnis-Toast als Warnung, obwohl es nur Investitionen sind.** `tick.ts` meldet `1900 result: -$145,802` rot; der Betrag enthält Bau und Fahrzeugkäufe. | Erstes Jahr mit 4 Bahnhöfen, Gleis und 3 Zügen. | Toast auf Betriebsergebnis umstellen oder „incl. investments“ ergänzen; Warnfarbe nur, wenn das Betriebsergebnis negativ ist. |
| P1 | **Jahresbericht ist modal und pausiert bei jeder Jahresgrenze.** Bei 8× unterbricht er alle ~45 s Echtzeit; im Testlauf dreimal in drei Jahren. | Lauf 1900–1903. | Einstellung „Jahresbericht: Dialog / nur Meldung“; Standard bei Tempo ≥ 4× als Meldung mit „Öffnen“-Button in den Alerts. |
| P1 | **Toast-Stapel verdeckt Panelkopf und Karte.** Vier Toasts übereinander decken bei 1280×720/150 % den Kopf des Zugpanels ab; bei 390 px Breite das obere Drittel des Bildschirms. Gleichlautende Stau-Meldungen („Train 4 …“, „Train 5 …“) kommen einzeln. | Screenshots „scaled-train“, „narrow-fleet“. | Maximal drei Toasts, Container links neben dem Panel statt mittig; gleichartige Meldungen innerhalb von 10 s zusammenfassen („3 trains forced their way out of Westmoor“); bei < 640 px Toasts unten über der Toolbar. |
| P1 | **Alerts-Filter „Money“ ist leer, weil die Simulation die Art `money` nie verwendet.** Der Filter zeigt nur `good` (Erfolge, Jahresergebnis). | `grep 'money' src/sim` trifft nur einen Test. | Filter in „Company“ umbenennen oder Lieferumsätze bewusst nicht als Alerts führen und den Tab streichen. |
| P1 | **Autosave nur alle N Monatsenden; kein Speichern beim Schließen des Tabs.** Bei einem Tab-Wechsel oder Reload gehen bis zu drei Spielmonate verloren. | Kein `beforeunload`/`visibilitychange`-Handler im Code. | Autosave zusätzlich bei `visibilitychange: hidden` und `pagehide` (synchron, < 10 ms). |
| P2 | **„Show“-Button in der Alerts-Liste steht links vom Symbol.** Grid-Platzierung: der Button hat `grid-row: 1 / span 2` ohne Spalte und wird vor den Auto-Elementen in Spalte 1 gesetzt. | Screenshot „alerts-3y“. | `.notif > .btn { grid-column: 3 }`, `.notif .ico { grid-column: 1 }`. |
| P2 | **KPI-Werte brechen um** („110 / 110“ auf zwei Zeilen), sobald vier Kacheln in 420 px stehen. | Zugpanel. | Bei vier KPIs 2×2-Raster erzwingen oder Wert mit `white-space: nowrap` und kleinerer Schrift. |
| P2 | **Begriffe uneinheitlich:** Stau-Meldung sagt „passing loop“, das Werkzeug heißt „Double track“. Fleet-Badge „Waiting“ (Panel) vs. „Blocked“ (Liste) für denselben Zustand nach 60 Ticks. | `dwell.ts:247`, `shared.ts`. | Ein Wort pro Konzept; Glossar in der Hilfe. |
| P2 | **Kartenbeschriftungen überlagern sich:** langer Bahnhofsname liegt über der Stadtbeschriftung „Whitby“. | Screenshot „overview-3y“. | Bahnhofslabel kürzen (Ellipse ab 24 Zeichen) oder bei Kollision versetzen; Vollname im Tooltip. |
| P2 | **„waiting 983 days on average“** für Bretter, die seit Spielbeginn liegen. Korrekt, wirkt aber wie ein Fehler. | Station „Westmoor East“. | Ab 365 Tagen „seit Monat/Jahr“ statt Tage anzeigen. |

## Sollte: Verständlichkeit und Bedienung

- **Warum-Erklärungen an Zuständen.** Die neuen Badges sagen *was* („Blocked“, „No route“), aber selten *warum* und *was tun*. Für die häufigsten Fälle gibt es ableitbare Ursachen: eingleisige Strecke mit ≥ 2 Zügen (Blocked), fehlende Wagenklasse (Fracht bleibt liegen), volles Stationslager, Bahnsteige belegt. Ein einheitliches „Ursache → Aktion“-Muster (Text plus Button, z. B. „Zweites Gleis bauen“ öffnet das Werkzeug) würde die Diagnose abschließen.
- **Aufträge werden übersehen.** Im Testlauf sind fünf Angebote unbeachtet verfallen; sie erscheinen nur als Toast. Der Contracts-Button braucht ein Badge mit offenen Angeboten, die Angebotskarte einen Machbarkeitshinweis („Du bewegst derzeit 0 Planks/Monat; Ziel Whitby hat einen Bahnhof auf Linie …“).
- **Abriss ist kantenweise.** Ein Gleis mit 30 Kanten braucht 30 Klicks. Vorschlag: Abriss segmentweise wie beim Zweigleis-Werkzeug (Knoten zu Knoten) mit Vorschau und Erstattungssumme, plus „Rückgängig“ für den letzten Bau innerhalb von 30 Sekunden zu 100 % (Command: gemerkte Kantenliste, nur wenn kein Zug sie belegt hat).
- **Linien-Editor: Einfügen an Position.** `addStop(lineId, stationId, at)` existiert, die UI hängt nur an. Ein „+ hier einfügen“ zwischen zwei Stopps (oder Auswahl des aktiven Stopps, nach dem eingefügt wird) macht Umleitungen ohne Löschen möglich.
- **Kartenlinien als Luftlinie.** Weiterhin verwirrend, wenn die Strecke einen Bogen fährt. Entweder gepufferte Routenpfade zeichnen (Cache pro Linienabschnitt, nur bei Gleisänderung neu) oder das Overlay standardmäßig nur bei geöffnetem Linienpanel zeigen.
- **Depot bei vielen gleichen Zügen.** „Noch einmal kaufen“ (gleiche Zusammenstellung, gleiche Linie) direkt aus dem Zugpanel, Mengenfeld „×3“ im Depot, und im Flottenpanel Mehrfachauswahl für „alle Loks dieser Linie ersetzen“ (nutzt `quoteRefit` je Zug, zeigt Gesamtsumme vorher).
- **Bahnhofsdiagnose vor dem Bau.** Die Vorschau nennt jetzt Städte/Industrien. Ergänzen: „Bahnsteige reichen für N Züge/Tag“ lässt sich nicht seriös ableiten, aber „nächster Bahnhof auf dem Netz: 14 Felder“ und ob die Fläche bereits durch einen anderen Bahnhof abgedeckt ist (Konkurrenz um dieselbe Industrie).
- **Fleet-Filter feiner.** „Problems“ mischt No route, Blocked, Broken, Past lifespan. Nach Ursache gruppieren (Chips mit Zählern) und im Fleet-KPI „Problems“ auf den Chip verlinken.
- **Tooltips auf Touch.** Chart-Tooltips (SVG `<title>`) und Button-Titel existieren auf Touch nicht. Die Datentabelle deckt Charts ab; für Buttons fehlen Beschriftungen bei < 640 px (Toolbar ist icon-only, Long-Press-Titel gibt es nicht). Vorschlag: bei icon-only-Toolbar `aria-label` als sichtbaren Tooltip beim Long-Press oder ein einblendbares Label.
- **Pinch-Zoom fehlt.** `input.ts` verarbeitet nur Wheel- und Pointer-Events; auf Touch gibt es Pan, aber keinen Zoom außer über die Tasten `+`/`−`, die auf dem Handy nicht existieren. Zwei-Finger-Pinch über Pointer-Events oder ± Buttons in der Minimap-Ecke.
- **Tastatur auf der Karte.** Entitäten sind nur über Listen erreichbar, nicht per Tastatur auf der Karte. Minimal: `Enter` auf dem gehoverten Feld im Inspect-Modus selektiert; Pfeiltasten bewegen die Kamera bereits.

## Kann: Ausbau mit vorhandenen Daten

- **Liniendiagramm der Auslastung** je Linie (Stichproben je Abfahrt sind vorhanden: `loadSum/loadCount` je Monat, aber nur der Monatswert wird gespeichert; eine 12-Monats-Historie bräuchte ein Schemafeld).
- **Bahnhofsverkehr über Zeit.** `pickedUp*`/`delivered*` gibt es nur für zwei Monate; eine kleine Historie (12 Monate, per Cargo summiert) wäre eine Schemaänderung, aber die Grundlage für „lohnt sich der Ausbau“.
- **Städte-Übersicht** als Liste (Bevölkerung, Wachstumspunkte, versorgte Güter) analog zur Flotte, mit Sortierung nach ungenutztem Potenzial („groß, aber kein Bahnhof“).
- **Industrie-Übersicht** mit Kette: Rohstoff → Verarbeiter → Stadt, Status je Stufe (bedient / nicht bedient), als eigenes Panel „Industries“.
- **Vergleich zweier Züge/Linien** (zwei Spalten) für Kaufentscheidungen; die Kennzahlen sind alle vorhanden.
- **Ziele/Objectives** über Erfolge hinaus: ein Tutorial-Anschluss („Erste Frachtkette“, „Erster Umsteigehub“) als Karten mit Fortschritt, aus bestehenden Stats ableitbar.
- **Speicherstände mit Vorschau**: Datum, Geld, Züge, Seed im Slot; alles im Save enthalten.
- **Fahrzeug-Zeitleiste**: welche Loks wann kommen und gehen (`intro`/`retire` sind Daten), damit Spieler Ersatz planen.

## Technik und Wartbarkeit

- **i18n ist halb genutzt.** Rund 105 `t()`-Aufrufe gegenüber etwa 330 hart kodierten englischen UI-Strings in `src/ui`. Solange nur Englisch existiert, ist das unkritisch; eine Übersetzung wäre aber ein Großumbau. Entweder konsequent auf `t()` umstellen (mechanisch möglich) oder die i18n-Schicht offiziell als „nur Strukturvorbereitung“ dokumentieren.
- **Panel-Update-Keys sind handgeschrieben.** Sie funktionieren, sind aber fehleranfällig (siehe Chart-Labels im ersten Audit). Ein kleines Hilfsmuster `keyed(container, key, render)` würde die Wiederholung in 12 Panels reduzieren.
- **`window.__game.ui` ist jetzt Teil der Testoberfläche.** Gut für E2E, sollte im README als Debug-API erwähnt werden.
- **E2E-Lücken.** Kein Test für Bahnhofs-Tabs, Aufträge (annehmen/ablehnen), Finanztabelle, Speichern/Laden über die UI, Jahresbericht, Insolvenzdialog, Narrow-Layout. Screenshot-Vergleiche gibt es nur manuell.
- **Bundle** 207 kB JS (70 kB gzip), keine Runtime-Abhängigkeiten. Unkritisch.

## Empfohlene Reihenfolge

1. P0/P1 aus der Tabelle: Verarbeiter-Status, Wagenklassen-Diagnose an Bahnhof und Linie, Jahres-Toast/Dialog, Toast-Stapel, Autosave beim Verlassen, Alerts-Layout. Ein Nachmittag, keine Schemaänderung.
2. Auftrags-Badge und Machbarkeitshinweis, segmentweiser Abriss mit Undo, Stopp-Einfügen, „Noch einmal kaufen“.
3. Touch (Pinch, sichtbare Labels), Fleet-Filter nach Ursache, Kartenlabels.
4. Übersichten (Städte, Industrien, Fahrzeug-Zeitleiste) und die Historien, die ein Schemafeld brauchen, als eigener Schritt mit Migration.
