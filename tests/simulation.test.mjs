import assert from 'node:assert/strict';
import { CombatWorld, moveCircle } from '../src/combat.js';

// Run directly: node tests/simulation.test.mjs (no test-runner child process).
const STEP = 1 / 60;
let failures = 0;
const results = [];
function test(name, fn) {
  try { const detail = fn(); results.push({ name, passed: true, ...detail }); console.log(`PASS ${name}${detail ? ` ${JSON.stringify(detail)}` : ''}`); }
  catch (error) { failures++; results.push({ name, passed: false, error: error.message }); console.error(`FAIL ${name}: ${error.stack}`); }
}
function tick(world, seconds, decide = () => ({})) {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) world.update(STEP, decide(world, i) || {});
}
function events(world, type) { return world.events.filter(event => event.type === type); }
function approach(player, enemy, distance = 2.2) {
  const x = enemy.x - player.x, z = enemy.z - player.z, d = Math.hypot(x, z);
  return d > distance ? { x: x / d, z: z / d, sprint: d > 7 } : {};
}

test('a boss retaliates repeatedly against continuous heavy pressure', () => {
  const world = new CombatWorld();
  world.act('transform');
  const boss = world.spawn('boss', 0, 8);
  for (let i = 0; i < 60 * 16 && !boss.dead && world.player.hp > 0; i++) {
    world.act('heavy');
    world.update(STEP, approach(world.player, boss, 3.6));
  }
  const strikes = events(world, 'enemyAttack').length;
  assert.ok(strikes >= 2, `boss struck only ${strikes} time(s); heavy spam must not indefinitely freeze its recovery`);
  assert.ok(events(world, 'hurt').length > 0, 'unopposed boss attacks must threaten the attacker');
  return { strikes, playerHp: world.player.hp, bossHp: boss.hp };
});

test('phase two cycles through slam, sweep and charge with a single transition', () => {
  const world = new CombatWorld({ difficulty: 'easy' });
  const boss = world.spawn('boss', 0, 8);
  boss.hp = boss.maxHp * .45; // Fixture starts just below the phase threshold.
  tick(world, 48, () => {
    if (boss.state === 'windup' && boss.timer < .12) world.act('parry');
    return approach(world.player, boss, 4);
  });
  assert.equal(boss.phase, 2);
  assert.equal(events(world, 'bossPhase').length, 1);
  const attacks = new Set(events(world, 'enemyAttack').map(event => event.attack));
  assert.deepEqual([...attacks].sort(), ['charge', 'slam', 'sweep']);
  return { attacks: [...attacks], strikes: events(world, 'enemyAttack').length };
});

test('enemy groups coordinate at most two simultaneous telegraphs or strikes', () => {
  const world = new CombatWorld({ difficulty: 'easy' });
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    world.spawn(i % 3 === 0 ? 'runner' : 'zombie', Math.cos(a) * 2.1, 12 + Math.sin(a) * 2.1);
  }
  let peak = 0;
  tick(world, 16, () => {
    if (world.enemies.some(enemy => enemy.state === 'windup' && enemy.timer < .12)) world.act('parry');
    const active = world.enemies.filter(enemy => !enemy.dead && ['windup', 'strike'].includes(enemy.state)).length;
    peak = Math.max(peak, active);
    assert.ok(active <= 2, `encounter admitted ${active} simultaneous attacks`);
  });
  assert.equal(peak, 2, 'test must exercise both attack slots');
  assert.ok(events(world, 'telegraph').length >= 6, 'several enemies must have taken turns');
  return { peak, telegraphs: events(world, 'telegraph').length };
});

test('death and kill events occur exactly once and dead actors cannot attack', () => {
  const world = new CombatWorld();
  const enemy = world.spawn('zombie', 0, 10);
  world.hitEnemy(enemy, 1000, { kind: 'heavy' });
  world.hitEnemy(enemy, 1000, { kind: 'heavy' });
  world.kill(enemy);
  assert.equal(events(world, 'kill').length, 1);
  assert.equal(world.kills, 1);
  world.damagePlayer(1000, enemy);
  world.damagePlayer(1000, enemy);
  tick(world, 2);
  assert.equal(events(world, 'death').length, 1);
  assert.equal(world.player.hp, 0);
  assert.equal(world.player.state, 'dead');
  assert.equal(world.act('light'), false);
  assert.equal(world.act('transform'), false);
  assert.equal(events(world, 'enemyAttack').length, 0);
});

