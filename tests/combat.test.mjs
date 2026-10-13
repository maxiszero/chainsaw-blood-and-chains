import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatWorld, moveCircle, rankFor } from '../src/combat.js';

test('movement cannot enter solid crates or leave the arena', () => {
  const p = {x:0,z:0};
  moveCircle(p,3,0,[{x:2,z:0,w:2,d:2}],{minX:-5,maxX:5,minZ:-5,maxZ:5});
  assert.ok(p.x < 0.6);
  moveCircle(p,-20,20,[],{minX:-5,maxX:5,minZ:-5,maxZ:5});
  assert.ok(p.x>=-5 && p.z<=5);
});
test('light chains hit once per swing and heavy after two lights launches', () => {
  const w = new CombatWorld(); w.player.transformed = true; w.player.z=0; w.player.angle=0; w.training=true;
  const e = w.spawn('heavy',0,2); e.hp=1000;
  const swing = a => {w.act(a); for(let i=0;i<45;i++) w.update(1/60,{});};
  swing('light'); const first=e.hp; assert.ok(first<1000 && first>900);
  swing('light'); swing('heavy');
  assert.ok(w.events.some(e=>e.type==='hit'&&e.launch));
});
test('dodge and parry prevent damage only in their defense windows', () => {
  const w = new CombatWorld(); const e=w.spawn('normal',0,1);
  w.act('dodge'); w.damagePlayer(10,e); assert.equal(w.player.hp,100);
  w.player.dodge=0; w.player.invincible=0; w.player.state='idle';
  w.act('parry'); w.damagePlayer(10,e); assert.equal(w.player.hp,100);
  assert.ok(w.events.some(e=>e.type==='parry'));
  w.player.parry=0;w.player.invincible=0;w.damagePlayer(10,e);assert.equal(w.player.hp,90);
});
test('special requires fuel and blood recovery is capped', () => {
  const w = new CombatWorld();w.player.transformed=true;w.player.blood=10;
  assert.equal(w.act('special'),false);
  w.player.blood=100;assert.equal(w.act('special'),true);
  assert.ok(w.player.blood<100);
  w.player.hp=97;w.kill(w.spawn('normal',1,1));assert.equal(w.player.hp,100);
});
test('boss has distinct phases and dies exactly once', () => {
  const w=new CombatWorld(); const e=w.spawn('boss',0,8);e.hp=e.maxHp*.45;
  w.update(.016,{});assert.equal(e.phase,2);
  e.hp=0;w.kill(e);w.kill(e);
  assert.equal(w.events.filter(v=>v.type==='kill'&&v.boss).length,1);
  assert.equal(rankFor(0).letter,'D');assert.equal(rankFor(800).letter,'SSS');
});

test('crowded enemies separate instead of occupying the same body', () => {
  const w=new CombatWorld();w.training=true;
  const a=w.spawn('normal',0,1),b=w.spawn('normal',0,1);
  for(let i=0;i<60;i++)w.update(1/60,{});
  assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>.8);
});
