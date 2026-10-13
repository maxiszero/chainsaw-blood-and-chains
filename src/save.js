export const saveKey = 'blood-and-chains.chapter-one.v1';

export function defaultSave() {
  return {
    version: 1,
    checkpoint: null,
    completed: false,
    bestRank: 0,
    kills: 0,
    upgrades: { blood: 0, engine: 0 },
    settings: { volume: 0.55, sensitivity: 1, quality: 'high', shake: true, flashes: true, difficulty: 'normal' },
  };
}

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
const bounded = (value, fallback, min, max) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const choice = (value, values, fallback) => values.includes(value) ? value : fallback;
const boolean = (value, fallback) => typeof value === 'boolean' ? value : fallback;

function sanitize(input) {
  const data = object(input);
  const result = defaultSave();
  if (data.version !== 1) return result;
  const settings = object(data.settings);
  const upgrades = object(data.upgrades);
  result.checkpoint = choice(data.checkpoint, [null, 'intro', 'warehouse', 'boss', 'complete'], null);
  result.completed = boolean(data.completed, false);
  result.bestRank = Math.floor(bounded(data.bestRank, 0, 0, 6));
  result.kills = Math.floor(bounded(data.kills, 0, 0, 999999));
  result.upgrades.blood = Math.floor(bounded(upgrades.blood, 0, 0, 3));
  result.upgrades.engine = Math.floor(bounded(upgrades.engine, 0, 0, 3));
  result.settings.volume = bounded(settings.volume, 0.55, 0, 1);
  result.settings.sensitivity = bounded(settings.sensitivity, 1, 0.2, 3);
  result.settings.quality = choice(settings.quality, ['low', 'medium', 'high'], 'high');
  result.settings.shake = boolean(settings.shake, true);
  result.settings.flashes = boolean(settings.flashes, true);
  result.settings.difficulty = choice(settings.difficulty, ['easy', 'normal', 'hard'], 'normal');
  return result;
}

// Resolve localStorage inside the try: privacy modes can throw on the property getter.
export function loadSave(storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    const raw = target?.getItem(saveKey);
    if (typeof raw !== 'string' || raw.length > 32768) return defaultSave();
    return sanitize(JSON.parse(raw));
  } catch {
    return defaultSave();
  }
}

export function writeSave(data, storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    if (!target || typeof target.setItem !== 'function') return false;
    target.setItem(saveKey, JSON.stringify(sanitize(data)));
    return true;
  } catch {
    return false;
  }
}
