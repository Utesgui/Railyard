import type { Game } from '../app/Game';
import { countEdges } from '../track/graph';

interface Step {
  text: string;
  done: (game: Game) => boolean;
}

const STEPS: Step[] = [
  { text: 'Welcome! Press T and lay track between two nearby towns: click a start tile, then the end tile.', done: (g) => countEdges(g.state.world) > 0 },
  { text: 'Press S and place a station next to each town, inside the highlighted square (on or beside the track).', done: (g) => g.state.stations.length >= 2 },
  { text: 'Press L, create a new line and click both stations on the map to add them as stops.', done: (g) => g.state.lines.some((l) => l.stops.length >= 2) },
  { text: 'Open the line and buy a train: a locomotive plus a few coaches and a mail van.', done: (g) => g.state.trains.length >= 1 },
  { text: 'Press 3 or 4 to speed up. Click a station to see waiting cargo and ratings, F for finances. Have fun!', done: (g) => g.state.tick > 30 * 45 && g.state.trains.length >= 1 },
];

/** Returns the current tutorial hint text, advancing the step as goals are met. */
export function tutorialText(game: Game): string {
  const s = game.state;
  if (s.tutorialStep < 0 || s.tutorialStep >= STEPS.length) return '';
  while (s.tutorialStep >= 0 && s.tutorialStep < STEPS.length && STEPS[s.tutorialStep].done(game)) s.tutorialStep++;
  if (s.tutorialStep >= STEPS.length) {
    s.tutorialStep = -1;
    return '';
  }
  return `${s.tutorialStep + 1}/${STEPS.length} · ${STEPS[s.tutorialStep].text}`;
}

export function dismissTutorial(game: Game): void {
  game.state.tutorialStep = -1;
}
