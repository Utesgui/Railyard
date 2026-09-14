import { Game } from './app/Game';
import { seedFromString } from './core/rng';
import { AUTOSAVE_SLOT, loadFromSlot } from './save/storage';
import { UI } from './ui/UI';

const canvas = document.getElementById('map') as HTMLCanvasElement;
const minimap = document.getElementById('minimap') as HTMLCanvasElement;
const game = new Game(canvas, minimap);

const params = new URLSearchParams(location.search);
const seedParam = params.get('seed');
const auto = seedParam ? null : loadFromSlot(AUTOSAVE_SLOT);
if (auto) game.loadState(auto);
else game.newGame(seedParam ? seedFromString(seedParam) : (Math.random() * 0xffffffff) >>> 0);

const ui = new UI(game);
game.uiUpdate = () => ui.update();
game.start();

// exposed for debugging and the Playwright smoke test
(window as unknown as { __game: unknown }).__game = { game, get state() { return game.state; }, get rt() { return game.rt; }, cmd: game.cmd };
