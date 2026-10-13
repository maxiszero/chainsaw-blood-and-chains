import * as THREE from '../vendor/three.module.js';
import {createWorld} from './world.js';
import {createDenji,createPochita,createZombie,createZombieBoss,createMakima} from './models.js';
import {CombatWorld,rankFor,clamp} from './combat.js';
import {ActionCamera,CinematicDirector} from './camera.js';
import {Effects} from './effects.js';
import {AudioDirector} from './audio.js';
import {loadSave,writeSave} from './save.js';
import {Panels} from './panels.js';

const $=id=>document.getElementById(id);
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas:$('stage'),antialias:true,powerPreference:'high-performance'});}
catch(e){$('load-label').textContent='WebGL 2 is unavailable. Enable hardware acceleration and reopen in Chrome or Edge.';throw e;}
renderer.setClearColor(0x111a1b);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.4;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x10191a);scene.fog=new THREE.FogExp2(0x152227,.022);
const camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,150);
const environment=createWorld(scene),denji=createDenji(),pochita=createPochita();scene.add(denji.group,pochita.group);
const makima=createMakima();scene.add(makima.group);makima.group.visible=false;
const heroLight=new THREE.PointLight(0xffc486,12,13,1.8);heroLight.position.set(3,4,7);scene.add(heroLight);
const rimLight=new THREE.PointLight(0xf0582c,10,10,1.7);rimLight.position.set(-2,2,2);scene.add(rimLight);
const effects=new Effects(scene),audio=new AudioDirector(),follow=new ActionCamera(camera);
let save=loadSave(),mode='menu',phase='menu',pausedMode='play',training=false,world=null,lockTarget=null;
let totalTime=0,missionTime=0,wave=0,waveTimer=0,toastTime=0,mangaTime=0,impactTime=0,hurtTime=0,hitstop=0,bossStartPending=false;
let muted=false,mouseDrag=false,gameHasStarted=false,firstTransform=false,trainingRespawn=0,noteRead=false,guideTime=0,scriptedPose={};
const keys=new Set(),actors=new Map(),enemyPool={normal:[],runner:[],heavy:[],boss:[]};
const cinematic=new CinematicDirector(camera,(speaker,text)=>{$('speaker').textContent=speaker;$('dialogue-text').textContent=text;});
const panels=new Panels(()=>save,handlePanelAction);
const ringGeometry=new THREE.RingGeometry(.83,1,60);ringGeometry.rotateX(-Math.PI/2);
const markerMat=new THREE.MeshBasicMaterial({color:0xe68f3f,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false});
const marker=new THREE.Mesh(ringGeometry,markerMat);scene.add(marker);
const markerLight=new THREE.PointLight(0xffa33c,1.3,4);scene.add(markerLight);
const ledger=new THREE.Group();ledger.position.set(-10,0,7);scene.add(ledger);
const ledgerStand=new THREE.Mesh(new THREE.BoxGeometry(.9,.75,.65),new THREE.MeshStandardMaterial({color:0x463c2d,roughness:.9}));ledgerStand.position.y=.375;ledgerStand.castShadow=true;ledger.add(ledgerStand);
environment.colliders.push({x:-10,z:7,w:.9,d:.65});
const ledgerCanvas=document.createElement('canvas');ledgerCanvas.width=256;ledgerCanvas.height=320;const ledgerCtx=ledgerCanvas.getContext('2d');ledgerCtx.fillStyle='#c1b594';ledgerCtx.fillRect(0,0,256,320);ledgerCtx.fillStyle='#402c22';ledgerCtx.font='bold 30px serif';ledgerCtx.fillText('DEBT RECORD',13,45);ledgerCtx.font='18px monospace';['DENJI','Interest / unpaid','Balance / unpaid','Due / yesterday','-----------------','A life, on paper.'].forEach((v,i)=>ledgerCtx.fillText(v,17,85+i*33));const ledgerTex=new THREE.CanvasTexture(ledgerCanvas);ledgerTex.colorSpace=THREE.SRGBColorSpace;
const ledgerPage=new THREE.Mesh(new THREE.PlaneGeometry(.47,.59),new THREE.MeshBasicMaterial({map:ledgerTex,side:THREE.DoubleSide}));ledgerPage.rotation.x=-Math.PI/2;ledgerPage.position.y=.758;ledger.add(ledgerPage);

