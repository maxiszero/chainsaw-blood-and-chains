import test from 'node:test';
import assert from 'node:assert/strict';
import { Panels } from '../src/panels.js';
import { defaultSave } from '../src/save.js';
import { CinematicDirector, ActionCamera } from '../src/camera.js';
import { PerspectiveCamera } from '../vendor/three.module.js';

function panelController(kind, data = {}) {
  const panels = Object.create(Panels.prototype);
  const save = defaultSave();
  panels.kind = kind;
  panels.data = data;
  panels.dialog = { open: true };
  panels.content = { contains: () => true };
  panels.getSave = () => save;
  panels.actions = [];
  panels.onAction = (name, value) => panels.actions.push({ name, value });
  panels.show = (next, nextData = {}) => { panels.kind = next; panels.data = nextData; };
  return panels;
}

test('dismissing a terminal result returns to the title instead of an empty paused screen', () => {
  for (const kind of ['victory', 'death']) {
    const panels = panelController(kind);
    panels.dismiss();
    assert.equal(panels.actions[0].name, 'menu');
  }
});

test('closing a child panel returns to the result and preserves its statistics', () => {
  const rank = { letter: 'S', name: 'SAVAGE' };
  const panels = panelController('upgrades', { back: 'victory', rank, kills: 10, seconds: 95 });
  panels.dismiss();
  assert.equal(panels.kind, 'victory');
  assert.deepEqual(panels.data, { back: undefined, rank, kills: 10, seconds: 95 });
  assert.equal(panels.actions.length, 0);
});

test('a pause dismissal delegates to the game so it can resume the correct mode', () => {
  const panels = panelController('pause');
  panels.dismiss();
  assert.equal(panels.actions[0].name, 'close');
});

test('buying an upgrade preserves the return screen while refreshing earned currency', () => {
  const panels = panelController('upgrades', { back: 'pause' });
  const save = panels.getSave();
  save.kills = 8;
  panels.onAction = (name, data) => { if (name === 'upgrade') save.upgrades[data.key]++; };
  const button = { dataset: { action: 'upgrade', key: 'blood' }, disabled: false };
  panels.handleClick({ target: { closest: () => button } });
  assert.equal(save.upgrades.blood, 1);
  assert.equal(panels.kind, 'upgrades');
  assert.equal(panels.data.back, 'pause');
  assert.equal(save.kills - 4 * (save.upgrades.blood + save.upgrades.engine), 4);
});

test('skipping a cinematic twice invokes the completion transition exactly once', () => {
  let completions = 0;
  const cinematic = new CinematicDirector(new PerspectiveCamera(), () => {});
  cinematic.start([{ duration: 4, from: [0, 2, 3], target: [0, 1, 0] }], () => completions++);
  cinematic.finish();
  cinematic.finish();
  cinematic.update(1);
  assert.equal(completions, 1);
  assert.equal(cinematic.active, false);
});

test('mouse sensitivity scales camera yaw and pitch consistently', () => {
  const normal = new ActionCamera(new PerspectiveCamera());
  const precise = new ActionCamera(new PerspectiveCamera());
  normal.rotate(20, 20, 1);
  precise.rotate(20, 20, 0.5);
  assert.ok(Math.abs(precise.yaw * 2 - normal.yaw) < 1e-8);
  assert.ok(Math.abs((precise.pitch - 0.4) * 2 - (normal.pitch - 0.4)) < 1e-8);
});