test('special requires transformation, sufficient fuel and an expired cooldown', () => {
  const world = new CombatWorld();
  assert.equal(world.act('special'), false, 'human form cannot spend a special');
  assert.equal(world.act('transform'), true);
  world.player.blood = 34.99;
  assert.equal(world.act('special'), false, 'insufficient fuel must reject input');
  assert.equal(world.player.blood, 34.99, 'rejected action must not consume fuel');
  world.player.blood = 35;
  assert.equal(world.act('special'), true);
  assert.equal(world.player.blood, 0);
  tick(world, 1.2);
  world.player.blood = 100;
  assert.equal(world.act('special'), false, 'fuel alone does not bypass cooldown');
  tick(world, 6);
  assert.equal(world.act('special'), true);
  assert.equal(world.player.blood, 65);
});

test('a full-speed dodge and a long displacement cannot tunnel through a thin obstacle', () => {
  const colliders = [{ x: 0, z: 9, w: 4, d: .05 }];
  const world = new CombatWorld({ colliders });
  assert.equal(world.act('dodge'), true);
  tick(world, .55, () => ({ z: -1 }));
  assert.ok(world.player.z >= 9.505 - 1e-8, `dodge crossed obstacle: z=${world.player.z}`);
  const point = { x: 0, z: 12 };
  moveCircle(point, 0, -20, colliders);
  assert.ok(point.z >= 9.505 - 1e-8, `substep displacement crossed obstacle: z=${point.z}`);
  const corner = { x: 16, z: 20 };
  moveCircle(corner, 30, 30, []);
  assert.deepEqual(corner, { x: 17, z: 21 });
});

// This deterministic controller reads enemy telegraphs and sends the same public
// actions as the player. It never writes actor HP, damage, fuel or time scales.
function playEncounter(difficulty) {
  const world = new CombatWorld({ difficulty });
  assert.equal(world.act('transform'), true);
  const waves = [
    [['zombie', -5, 5], ['zombie', 5, 4], ['zombie', 0, -2], ['runner', -4, -7]],
    [['heavy', 0, -8], ['runner', -6, 0], ['runner', 6, 0], ['zombie', 0, 7]],
    [['boss', 0, -13]],
  ];
  let wave = 0, elapsed = 0;
  const spawnWave = () => waves[wave].forEach(args => world.spawn(...args));
  spawnWave();
  const history = [];
  while (elapsed < 240 && world.player.hp > 0 && wave < waves.length) {
    const player = world.player;
    const living = world.enemies.filter(enemy => !enemy.dead);
    if (!living.length) {
      history.push({ wave: wave + 1, time: Number(elapsed.toFixed(2)), hp: Number(player.hp.toFixed(2)) });
      wave++;
      if (wave === waves.length) break;
      spawnWave();
      continue;
    }
    const nearest = living.reduce((best, enemy) => Math.hypot(enemy.x - player.x, enemy.z - player.z) < Math.hypot(best.x - player.x, best.z - player.z) ? enemy : best);
    const dangerous = living.find(enemy => enemy.state === 'windup' && enemy.timer < .14 && Math.hypot(enemy.x - player.x, enemy.z - player.z) < (enemy.type === 'boss' ? 7 : 3.2));
    if (dangerous) world.act('parry');
    else if (!player.attack && player.parry === 0 && player.dodge === 0) {
      const distance = Math.hypot(nearest.x - player.x, nearest.z - player.z);
      if (distance < nearest.radius + 3.1) {
        if (player.blood >= 35 && player.specialCooldown === 0 && (living.length > 1 || nearest.state === 'recover')) world.act('special');
        else world.act(player.comboStep >= 2 || nearest.type === 'boss' ? 'heavy' : 'light');
      }
    }
    world.update(STEP, approach(player, nearest, nearest.radius + 1.25));
    elapsed += STEP;
  }
  assert.equal(wave, waves.length, `${difficulty} controller failed wave ${wave + 1}: hp=${world.player.hp.toFixed(2)}, time=${elapsed.toFixed(2)}, living=${world.enemies.filter(enemy => !enemy.dead).map(enemy => `${enemy.type}:${enemy.hp.toFixed(1)}`).join(',')}`);
  assert.equal(world.kills, 9);
  assert.ok(world.player.hp > 0);
  assert.ok(events(world, 'parry').length > 0, 'playthrough must exercise its defensive timing');
  assert.equal(events(world, 'kill').filter(event => event.boss).length, 1);
  return { seconds: Number(elapsed.toFixed(2)), hp: Number(world.player.hp.toFixed(2)), parries: events(world, 'parry').length, kills: world.kills, history };
}

for (const difficulty of ['easy', 'normal']) test(`${difficulty} action-driven waves and boss are finishable without cheats`, () => playEncounter(difficulty));

console.log(`\n${results.length - failures}/${results.length} simulation checks passed.`);
if (failures) process.exitCode = 1;
