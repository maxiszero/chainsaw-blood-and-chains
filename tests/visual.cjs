/* Targeted default-high rendering and natural-ending check; keyboard input only. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const URL = process.env.BLOOD_TEST_URL || 'http://127.0.0.1:4317';
const out = path.join(__dirname, 'artifacts');
fs.mkdirSync(out, { recursive: true });
const report = { started: new Date().toISOString(), settings: null, errors: [], samples: [], screenshots: [], limits: 'Single isolated headless Chrome run at 1440 × 900 and device scale 1 on this machine. Not a cross-device performance guarantee.' };
report.sourceSha256 = Object.fromEntries(['main.js', 'models.js', 'combat.js'].map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', 'src', name))).digest('hex')]));
let browser, page;
const held = new Set();
const wait = ms => new Promise(r => setTimeout(r, ms));
const snapshot = () => page.evaluate(() => window.__bloodAndChains.state());
const phase = name => page.waitForFunction(name => window.__bloodAndChains?.state().phase === name, name, { timeout: 20000 });
async function shot(name) { const file = path.join(out, `${name}.png`); await page.screenshot({ path: file }); report.screenshots.push(file); }
async function move(keys) {
  const next = new Set(keys);
  for (const key of held) if (!next.has(key)) { await page.keyboard.up(key); held.delete(key); }
  for (const key of next) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
}
async function skip() { await move([]); await page.keyboard.press('Enter'); }

(async () => {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  page.on('pageerror', e => { report.errors.push(e.message); console.error(`RUNTIME ${e.message}`); });
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.goto(URL, { waitUntil: 'networkidle' }); await phase('menu');
  await page.waitForFunction(() => window.__bloodAndChains.state().fps > 0);
  const initial = await snapshot(); report.settings = initial.save.settings;
  assert.equal(report.settings.quality, 'high'); assert.equal(report.settings.difficulty, 'normal');
  report.graphics = await page.evaluate(() => {
    const gl = document.getElementById('stage').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { width: innerWidth, height: innerHeight, devicePixelRatio, renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  });
  await shot('final-menu-high');
  console.log(`MENU default high/normal, fps=${initial.fps}, calls=${initial.drawCalls}`);
  await page.locator('#play-button').click(); await phase('intro'); await skip(); await phase('explore');
  await page.keyboard.down('w'); await wait(400); await page.keyboard.up('w'); await page.keyboard.press('e');
  await phase('contract'); await skip(); await phase('cord'); await page.keyboard.press('r'); await phase('transform');
  await wait(3200); await shot('final-transformation-high'); await skip(); await phase('combat');

  const start = Date.now(); let sampledAt = 0, loggedAt = 0, combatShot = false, bossShot = false, phaseTwoShot = false;
  while (Date.now() - start < 240000) {
    const s = await snapshot(), p = s.player;
    assert.notEqual(s.phase, 'dead', `high/normal playthrough died with ${s.kills} kills`);
    if (s.phase === 'ending') { await move([]); break; }
    if (s.mode === 'cinematic') { await skip(); await wait(100); continue; }
    assert.equal(s.mode, 'play');
    if (Date.now() - sampledAt >= 1000) {
      report.samples.push({ seconds: Number(s.seconds.toFixed(2)), phase: s.phase, wave: s.wave, fps: s.fps, drawCalls: s.drawCalls, living: s.enemies.filter(e => !e.dead).length });
      sampledAt = Date.now();
    }
    const living = s.enemies.filter(e => !e.dead);
    if (!living.length) { await move([]); await wait(100); continue; }
    const distance = e => Math.hypot(e.x - p.x, e.z - p.z);
    const target = living.reduce((best, e) => distance(e) < distance(best) ? e : best);
    const manga = await page.locator('body').getAttribute('class');
    if (!combatShot && s.phase === 'combat' && distance(target) < 4 && !manga?.includes('manga')) { await shot('final-combat-high'); combatShot = true; }
    if (!bossShot && s.phase === 'boss' && !manga?.includes('manga')) { await shot('final-boss-high'); bossShot = true; }
    if (!phaseTwoShot && s.enemies.some(e => e.type === 'boss' && e.phase === 2) && !manga?.includes('manga')) { await shot('final-boss-enraged-high'); phaseTwoShot = true; }
    const threat = living.find(e => e.state === 'windup' && e.timer < .23 && distance(e) < (e.type === 'boss' ? 7 : 3.2));
    if (threat && p.parryCooldown <= 0 && p.dodge === 0) await page.keyboard.press('q');
    else if (!p.attack && p.parry === 0 && p.dodge === 0 && distance(target) < target.radius + 3.1) {
      if (p.blood >= 35 && p.specialCooldown === 0 && (living.length > 1 || target.state === 'recover')) await page.keyboard.press('f');
      else await page.keyboard.press(p.comboStep >= 2 || target.type === 'boss' ? 'k' : 'j');
    }
    const keys = [];
    if (distance(target) > target.radius + 1.3) {
      const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz), yaw = s.camera.yaw;
      const side = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d, forward = (-dx * Math.sin(yaw) - dz * Math.cos(yaw)) / d;
      if (side > .28) keys.push('d'); else if (side < -.28) keys.push('a');
      if (forward > .28) keys.push('w'); else if (forward < -.28) keys.push('s');
      if (d > 7) keys.push('Shift');
    }
    await move(keys);
    if (Date.now() - loggedAt > 10000) { console.log(`COMBAT high/normal ${s.phase} kills=${s.kills} hp=${p.hp.toFixed(1)} fps=${s.fps} calls=${s.drawCalls}`); loggedAt = Date.now(); }
    await wait(65);
  }
  assert.equal((await snapshot()).phase, 'ending', 'action-driven playthrough must reach the natural ending');
  await page.waitForFunction(() => document.getElementById('speaker').textContent.startsWith('MAKIMA'), null, { timeout: 10000 });
  await wait(800); await shot('ending-makima-high');
  report.ending = { speaker: await page.locator('#speaker').textContent(), subtitle: await page.locator('#dialogue-text').textContent(), snapshot: await snapshot() };
  assert.equal(report.ending.snapshot.phase, 'ending');
  assert.equal(report.ending.snapshot.player.transformed, false);
  await phase('complete'); assert.equal((await snapshot()).save.completed, true);
  await shot('final-victory-high');
  assert.ok(report.samples.length >= 10, 'record at least ten one-second combat performance samples');
  const values = report.samples.map(s => s.fps).sort((a, b) => a - b);
  const calls = report.samples.map(s => s.drawCalls).sort((a, b) => a - b);
  report.performance = { quality: 'high', difficulty: 'normal', samples: values.length, combatSeconds: report.samples.at(-1).seconds - report.samples[0].seconds, fps: { mean: Math.round(values.reduce((a, b) => a + b, 0) / values.length), min: values[0], median: values[Math.floor(values.length / 2)], max: values.at(-1) }, drawCalls: { median: calls[Math.floor(calls.length / 2)], peak: calls.at(-1) } };
  assert.deepEqual(report.errors, []);
  console.log(`PASS HIGH ${JSON.stringify(report.performance)}`);
  console.log('PASS Makima rendered during natural ending and mission completed.');
})().catch(async error => {
  report.failure = error.stack; process.exitCode = 1; console.error(error.stack);
  if (page) { try { report.failureState = await snapshot(); await shot('visual-failure'); } catch (_) {} }
}).finally(async () => {
  report.finished = new Date().toISOString();
  fs.writeFileSync(path.join(out, 'visual-report.json'), JSON.stringify(report, null, 2));
  await browser?.close(); console.log(`REPORT ${path.join(out, 'visual-report.json')}`);
});
