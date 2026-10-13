export const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export const angleDelta = (a,b) => Math.atan2(Math.sin(b-a),Math.cos(b-a));
export function rankFor(score) {
  const ranks = [[0,'D','DREAMER'],[30,'C','CHAOTIC'],[90,'B','BRUTAL'],[180,'A','ANARCHY'],[310,'S','SAVAGE'],[500,'SS','SLAUGHTER'],[760,'SSS','CHAINSAW LEGEND']];
  let i=0;while(i<ranks.length-1&&score>=ranks[i+1][0])i++;
  return {index:i,letter:ranks[i][1],name:ranks[i][2]};
}

export function moveCircle(p,dx,dz,colliders=[],bounds={minX:-17,maxX:17,minZ:-21,maxZ:21},radius=.48) {
  // Substeps prevent tunneling during lunges, dodges and long frames.
  const n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.3));
  const blocked=(x,z)=>colliders.some(c=>{
    const cx=clamp(x,c.x-c.w/2,c.x+c.w/2),cz=clamp(z,c.z-c.d/2,c.z+c.d/2);
    return Math.hypot(x-cx,z-cz)<radius;
  });
  for(let i=0;i<n;i++){
    const x=clamp(p.x+dx/n,bounds.minX,bounds.maxX);if(!blocked(x,p.z))p.x=x;
    const z=clamp(p.z+dz/n,bounds.minZ,bounds.maxZ);if(!blocked(p.x,z))p.z=z;
  }
}