function setMode(next){mode=next;document.body.dataset.mode=next;keys.clear();mouseDrag=false;if(next==='cinematic'){$('toast').classList.remove('show');toastTime=0;}if(next!=='play'&&document.pointerLockElement)document.exitPointerLock();audio.pause(next==='pause');}
function persist(){if(!writeSave(save))toast('Local saving is unavailable in this browser. Progress lasts for this session.',6);$('play-label').textContent=save.checkpoint&&save.checkpoint!=='complete'?'CONTINUE STORY':save.completed?'REPLAY STORY':'BEGIN STORY';}
function toast(message,seconds=3){$('toast').textContent=message;$('toast').classList.add('show');toastTime=seconds;}
function manga(word,caption,seconds=.5){if(!save.settings.flashes)return;$('manga-word').textContent=word;$('manga-caption').textContent=caption;document.body.classList.add('manga');mangaTime=seconds;}
function flash(strength=.4){if(save.settings.flashes)impactTime=strength;}
function quality(){const q=save.settings.quality;renderer.setPixelRatio(Math.min(devicePixelRatio,q==='low'?1:q==='medium'?1.25:1.65));renderer.shadowMap.enabled=q!=='low';resize();}
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
addEventListener('resize',resize);quality();audio.setVolume(save.settings.volume);persist();

function makeActor(enemy){
  let actor=enemyPool[enemy.type]?.pop();
  if(!actor){const model=enemy.type==='boss'?createZombieBoss():createZombie(enemy.type);const material=new THREE.MeshBasicMaterial({color:0xe94e29,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false});const telegraph=new THREE.Mesh(ringGeometry,material);scene.add(model.group,telegraph);actor={model,telegraph,baseScale:model.group.scale.clone()};}
  actor.model.group.visible=true;actor.model.group.scale.copy(actor.baseScale);actor.model.update(1,{dead:false,time:totalTime});actor.telegraph.visible=false;actor.enemy=enemy;actors.set(enemy.id,actor);
}
function releaseActor(id){const a=actors.get(id);if(!a)return;a.model.group.visible=false;a.telegraph.visible=false;enemyPool[a.enemy.type].push(a);actors.delete(id);}
function clearActors(){for(const id of [...actors.keys()])releaseActor(id);effects.clear();}
function initWorld(){clearActors();environment.reset();scene.fog.color.set(0x152227);makima.group.visible=false;ledger.visible=true;scriptedPose={};world=new CombatWorld({colliders:environment.colliders,bounds:environment.bounds,difficulty:save.settings.difficulty,upgrades:save.upgrades});lockTarget=null;wave=0;waveTimer=0;bossStartPending=false;missionTime=0;noteRead=false;guideTime=0;trainingRespawn=0;firstTransform=false;}
function syncPlayer(){const p=world.player;denji.group.position.set(p.x,p.y,p.z);denji.group.rotation.set(0,p.angle,0);denji.group.scale.setScalar(1);denji.setTransformed(p.transformed);}
function spawn(type,x,z){const e=world.spawn(type,x,z);makeActor(e);return e;}
function checkpoint(value){if(training)return;save.checkpoint=value;persist();toast('CHECKPOINT SAVED',1.8);}

