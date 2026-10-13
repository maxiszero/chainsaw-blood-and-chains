/* Browser integration: user input only; the exposed game snapshot is read-only. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const URL = process.env.BLOOD_TEST_URL || 'http://127.0.0.1:4317';
const artifacts = path.join(__dirname, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const report = { url: URL, started: new Date().toISOString(), checks: [], errors: [], externalRequests: [], screenshots: [] };
const held = new Set();
let browser, context, page, offline = false;
const state = () => page.evaluate(() => window.__bloodAndChains.state());
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function passed(name, details) { report.checks.push({ name, ...details }); console.log(`PASS ${name}${details ? ` ${JSON.stringify(details)}` : ''}`); }
async function screenshot(name) {
  const file = path.join(artifacts, `${name}.png`);
  await page.screenshot({ path: file });
  report.screenshots.push(file);
}
async function waitPhase(phase, timeout = 20000) {
  await page.waitForFunction(phase => window.__bloodAndChains?.state().phase === phase, phase, { timeout });
  return state();
}
async function movement(next) {
  const wanted = new Set(next);
  for (const key of held) if (!wanted.has(key)) { await page.keyboard.up(key); held.delete(key); }
  for (const key of wanted) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
}
async function skip() { await movement([]); await page.keyboard.press('Enter'); }

async function fightToCompletion() {
  const started = Date.now(), stats = { frames: 0, parryInputs: 0, lightInputs: 0, heavyInputs: 0, specials: 0, minHp: 100, fps: [] };
  let priorPhase = '', bossCaptured = false, phaseTwoCaptured = false, lastLog = 0;
  while (Date.now() - started < 240000) {
    const s = await state();
    if (s.phase !== priorPhase) { console.log(`FLOW ${s.phase} / wave ${s.wave} / kills ${s.kills}`); priorPhase = s.phase; }
    assert.notEqual(s.phase, 'dead', `input-driven player died with ${s.kills} kills`);
    if (s.phase === 'complete') {
      await movement([]);
      assert.ok(s.save.completed);
      assert.equal(s.save.checkpoint, 'complete');
      assert.equal(s.kills, 10);
      assert.equal(await page.locator('#panel').getAttribute('data-panel'), 'victory', 'Enter used to skip ending must not also activate a newly focused victory button');
      stats.realSeconds = Number(((Date.now() - started) / 1000).toFixed(2));
      stats.gameSeconds = Number(s.seconds.toFixed(2));
      stats.rank = s.rank.letter;
      stats.averageFps = Math.round(stats.fps.reduce((a, b) => a + b, 0) / Math.max(1, stats.fps.length));
      delete stats.fps;
      passed('keyboard playthrough completes both waves, boss and ending', stats);
      await screenshot('victory');
      return s;
    }
    if (s.mode === 'cinematic') { await skip(); await wait(120); continue; }
    if (s.mode !== 'play') throw new Error(`Unexpected state during combat: ${s.mode}/${s.phase}`);
    if (s.phase === 'boss' && !bossCaptured) { await screenshot('boss-combat'); bossCaptured = true; }
    if (s.enemies.some(e => e.type === 'boss' && e.phase === 2) && !phaseTwoCaptured) { await screenshot('boss-phase-two'); phaseTwoCaptured = true; }
    const living = s.enemies.filter(e => !e.dead), p = s.player;
    stats.minHp = Math.min(stats.minHp, p.hp); stats.frames++; stats.fps.push(s.fps);
    if (!living.length) { await movement([]); await wait(100); continue; }
    const distance = e => Math.hypot(e.x - p.x, e.z - p.z);
    const target = living.reduce((best, e) => distance(e) < distance(best) ? e : best);
    const threat = living.find(e => e.state === 'windup' && e.timer < .23 && distance(e) < (e.type === 'boss' ? 7 : 3.2));
    if (threat && p.parryCooldown <= 0 && p.dodge === 0) { await page.keyboard.press('q'); stats.parryInputs++; }
    else if (!p.attack && p.parry === 0 && p.dodge === 0 && distance(target) < target.radius + 3.1) {
      if (p.blood >= 35 && p.specialCooldown === 0 && (living.length > 1 || target.state === 'recover')) { await page.keyboard.press('f'); stats.specials++; }
      else if (p.comboStep >= 2 || target.type === 'boss') { await page.keyboard.press('k'); stats.heavyInputs++; }
      else { await page.keyboard.press('j'); stats.lightInputs++; }
    }
    const desired = [];
    if (distance(target) > target.radius + 1.3) {
      const dx = target.x - p.x, dz = target.z - p.z, norm = Math.hypot(dx, dz), yaw = s.camera.yaw;
      const side = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / norm;
      const forward = (-dx * Math.sin(yaw) - dz * Math.cos(yaw)) / norm;
      if (side > .28) desired.push('d'); else if (side < -.28) desired.push('a');
      if (forward > .28) desired.push('w'); else if (forward < -.28) desired.push('s');
      if (norm > 7) desired.push('Shift');
    }
    await movement(desired);
    if (Date.now() - lastLog > 10000) { console.log(`COMBAT hp=${p.hp.toFixed(1)} kills=${s.kills} nearest=${target.type}:${target.hp.toFixed(0)} fps=${s.fps}`); lastLog = Date.now(); }
    await wait(65);
  }
  throw new Error(`Combat timeout: ${JSON.stringify(await state())}`);
}

(async () => {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  page.on('pageerror', error => { report.errors.push(error.message); console.error(`RUNTIME ${error.message}`); });
  page.on('console', message => { if (message.type() === 'error' && !offline) report.errors.push(message.text()); });
  page.on('request', request => { if (!request.url().startsWith(URL) && /^https?:/.test(request.url())) report.externalRequests.push(request.url()); });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await waitPhase('menu');
  await page.waitForFunction(() => window.__bloodAndChains.state().fps > 0);
  await screenshot('menu-1440');
  assert.equal(await page.locator('#play-button').isVisible(), true);
  passed('main menu renders without loading overlay', { initial: await state() });
  await page.setViewportSize({ width: 900, height: 700 });
  await screenshot('menu-900');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, 'menu must not horizontally overflow at 900px');
  await page.setViewportSize({ width: 1440, height: 900 });
  passed('responsive desktop menu fits 900px width');

  await page.locator('#menu [data-panel="settings"]').click();
  await page.locator('#setting-quality').selectOption('low');
  await page.locator('#setting-difficulty').selectOption('easy');
  await page.locator('#setting-shake').uncheck();
  await page.locator('#setting-flashes').uncheck();
  await page.locator('#close-panel').click();
  await page.reload({ waitUntil: 'networkidle' });
  await waitPhase('menu');
  const settings = (await state()).save.settings;
  assert.equal(settings.quality, 'low'); assert.equal(settings.difficulty, 'easy');
  assert.equal(settings.shake, false); assert.equal(settings.flashes, false);
  passed('settings survive a complete browser reload', { settings });

  await page.locator('#play-button').click();
  await waitPhase('intro'); await skip(); await waitPhase('explore');
  await page.keyboard.down('w'); await wait(400); await page.keyboard.up('w');
  await page.keyboard.press('e'); await waitPhase('contract');
  await skip(); await waitPhase('cord');
  assert.equal((await state()).player.transformed, false);
  await page.keyboard.press('r'); await waitPhase('transform');
  await wait(2200); await screenshot('transformation');
  await skip(); await waitPhase('combat');
  assert.equal((await state()).player.transformed, true);
  assert.equal((await state()).save.checkpoint, 'warehouse');
  await screenshot('warehouse-combat');
  passed('opening, Pochita interaction, contract and transformation complete');

  await page.keyboard.press('Escape');
  await page.locator('#panel[data-panel="pause"]').waitFor({ state: 'visible' });
  const beforePause = await state(); await wait(650); const afterPause = await state();
  assert.equal(beforePause.seconds, afterPause.seconds);
  assert.equal(beforePause.player.hp, afterPause.player.hp);
  await page.keyboard.press('Escape');
  assert.equal((await state()).mode, 'play', 'Escape must resume from the pause panel');
  await page.keyboard.press('Escape');
  await page.locator('[data-action="resume"]').click();
  passed('pause freezes simulation and resume returns control');

  console.log('FLOW waiting for natural defeat to verify checkpoint retry');
  await page.waitForFunction(() => window.__bloodAndChains.state().phase === 'dead', null, { timeout: 120000 });
  const death = await state(); assert.equal(death.player.hp, 0);
  await screenshot('death');
  await page.locator('[data-action="retry"]').click();
  await waitPhase('combat');
  const retry = await state(); assert.equal(retry.player.hp, 100); assert.equal(retry.wave, 1); assert.equal(retry.kills, 0);
  passed('natural defeat and checkpoint retry restore a live encounter');

  const victory = await fightToCompletion();
  await page.locator('#panel [data-panel="upgrades"]').click();
  await page.locator('[data-action="upgrade"][data-key="blood"]').click();
  assert.equal((await state()).save.upgrades.blood, 1);
  await page.locator('#close-panel').click();
  // Completion closes the upgrade panel; reload returns to title safely.
  await page.reload({ waitUntil: 'networkidle' });
  await waitPhase('menu');
  const saved = await state();
  assert.equal(saved.save.completed, true); assert.equal(saved.save.kills, 10); assert.equal(saved.save.upgrades.blood, 1);
  assert.equal(saved.save.bestRank, victory.save.bestRank);
  passed('completion, best rank, trophies and purchased upgrade persist');

  await page.locator('#training-button').click();
  await waitPhase('training');
  assert.equal((await state()).training, true); assert.equal((await state()).enemies.length, 2);
  await page.keyboard.press('Space');
  assert.ok((await state()).player.dodgeCooldown > 0, 'Space must route to dodge');
  await wait(520); await page.keyboard.press('q');
  assert.ok((await state()).player.parryCooldown > 0, 'Q must route to parry');
  await page.keyboard.press('Escape'); await page.locator('[data-action="menu"]').click();
  await waitPhase('menu');
  passed('training and return-to-title controls work');

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  offline = true; await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitPhase('menu');
  const offlineState = await state(); assert.equal(offlineState.save.completed, true);
  await page.locator('#training-button').click(); await waitPhase('training');
  assert.equal((await state()).enemies.length, 2);
  const offlineStart = (await state()).player.z;
  await page.keyboard.down('w'); await wait(220); await page.keyboard.up('w');
  assert.ok((await state()).player.z < offlineStart, 'offline play must advance the actual simulation');
  passed('cached game reloads and starts training while offline');

  assert.deepEqual(report.errors, [], 'browser must not emit runtime errors');
  assert.deepEqual(report.externalRequests, [], 'play must not depend on external requests');
  passed('zero runtime errors and zero external asset requests');
})().catch(async error => {
  report.failure = error.stack; console.error(error.stack); process.exitCode = 1;
  if (page) { try { report.failureState = await state(); await screenshot('failure'); } catch (_) {} }
}).finally(async () => {
  report.finished = new Date().toISOString();
  fs.writeFileSync(path.join(artifacts, 'browser-report.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  console.log(`REPORT ${path.join(artifacts, 'browser-report.json')}`);
});