const LIGHT=[{duration:.43,hit:.16,damage:23,reach:2.8,arc:1.65,lunge:1.8},{duration:.47,hit:.19,damage:27,reach:3,arc:1.85,lunge:1.8},{duration:.58,hit:.24,damage:36,reach:3.2,arc:2.3,lunge:2.1}];
export class CombatWorld {
  constructor({colliders=[],bounds,difficulty='normal',upgrades={}}={}) {
    this.colliders=colliders;this.bounds=bounds;this.difficulty=difficulty;this.upgrades=upgrades;
    this.player={x:0,z:12,y:0,angle:Math.PI,hp:100,maxHp:100,blood:100,transformed:false,state:'idle',stateTime:0,attack:null,attackTime:0,buffer:null,comboStep:0,comboTimer:0,dodge:0,dodgeCooldown:0,dodgeX:0,dodgeZ:-1,parry:0,parryCooldown:0,invincible:0,hurt:0,specialCooldown:0,speed:0};
    this.enemies=[];this.events=[];this.time=0;this.style=0;this.maxStyle=0;this.hits=0;this.kills=0;this.combo=0;this.comboAge=0;this.nextId=1;this.attackSpacing=0;this.lastMove={x:0,z:-1};this.training=false;
  }
  emit(type,data={}){this.events.push({type,...data});}
  spawn(type,x,z){
    const config=type==='boss'?{hp:720,speed:1.3,radius:2.5,damage:24}:type==='heavy'?{hp:125,speed:1.05,radius:.72,damage:19}:type==='runner'?{hp:54,speed:3.1,radius:.45,damage:9}:{hp:72,speed:1.6,radius:.5,damage:12};
    const e={id:this.nextId++,type,x,z,y:0,angle:0,hp:config.hp,maxHp:config.hp,speed:config.speed,radius:config.radius,damage:config.damage,state:'idle',timer:.4+(this.nextId%4)*.25,attack:'swipe',phase:1,dead:false,stagger:0,launched:0,hurt:0,deathTime:0,attacks:0,targetX:0,targetZ:0};
    this.enemies.push(e);this.emit('spawn',{enemy:e});return e;
  }
  act(action){
    const p=this.player;if(p.hp<=0)return false;
    if(action==='transform'){
      if(p.transformed||p.blood<25)return false;
      p.transformed=true;this.emit('transform');return true;
    }
    if(action==='dodge'){
      if(p.dodgeCooldown>0||p.parry>.3)return false;
      p.attack=null;p.buffer=null;p.dodge=.42;p.dodgeCooldown=.72;p.invincible=.33;
      p.dodgeX=this.lastMove.x;p.dodgeZ=this.lastMove.z;p.state='dodge';this.emit('dodge');return true;
    }
    if(action==='parry'){
      if(p.parryCooldown>0||p.dodge>0)return false;
      p.attack=null;p.buffer=null;p.parry=.48;p.parryCooldown=.72;p.state='parry';this.emit('guard');return true;
    }
    if(!['light','heavy','special'].includes(action))return false;
    if(p.dodge>.13||p.parry>.12)return false;
    if(p.attack){if(p.attackTime>.11)p.buffer=action;return false;}
    if(action==='special'&&(!p.transformed||p.blood<35||p.specialCooldown>0))return false;
    const nearest=this.enemies.filter(e=>!e.dead).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
    if(nearest&&Math.hypot(nearest.x-p.x,nearest.z-p.z)<6)p.angle=Math.atan2(nearest.x-p.x,nearest.z-p.z);
    let a;
    if(action==='light')a={...LIGHT[p.comboStep%3],kind:action,step:p.comboStep%3,launch:false};
    else if(action==='heavy')a={duration:.85,hit:.36,damage:p.comboStep>=2?70:48,reach:3.7,arc:2,kind:action,launch:p.comboStep>=2,lunge:2.8};
    else {a={duration:1.1,hit:.4,damage:115,reach:6.5,arc:Math.PI,kind:action,launch:false,lunge:0};p.blood-=35;p.specialCooldown=7;}
    p.attack=a;p.attackTime=0;p.state='attack';p.stateTime=0;p.parry=0;
    this.emit('attack',{kind:a.kind,step:a.step||0,launch:a.launch});return true;
  }
  hitEnemy(e,damage,attack={}){
    if(e.dead)return;
    e.hp-=damage;e.hurt=.26;
    if(e.type!=='boss')e.stagger=attack.kind==='heavy'?1:.45;
    if(attack.launch&&e.type!=='boss'){e.launched=1.2;e.stagger=1.3;}
    const p=this.player,dist=Math.max(.1,Math.hypot(e.x-p.x,e.z-p.z));
    if(e.type!=='boss')moveCircle(e,(e.x-p.x)/dist*(attack.kind==='heavy'?.75:.18),(e.z-p.z)/dist*(attack.kind==='heavy'?.75:.18),this.colliders,this.bounds,e.radius);
    this.combo++;this.hits++;this.comboAge=0;this.style+=attack.kind==='special'?34:attack.kind==='heavy'?22:10;this.maxStyle=Math.max(this.maxStyle,this.style);
    p.blood=clamp(p.blood+(p.transformed?2:6),0,100);
    this.emit('hit',{enemy:e,damage,launch:!!attack.launch,kind:attack.kind,combo:this.combo});
    if(e.hp<=0)this.kill(e);
  }
  kill(e){
    if(e.dead)return;e.dead=true;e.hp=0;e.state='dead';e.deathTime=0;this.kills++;
    this.player.hp=clamp(this.player.hp+5+(this.upgrades.blood||0)*2,0,100);
    this.player.blood=clamp(this.player.blood+9,0,100);this.style+=24;
    this.emit('kill',{enemy:e,boss:e.type==='boss'});
  }
  damagePlayer(amount,enemy){
    const p=this.player;if(p.hp<=0)return;
    if(p.invincible>0){
      if(p.dodge>.19&&!p.perfectDodge){p.perfectDodge=true;this.style+=24;p.blood=clamp(p.blood+8,0,100);this.emit('perfectDodge');}
      return;
    }
    if(p.parry>0){
      if(p.parry>.21){enemy.stagger=1.8;enemy.state='recover';enemy.timer=1.8;this.style+=35;p.blood=clamp(p.blood+15,0,100);this.emit('parry',{enemy});}
      else{p.blood=clamp(p.blood-8,0,100);this.emit('block');}
      p.invincible=.2;return;
    }
    const scale=this.difficulty==='easy'?.55:this.difficulty==='hard'?1.4:1;
    p.hp=clamp(p.hp-amount*scale,0,100);p.invincible=.65;p.hurt=.4;p.attack=null;p.buffer=null;this.style=Math.max(0,this.style-45);this.combo=0;
    this.emit('hurt',{amount});if(p.hp<=0){p.state='dead';this.emit('death');}
  }
  update(dt,input={}){
    dt=Math.min(dt,.05);this.time+=dt;this.attackSpacing-=dt;this.comboAge+=dt;
    if(this.comboAge>3.5){this.combo=0;this.style=Math.max(0,this.style-dt*8);}
    const p=this.player;p.stateTime+=dt;
    for(const k of ['invincible','hurt','dodgeCooldown','parryCooldown','specialCooldown','parry','comboTimer'])p[k]=Math.max(0,p[k]-dt);
    if(p.comboTimer===0&&!p.attack)p.comboStep=0;
    let mx=input.x||0,mz=input.z||0;const len=Math.hypot(mx,mz);if(len>1){mx/=len;mz/=len;}
    if(len>.01)this.lastMove={x:mx/(Math.hypot(mx,mz)||1),z:mz/(Math.hypot(mx,mz)||1)};
    if(p.hp>0){
      if(p.dodge>0){p.dodge=Math.max(0,p.dodge-dt);moveCircle(p,p.dodgeX*12*dt,p.dodgeZ*12*dt,this.colliders,this.bounds);p.speed=10;if(p.dodge===0){p.state='idle';p.perfectDodge=false;}}
      else{
        const speed=(input.sprint?7.3:4.5)*(p.attack?.28:1)*(p.parry>0?.3:1)*(p.hurt>0?.5:1);
        const tx=mx*speed,tz=mz*speed;p.speed=Math.hypot(tx,tz);
        moveCircle(p,tx*dt,tz*dt,this.colliders,this.bounds);
        if(len>.08&&!p.attack)p.angle+=angleDelta(p.angle,Math.atan2(mx,mz))*Math.min(1,dt*15);
        if(!p.attack)p.state=p.parry>0?'parry':len>.08?'run':'idle';
      }
      if(p.attack){
        const a=p.attack;p.attackTime+=dt;
        if(p.attackTime<a.hit+.04)moveCircle(p,Math.sin(p.angle)*a.lunge*dt,Math.cos(p.angle)*a.lunge*dt,this.colliders,this.bounds);
        if(p.attackTime>=a.hit&&!a.hitDone){
          a.hitDone=true;
          for(const e of this.enemies){
            if(e.dead)continue;const dx=e.x-p.x,dz=e.z-p.z,dist=Math.hypot(dx,dz);
            if(dist<a.reach+e.radius&&Math.abs(angleDelta(p.angle,Math.atan2(dx,dz)))<a.arc){
              const dmg=a.damage*(p.transformed?1:.48)*(e.type==='boss'&&e.state==='recover'?1.3:1);
              this.hitEnemy(e,dmg,a);
            }
          }
          this.emit('swing',{x:p.x,z:p.z,angle:p.angle,reach:a.reach,kind:a.kind});
        }
        if(p.attackTime>=a.duration){
          p.comboStep=a.kind==='light'?p.comboStep+1:0;p.comboTimer=1.15;p.attack=null;p.state='idle';
          const buffered=p.buffer;p.buffer=null;if(buffered)this.act(buffered);
        }
      }
      if(p.transformed&&this.enemies.some(e=>!e.dead))p.blood=Math.max(0,p.blood-dt*(1.2-(this.upgrades.engine||0)*.2));
    }
    for(const e of this.enemies)this.updateEnemy(e,dt);
    // Keep a horde readable: bodies yield to one another without changing attacks.
    const living=this.enemies.filter(e=>!e.dead&&e.launched===0);
    for(let i=0;i<living.length;i++)for(let j=i+1;j<living.length;j++){
      const a=living[i],b=living[j],dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz),min=a.radius+b.radius+.12;
      if(d>=min)continue;
      const nx=d>.001?dx/d:Math.cos(a.id*2.4),nz=d>.001?dz/d:Math.sin(a.id*2.4),push=(min-d)*Math.min(.45,dt*8);
      if(a.type!=='boss')moveCircle(a,-nx*push,-nz*push,this.colliders,this.bounds,a.radius);
      if(b.type!=='boss')moveCircle(b,nx*push,nz*push,this.colliders,this.bounds,b.radius);
    }
    // Resolve crowded bodies without trapping the player against the boss.
    for(const e of this.enemies){
      if(e.dead||e.launched>0)continue;const dx=p.x-e.x,dz=p.z-e.z,d=Math.hypot(dx,dz),min=e.radius+.4;
      if(d<min&&d>.01&&p.dodge===0)moveCircle(p,dx/d*(min-d)*.35,dz/d*(min-d)*.35,this.colliders,this.bounds);
    }
    this.maxStyle=Math.max(this.maxStyle,this.style);
  }
  updateEnemy(e,dt){
    if(e.dead){e.deathTime+=dt;return;}
    e.hurt=Math.max(0,e.hurt-dt);e.stagger=Math.max(0,e.stagger-dt);e.launched=Math.max(0,e.launched-dt);e.y=e.launched>0?Math.sin((1-e.launched/1.2)*Math.PI)*2.6:0;
    if(e.stagger>0)return;
    const p=this.player;if(p.hp<=0)return;
    const dx=p.x-e.x,dz=p.z-e.z,dist=Math.hypot(dx,dz),dir=Math.atan2(dx,dz),boss=e.type==='boss';
    if(boss&&e.hp<e.maxHp*.5&&e.phase===1){e.phase=2;this.emit('bossPhase');}
    e.timer-=dt;
    if(e.state==='windup'){
      if(e.attack!=='charge')e.angle+=angleDelta(e.angle,dir)*Math.min(1,dt*2);
      if(e.timer<=0){
        e.state='strike';e.timer=e.attack==='charge'?.6:.2;e.didHit=false;
        if(e.attack==='charge'){e.chargeAngle=Math.atan2(e.targetX-e.x,e.targetZ-e.z);}
        this.emit('enemyAttack',{enemy:e,attack:e.attack});
      }
    }else if(e.state==='strike'){
      if(e.attack==='charge')moveCircle(e,Math.sin(e.chargeAngle)*18*dt,Math.cos(e.chargeAngle)*18*dt,this.colliders,this.bounds,e.radius);
      const nowDist=Math.hypot(p.x-e.x,p.z-e.z);
      const range=e.attack==='slam'?5.8:e.attack==='sweep'?6.1:e.attack==='charge'?3.4:e.radius+1.6;
      if(!e.didHit&&nowDist<range&&(e.attack==='slam'||Math.abs(angleDelta(e.angle,dir))<2)){
        e.didHit=true;this.damagePlayer(e.damage+(e.attack==='slam'?7:0),e);
      }
      if(e.timer<=0){e.state='recover';e.timer=boss?(e.phase===2?1.05:1.55):1.1;}
    }else if(e.state==='recover'){
      if(e.timer<=0){e.state='chase';e.timer=.2;}
    }else{
      e.angle+=angleDelta(e.angle,dir)*Math.min(1,dt*5);
      const reach=boss?4.7:e.radius+1.3;
      if(dist>reach){
        const flank=!boss&&dist<6?Math.sin(e.id*2.3)*.5:0;
        const speed=e.speed*(e.phase===2?1.25:1);
        moveCircle(e,Math.sin(dir+flank)*speed*dt,Math.cos(dir+flank)*speed*dt,this.colliders,this.bounds,e.radius);
        e.state='chase';
      }
      if(dist<(boss?12:reach+.4)&&e.timer<=0&&this.attackSpacing<=0&&!this.training){
        const active=this.enemies.filter(o=>!o.dead&&(o.state==='windup'||o.state==='strike')).length;
        if(active<2){
          e.attacks++;e.attack=boss?(dist>7?'charge':['slam','sweep','charge'][e.attacks%3]):'swipe';
          e.state='windup';e.windup=boss?(e.attack==='charge'?1.15:e.phase===2?.8:1.15):e.type==='runner'?.6:.9;e.timer=e.windup;
          e.targetX=p.x;e.targetZ=p.z;this.attackSpacing=.4;this.emit('telegraph',{enemy:e,attack:e.attack});
        }
      }
    }
  }
}