async function startGame(kind='new'){
  panels.close();await audio.start();audio.setVolume(save.settings.volume);gameHasStarted=true;training=kind==='training';initWorld();pochita.group.visible=false;marker.visible=false;denji.group.visible=true;
  if(training){
    phase='training';world.player.transformed=true;world.player.z=5;spawn('normal',-3,-3);spawn('heavy',3,-3);follow.reset(world.player);syncPlayer();setMode('play');toast('TRAINING  /  Practice combos, parries and perfect dodges. Health regenerates.',5);environment.setCombat(true);return;
  }
  const resume=kind==='continue'?save.checkpoint:null;
  if(resume==='boss'){world.player.transformed=true;world.player.z=8;syncPlayer();spawnBoss();return;}
  if(resume==='warehouse'){world.player.transformed=true;syncPlayer();startCombat();return;}
  world.player.x=0;world.player.z=10;world.player.angle=Math.PI;world.player.transformed=false;syncPlayer();pochita.group.visible=true;pochita.group.position.set(-1.4,0,7);pochita.group.rotation.y=.3;environment.setCombat(false);phase='intro';checkpoint('intro');setMode('cinematic');
  cinematic.start([
    {duration:5,from:[11,6,19],to:[7,3.8,14],target:[0,1,4],speaker:'DENJI',text:'Rain again. Another job. Another payment that barely makes a dent.'},
    {duration:5,from:[-3,1.2,8],to:[-2.4,.8,8.6],target:[-1.4,.45,7],speaker:'DENJI',text:'One day, Pochita. A warm bed. Bread with something on it.'},
    {duration:4.5,from:[2,2.7,7.2],to:[1.4,2.3,7.5],target:[0,1.6,10],speaker:'DENJI',text:'Just a normal life. That doesn’t sound like much, does it?'}
  ],()=>{phase='explore';setMode('play');follow.reset(world.player);toast('WASD to move · Mouse drag to look · E to talk to Pochita',5);});
}
function contract(){
  phase='contract';world.player.x=0;world.player.z=7.5;world.player.angle=Math.PI;syncPlayer();spawn('normal',-2.2,6.3);spawn('normal',2.3,5.7);spawn('heavy',0,4);setMode('cinematic');
  cinematic.start([
    {duration:4.3,from:[4,2,2],to:[2,1.9,4],target:[0,1.1,7.5],speaker:'DENJI',text:'The job was a trap. They had already made their deal with a devil.',onEnter:()=>{audio.play('boss');scriptedPose={dead:true,hurt:1};effects.burst(0,1,7.5,0x872b21,35,1);}},
    {duration:5,from:[-2,.7,6.5],to:[-1.4,.6,6],target:[-1.4,.5,7],speaker:'POCHITA',text:'I always loved hearing about your dreams.',onEnter:()=>{scene.fog.color.set(0x35433b);clearActors();}},
    {duration:5,from:[1,1.6,5.5],to:[.8,1.3,6],target:[-.5,1,7.5],speaker:'POCHITA',text:'I’ll be your heart. In return… show me what happens next.'}
  ],()=>{scene.fog.color.set(0x152227);scriptedPose={};clearActors();world.enemies=[];denji.group.rotation.z=0;pochita.group.visible=false;phase='cord';world.player.z=9;syncPlayer();follow.reset(world.player);setMode('play');toast('A new heartbeat. Press R to pull the starter cord.',5);});
}
function transform(){
  if(phase!=='cord')return;phase='transform';setMode('cinematic');const p=world.player,x=p.x,z=p.z;let ignited=false;
  cinematic.start([
    {duration:1.8,from:[x+.9,1.7,z-1.4],to:[x+.55,1.4,z-1],target:[x,1.35,z],fov:39,speaker:'',text:'',onEnter:()=>audio.play('step'),update:t=>{scriptedPose={transform:t};}},
    {duration:1.3,from:[x+.8,2.2,z-1.5],to:[x+2.5,2.6,z-3.5],target:[x,1.7,z],fov:48,onEnter:()=>{scriptedPose={};p.transformed=true;denji.setTransformed(true);audio.play('ignite');effects.burst(x,1.8,z,0xe43c23,90,2);flash(.65);manga('ギャアア','PULL. THE. CORD.',.45);ignited=true;}},
    {duration:2.6,from:[x+3.3,1.4,z-4.5],to:[x+4.2,2.4,z-5.3],target:[x,1.4,z],fov:47,speaker:'DENJI',text:'If you’re gonna get in the way of our dreams…',update:t=>{if(t<.7)effects.burst(x,1.3,z,0xffa043,2,.5);}}
  ],()=>{scriptedPose={};if(!ignited)audio.play('ignite');p.transformed=true;denji.setTransformed(true);firstTransform=true;startCombat();});
}
function startCombat(){
  phase='combat';world.player.transformed=true;pochita.group.visible=false;denji.setTransformed(true);environment.setCombat(true);setMode('play');follow.reset(world.player);wave=0;nextWave();checkpoint('warehouse');toast('LMB / J: light · RMB / K: heavy · SPACE: dodge · Q: parry',6);
}
function nextWave(){wave++;waveTimer=0;if(wave===1){spawn('normal',-4,0);spawn('normal',4,-1);spawn('runner',0,-5);spawn('normal',-6,-7);}else{spawn('heavy',0,-9);spawn('runner',-7,-5);spawn('runner',7,-5);spawn('normal',-4,-13);spawn('normal',5,-13);toast('MORE ARE COMING  /  Heavy attacks break their guard',4);audio.play('boss');}for(const e of world.enemies.filter(e=>!e.dead))effects.burst(e.x,.4,e.z,0x7e8070,18,.6);}
function spawnBoss(){
  phase='bossIntro';world.player.transformed=true;world.player.hp=Math.max(75,world.player.hp);world.player.blood=Math.max(65,world.player.blood);syncPlayer();checkpoint('boss');const boss=spawn('boss',0,-12);boss.timer=1.5;environment.setCombat(true);setMode('cinematic');
  cinematic.start([
    {duration:3.1,from:[-8,1,-4],to:[-5,2,-6],target:[0,2.7,-12],speaker:'ZOMBIE DEVIL',text:'A heart that keeps beating. How annoying.',onEnter:()=>{audio.play('boss');effects.shockwave(0,-12,0xb73328,7);}},
    {duration:2.4,from:[3.5,4.7,-6],to:[3,4,-7],target:[0,3.8,-12],speaker:'',text:'',onEnter:()=>manga('死','THE ZOMBIE DEVIL',.7)}
  ],()=>{phase='boss';setMode('play');follow.reset(world.player);lockTarget=boss;toast('Watch the red telegraphs. Dodge the slam. Punish the recovery.',5);});
}
function victory(){
  phase='ending';setMode('cinematic');audio.play('victory');const p=world.player;Object.assign(p,{attack:null,buffer:null,speed:0,state:'idle',dodge:0,parry:0,hurt:0});const boss=world.enemies.find(e=>e.type==='boss');
  manga('斬','I STILL HAVE DREAMS.',1.1);effects.burst(boss.x,2.8,boss.z,0xb72b21,100,2);effects.shockwave(boss.x,boss.z,0xffad65,10);
  cinematic.start([
    {duration:3.6,from:[p.x+4,2.1,p.z-4],to:[p.x+2.7,1.4,p.z-2.8],target:[p.x,1.5,p.z],speaker:'DENJI',text:'A heartbeat. Mine. Ours.'},
    {duration:5.2,from:[-2,2.3,12.5],to:[-1.2,2,14.3],target:[0,1.55,17],speaker:'MAKIMA / PUBLIC SAFETY',text:'Come with me. There’s a warm meal waiting.',onEnter:()=>{p.transformed=false;denji.setTransformed(false);environment.setCombat(false);makima.group.visible=true;makima.group.position.set(0,0,17);makima.group.rotation.y=Math.PI;heroLight.position.set(1,3,15);}},
    {duration:4,from:[p.x+1.8,2,p.z+2.4],to:[p.x+1.4,1.9,p.z+1.9],target:[p.x,1.7,p.z],speaker:'DENJI',text:'…What’s for breakfast?'}
  ],()=>{
    save.checkpoint='complete';save.completed=true;save.bestRank=Math.max(save.bestRank,rankFor(world.maxStyle).index);save.kills+=world.kills;persist();phase='complete';setMode('pause');panels.show('victory',{rank:rankFor(world.maxStyle),kills:world.kills,seconds:missionTime});
  });
}
function menu(){panels.close();cinematic.active=false;clearActors();world=null;training=false;phase='menu';scene.fog.color.set(0x152227);makima.group.visible=false;ledger.visible=false;scriptedPose={};setMode('menu');denji.group.visible=true;denji.group.position.set(2.7,0,5);denji.group.rotation.set(0,-.3,0);denji.group.scale.setScalar(1.5);denji.setTransformed(true);pochita.group.visible=true;pochita.group.position.set(1.25,0,6.3);pochita.group.rotation.y=-.45;environment.setCombat(false);marker.visible=false;markerLight.intensity=0;heroLight.position.set(4,3.5,9);rimLight.position.set(2,2.8,3.5);lockTarget=null;persist();}
function pause(kind='pause'){if(mode!=='play'&&mode!=='cinematic')return;pausedMode=mode;setMode('pause');panels.show(kind);}
function resume(){panels.close();setMode(pausedMode);}
function retry(){startGame(training?'training':save.checkpoint==='boss'?'continue':save.checkpoint==='warehouse'?'continue':'new');}
function handlePanelAction(action,data={}){
  if(action==='close'){
    if(mode!=='pause')panels.close();
    else if(phase==='dead')panels.show('death');
    else if(phase==='complete')panels.show('victory',{rank:rankFor(world.maxStyle),kills:world.kills,seconds:missionTime});
    else if(panels.kind==='pause')resume();
    else panels.show('pause');
    return;
  }
  if(action==='start')startGame('new');else if(action==='continue')startGame('continue');else if(action==='training')startGame('training');else if(action==='resume')resume();else if(action==='retry')retry();else if(action==='menu')menu();
  else if(action==='setting'){save.settings[data.key]=data.value;persist();audio.setVolume(save.settings.volume);if(data.key==='quality')quality();if(world)world.difficulty=save.settings.difficulty;}
  else if(action==='fullscreen'){if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>toast('Fullscreen is unavailable in this preview. Open in your browser.'));}
  else if(action==='upgrade'){const key=data.key,used=(save.upgrades.blood+save.upgrades.engine)*4;if(['blood','engine'].includes(key)&&save.upgrades[key]<3&&save.kills-used>=4){save.upgrades[key]++;persist();audio.play('ui');}}
}

