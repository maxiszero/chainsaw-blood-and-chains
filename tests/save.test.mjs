import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave, loadSave, writeSave, saveKey } from '../src/save.js';

function memoryStorage(initial) {
  const values = new Map(initial === undefined ? [] : [[saveKey, initial]]);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('a new profile has independent settings and upgrade objects', () => {
  const first = defaultSave();
  first.settings.volume = 0;
  first.upgrades.blood = 2;
  assert.equal(defaultSave().settings.volume, 0.55);
  assert.equal(defaultSave().upgrades.blood, 0);
  assert.equal(defaultSave().checkpoint, null);
});

test('checkpoint, combat progress and accessibility settings survive a reload', () => {
  const storage = memoryStorage();
  const save = defaultSave();
  save.checkpoint = 'boss';
  save.bestRank = 5;
  save.kills = 17;
  save.upgrades.blood = 2;
  save.settings = { volume: 0.2, sensitivity: 1.4, quality: 'low', shake: false, flashes: false, difficulty: 'easy' };
  assert.equal(writeSave(save, storage), true);
  assert.deepEqual(loadSave(storage), save);
});

test('corrupt, future-version and nonobject save files restore safe defaults', () => {
  for (const value of ['{broken json', 'null', '[]', 'false', '"profile"', '{"version":99,"checkpoint":"boss"}']) {
    assert.deepEqual(loadSave(memoryStorage(value)), defaultSave());
  }
});

test('untrusted storage is clamped without coercing strings, arrays or booleans', () => {
  const raw = JSON.stringify({
    version: 1, checkpoint: 'not-a-level', completed: 'true', bestRank: 100, kills: -42,
    upgrades: { blood: 100, engine: '2' },
    settings: { volume: -4, sensitivity: 100, quality: 'ultra', shake: 'false', flashes: false, difficulty: 'impossible' },
    injected: 'ignore me',
  });
  const save = loadSave(memoryStorage(raw));
  assert.deepEqual(save, {
    version: 1, checkpoint: null, completed: false, bestRank: 6, kills: 0,
    upgrades: { blood: 3, engine: 0 },
    settings: { volume: 0, sensitivity: 3, quality: 'high', shake: true, flashes: false, difficulty: 'normal' },
  });
});

test('valid partial profiles preserve progress and fill missing fields', () => {
  const save = loadSave(memoryStorage('{"version":1,"checkpoint":"warehouse","kills":4.9,"settings":{"volume":0.8}}'));
  assert.equal(save.checkpoint, 'warehouse');
  assert.equal(save.kills, 4);
  assert.equal(save.settings.volume, 0.8);
  assert.equal(save.settings.sensitivity, 1);
  assert.deepEqual(save.upgrades, { blood: 0, engine: 0 });
});

test('unavailable storage and quota errors never interrupt a running game', () => {
  const blocked = { getItem() { throw new Error('Access denied'); }, setItem() { throw new Error('Quota exceeded'); } };
  assert.deepEqual(loadSave(blocked), defaultSave());
  assert.equal(writeSave(defaultSave(), blocked), false);
  assert.deepEqual(loadSave(null), defaultSave());
  assert.equal(writeSave(defaultSave(), null), false);
});

test('write validates outgoing data and strips non-schema fields', () => {
  const storage = memoryStorage();
  assert.equal(writeSave({ ...defaultSave(), kills: Infinity, bestRank: NaN, extra: 'discard', settings: [] }, storage), true);
  assert.deepEqual(loadSave(storage), defaultSave());
  assert.equal(JSON.parse(storage.getItem(saveKey)).extra, undefined);
});

test('complete checkpoint is retained alongside the completed mission flag', () => {
  const save = { ...defaultSave(), checkpoint: 'complete', completed: true, bestRank: 6 };
  const storage = memoryStorage();
  writeSave(save, storage);
  assert.deepEqual(loadSave(storage), save);
});