$('play-button').addEventListener('click',()=>startGame(save.checkpoint&&save.checkpoint!=='complete'?'continue':'new'));
$('training-button').addEventListener('click',()=>startGame('training'));
document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>{audio.play('ui');panels.show(b.dataset.panel);}));
$('sound-button').addEventListener('click',async()=>{await audio.start();muted=!muted;audio.setMuted(muted);$('sound-button').querySelector('span').textContent=muted?'SOUND OFF':'SOUND ON';$('sound-button').setAttribute('aria-pressed',String(muted));});
$('pause-button').addEventListener('click',()=>pause());$('skip-cinematic').addEventListener('click',()=>cinematic.finish());
const controls={KeyJ:'light',KeyK:'heavy',Space:'dodge',KeyQ:'parry',KeyF:'special'};
addEventListener('keydown',e=>{
  if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;
  if(e.code==='Escape'){if($('panel').open)return;e.preventDefault();if(mode==='play'||mode==='cinematic')pause();return;}
  if($('panel').open)return;
  if(mode==='cinematic'&&e.code==='Enter'){e.preventDefault();e.stopPropagation();cinematic.finish();return;}
  if(mode!=='play')return;
  if(['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  keys.add(e.code);if(e.repeat)return;
  if(e.code==='KeyE')interact();else if(e.code==='KeyR'){if(phase==='cord')transform();else if(world&&!world.player.transformed&&world.act('transform')){audio.play('ignite');denji.setTransformed(true);}}
  else if(e.code==='KeyC'){const alive=world.enemies.filter(v=>!v.dead);lockTarget=lockTarget?null:alive.sort((a,b)=>Math.hypot(a.x-world.player.x,a.z-world.player.z)-Math.hypot(b.x-world.player.x,b.z-world.player.z))[0]||null;toast(lockTarget?'TARGET LOCKED':'FREE CAMERA',1);}
  else if(e.code==='Tab'){pause('controls');}
  else if(controls[e.code]&&['combat','boss','training'].includes(phase))world.act(controls[e.code]);
});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('blur',()=>{keys.clear();if(mode==='play')pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(mode==='play'||mode==='cinematic'))pause();});
$('stage').addEventListener('contextmenu',e=>e.preventDefault());
$('stage').addEventListener('mousedown',e=>{if(mode!=='play')return;mouseDrag=true;if(['combat','boss','training'].includes(phase)){if(e.button===0)world.act('light');if(e.button===2)world.act('heavy');}if(e.button===1){e.preventDefault();$('stage').requestPointerLock?.();}});
addEventListener('mouseup',()=>mouseDrag=false);
addEventListener('mousemove',e=>{if(mode==='play'&&(mouseDrag||document.pointerLockElement)&&!lockTarget)follow.rotate(e.movementX,e.movementY,save.settings.sensitivity);});
$('stage').addEventListener('wheel',e=>{if(mode==='play'){e.preventDefault();follow.distance=clamp(follow.distance+e.deltaY*.004,4.5,10);}},{passive:false});
function interact(){if(phase==='explore'&&Math.hypot(world.player.x+1.4,world.player.z-7)<3.1)contract();else if(phase==='explore'&&!noteRead&&Math.hypot(world.player.x+10,world.player.z-7)<2){noteRead=true;toast('DEBT LEDGER  /  A lifetime of payments. Never a life of his own.',6);}}

function processEvents(){
  for(const ev of world.events){
    if(ev.type==='attack'){audio.play(ev.kind==='special'?'finisher':ev.kind);}
    else if(ev.type==='swing'){
      effects.slash(ev.x,ev.z,ev.angle,ev.kind!=='light');
      if(ev.kind==='special'){effects.shockwave(ev.x,ev.z,0xff7842,6);follow.shake=.6;manga('斬','RIP & TEAR',.28);}
      for(const prop of environment.destructibles){if(prop.hp<=0)continue;const dx=prop.x-ev.x,dz=prop.z-ev.z;if(Math.hypot(dx,dz)<ev.reach+prop.radius&&Math.cos(Math.atan2(dx,dz)-ev.angle)>-.2){prop.hp-=ev.kind==='light'?18:55;effects.burst(prop.x,.8,prop.z,0xaf8b60,15,1);if(prop.hp<=0){prop.mesh.visible=false;world.player.blood=clamp(world.player.blood+7,0,100);effects.burst(prop.x,.8,prop.z,0xb5a07b,30,2);toast('SALVAGED  +7 BLOOD',1);}}}
    }else if(ev.type==='hit'){
      effects.burst(ev.enemy.x,1.3+ev.enemy.y,ev.enemy.z,0x972d26,22,1.5);effects.burst(ev.enemy.x,1.5+ev.enemy.y,ev.enemy.z,0xffaf60,12,1.8);hitstop=ev.kind==='heavy'?.075:.035;follow.shake=ev.kind==='heavy'?.65:.32;
      if(ev.launch)toast('LAUNCHER  /  Follow with light attacks',1.6);
    }else if(ev.type==='kill'){
      audio.play('death');effects.burst(ev.enemy.x,1.2,ev.enemy.z,0x9f3228,25,1.5);if(ev.boss){bossStartPending=false;victory();break;}
    }else if(ev.type==='dodge')audio.play('dodge');
    else if(ev.type==='parry'){audio.play('parry');effects.burst(world.player.x,1.5,world.player.z,0xffe8b0,65,2);effects.shockwave(world.player.x,world.player.z,0xffd587,3);manga('弾','PERFECT PARRY',.24);toast('PERFECT PARRY  /  Counter now',1.5);follow.shake=.3;hitstop=.12;}
    else if(ev.type==='perfectDodge'){audio.play('dodge');toast('PERFECT DODGE  +8 BLOOD',1.5);}
    else if(ev.type==='hurt'){audio.play('hurt');hurtTime=.6;follow.shake=.5;}
    else if(ev.type==='death'){if(training){world.player.hp=100;world.player.state='idle';world.player.invincible=2;}else{phase='dead';pausedMode='play';setMode('pause');panels.show('death');}}
    else if(ev.type==='enemyAttack'){audio.play(ev.enemy.type==='boss'?'boss':'heavy');if(ev.attack==='slam'){effects.shockwave(ev.enemy.x,ev.enemy.z,0xba704d,5.8);effects.burst(ev.enemy.x,.2,ev.enemy.z,0xab9b7f,40,2);follow.shake=.45;}}
    else if(ev.type==='bossPhase'){audio.play('boss');toast('ENRAGED  /  Shorter openings. Stay close. Keep moving.',4);manga('怒','IT ISN’T OVER.',.4);}
  }
  world.events.length=0;
}

function updateActors(dt){
  if(!world)return;const p=world.player;
  syncPlayer();denji.update(dt,{time:totalTime,speed:p.speed/7.3,attack:p.attack?p.attackTime/p.attack.duration:0,attackStep:p.attack?.step||0,attackType:p.attack?.kind||'light',dodge:p.dodge/.42,parry:p.parry/.48,hurt:p.hurt/.4,dead:p.hp<=0,transformed:p.transformed,...scriptedPose});
  for(const [id,a] of actors){const e=a.enemy;const g=a.model.group;
    g.position.set(e.x,e.y,e.z);g.rotation.y=e.angle;
    const attack=e.state==='windup'?.15*(1-e.timer/e.windup):e.state==='strike'?.5:e.state==='recover'?.8:0;
    a.model.update(dt,{time:totalTime,speed:e.state==='chase'?.55:0,attack,attackType:e.attack==='slam'?'heavy':'light',hurt:e.hurt/.26,dead:e.dead});
    if(e.dead){const s=Math.max(0,1-Math.max(0,e.deathTime-1.8)*1.2);g.scale.copy(a.baseScale).multiplyScalar(s);if(e.deathTime>3)releaseActor(id);}
    a.telegraph.visible=e.state==='windup'&&!e.dead;
    if(a.telegraph.visible){
      const radius=e.type==='boss'?(e.attack==='slam'?5.8:e.attack==='sweep'?6.1:3.4):e.radius+1.5;
      a.telegraph.position.set(e.x,.04,e.z);a.telegraph.scale.set(radius,1,radius);a.telegraph.material.opacity=.28+(1-e.timer/e.windup)*.6;
      a.telegraph.material.color.set(e.timer<.22?0xffc670:0xde3527);
    }
  }
}
function updateHud(){
  const p=world.player,boss=world.enemies.find(e=>e.type==='boss'&&!e.dead),rank=rankFor(world.style);
  $('health-fill').style.width=p.hp+'%';$('health-value').textContent=Math.ceil(p.hp)+' / 100';$('blood-fill').style.width=p.blood+'%';$('blood-value').textContent=Math.floor(p.blood);$('form-label').textContent=p.transformed?'HYBRID / CHAINSAW DEVIL':'HUMAN / DEVIL HUNTER';
  const combat=['combat','boss','training'].includes(phase);$('rank').style.display=combat&&world.combo>0?'block':'none';$('rank-letter').textContent=rank.letter;$('rank-name').textContent=rank.name;$('combo-count').textContent=world.combo;
  $('boss-hud').style.display=boss&&phase==='boss'?'block':'none';if(boss){$('boss-fill').style.width=Math.max(0,boss.hp/boss.maxHp*100)+'%';$('boss-phase').textContent=boss.phase===2?'PHASE II / ENRAGED':'THE DEAD DON’T DREAM';}
  const objectives={explore:['Find Pochita','Approach your companion and press E.'],cord:['Pull the cord','Press R. Give your dreams a heartbeat.'],combat:['Clear the warehouse',`Horde ${wave} / 2  ·  ${world.enemies.filter(e=>!e.dead).length} remaining`],boss:['Kill the Zombie Devil','Dodge the red telegraphs. Strike during recovery.'],training:['Make every cut count','Health regenerates. Use Q just before an attack lands.']};
  const obj=objectives[phase]||['The warehouse',''];$('objective').textContent=obj[0];$('objective-detail').textContent=obj[1];$('mission-label').textContent=training?'PUBLIC SAFETY / TRAINING':'PROLOGUE / THE WAREHOUSE';
  $('special-label').style.display=combat?'block':'none';$('special-label').style.opacity=p.blood>=35&&p.specialCooldown<=0?'1':'.4';$('special-label').querySelector('span').textContent=p.specialCooldown>0?`${Math.ceil(p.specialCooldown)}s COOLDOWN`:'35 BLOOD';
  const near=phase==='explore'&&Math.hypot(p.x+1.4,p.z-7)<3.1,nearLedger=phase==='explore'&&!noteRead&&Math.hypot(p.x+10,p.z-7)<2,prompt=$('context-prompt');prompt.style.display=near||nearLedger||phase==='cord'?'flex':'none';prompt.querySelector('kbd').textContent=phase==='cord'?'R':'E';prompt.querySelector('span').textContent=phase==='cord'?'Pull the starter cord':nearLedger?'Read the debt ledger':'Talk to Pochita';
  if(lockTarget?.dead)lockTarget=null;$('lock-reticle').style.display=lockTarget?'block':'none';if(lockTarget){const v=new THREE.Vector3(lockTarget.x,lockTarget.type==='boss'?3.4:1.6,lockTarget.z).project(camera);$('lock-reticle').style.left=(v.x*.5+.5)*innerWidth+'px';$('lock-reticle').style.top=(-v.y*.5+.5)*innerHeight+'px';}
}
function updatePlay(dt){
  const side=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
  const movement=follow.movement(side,forward);world.update(dt,{...movement,sprint:keys.has('ShiftLeft')||keys.has('ShiftRight')});missionTime+=dt;guideTime+=dt;
  processEvents();if(mode!=='play')return;
  if(phase==='combat'&&world.enemies.every(e=>e.dead)){
    waveTimer+=dt;if(waveTimer>2.4){if(wave<2)nextWave();else if(!bossStartPending){bossStartPending=true;spawnBoss();return;}}
  }
  if(training){world.player.hp=clamp(world.player.hp+dt*10,0,100);world.player.blood=clamp(world.player.blood+dt*6,0,100);if(world.enemies.every(e=>e.dead)){trainingRespawn+=dt;if(trainingRespawn>2){spawn('normal',-3,world.player.z-5);spawn('heavy',3,world.player.z-6);trainingRespawn=0;}}}
  if(phase==='combat'&&guideTime>15&&guideTime<15+dt*1.5)toast('Try J → J → K to launch enemies. F unleashes Rip & Tear.',5);
  updateActors(dt);world.enemies=world.enemies.filter(e=>!e.dead||e.deathTime<3.1);follow.update(dt,world.player,lockTarget,environment.colliders,save.settings.shake);updateHud();
  marker.visible=phase==='explore';marker.position.set(-1.4,.025,7);marker.scale.setScalar(.85+Math.sin(totalTime*2)*.07);markerLight.position.set(-1.4,1,7);markerLight.intensity=marker.visible?1.3:0;
  if(pochita.group.visible){pochita.update(dt,{time:totalTime,speed:0});pochita.group.rotation.y=Math.atan2(world.player.x+1.4,world.player.z-7);}
  heroLight.position.set(world.player.x+2,4,world.player.z+1.5);rimLight.position.set(world.player.x-1,2.2,world.player.z-2.5);
}
let previous=performance.now(),fpsAccum=0,frames=0,measuredFps=0;
function frame(now){
  requestAnimationFrame(frame);const raw=Math.min((now-previous)/1000,.06);previous=now;totalTime+=raw;fpsAccum+=raw;frames++;if(fpsAccum>1){measuredFps=frames/fpsAccum;fpsAccum=0;frames=0;}
  if(toastTime>0){toastTime-=raw;if(toastTime<=0)$('toast').classList.remove('show');}if(mangaTime>0){mangaTime-=raw;if(mangaTime<=0)document.body.classList.remove('manga');}
  impactTime=Math.max(0,impactTime-raw*3);hurtTime=Math.max(0,hurtTime-raw*1.8);$('impact').style.opacity=impactTime;$('damage-wash').style.opacity=hurtTime;
  let dt=raw;if(hitstop>0){hitstop-=raw;dt=raw*.05;}
  if(mode==='menu'){
    const sway=Math.sin(totalTime*.13);camera.position.set(5.4+sway*.25,2.35,11.25);camera.lookAt(camera.aspect<1.1?1:.25,1.6,4.3);camera.fov=44;camera.updateProjectionMatrix();denji.update(dt,{time:totalTime,speed:0,transformed:true});pochita.update(dt,{time:totalTime,speed:0});
  }else if(mode==='play')updatePlay(dt);
  else if(mode==='cinematic'){cinematic.update(raw);if(world)updateActors(dt);if(pochita.group.visible)pochita.update(dt,{time:totalTime});if(makima.group.visible)makima.update(dt,{time:totalTime});}
  if(mode!=='pause'){environment.update(dt,totalTime);effects.update(dt);}
  audio.update(raw,{combat:mode==='play'&&['combat','boss','training'].includes(phase),transformed:mode!=='menu'&&!!world?.player.transformed,moving:mode==='play'&&(world?.player.speed||0)>.1,intensity:clamp((world?.style||0)/300,0,1)});
  renderer.render(scene,camera);
}

Object.defineProperty(window,'__bloodAndChains',{value:Object.freeze({state:()=>({mode,phase,mission:phase,training,wave,seconds:missionTime,fps:Math.round(measuredFps),drawCalls:renderer.info.render.calls,player:world?{...world.player,attack:world.player.attack?{...world.player.attack}:null}:null,enemies:world?world.enemies.map(e=>({...e})):[],kills:world?.kills||0,rank:rankFor(world?.maxStyle||0),save:JSON.parse(JSON.stringify(save)),camera:{yaw:follow.yaw,pitch:follow.pitch},cinematic:cinematic.active})}),writable:false});
menu();requestAnimationFrame(frame);
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
$('stage').addEventListener('webglcontextlost',e=>{e.preventDefault();if(mode==='play')pause();toast('Graphics context lost. Reload the page to resume your saved checkpoint.',15);});
