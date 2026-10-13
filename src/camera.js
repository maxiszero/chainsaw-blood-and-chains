import * as THREE from '../vendor/three.module.js';
import {angleDelta,clamp} from './combat.js';
export class ActionCamera {
  constructor(camera){this.camera=camera;this.yaw=0;this.pitch=.4;this.distance=7.3;this.focus=new THREE.Vector3(0,1.3,12);this.ready=false;this.shake=0;}
  reset(p){this.focus.set(p.x,1.3,p.z);this.ready=false;this.yaw=0;this.pitch=.4;}
  rotate(x,y,sensitivity=1){this.yaw-=x*.0025*sensitivity;this.pitch=clamp(this.pitch+y*.002*sensitivity,.12,.95);}
  movement(side,forward){return {x:side*Math.cos(this.yaw)-forward*Math.sin(this.yaw),z:-side*Math.sin(this.yaw)-forward*Math.cos(this.yaw)};}
  update(dt,p,target,colliders,shakeAllowed=true){
    if(target){const aim=Math.atan2(p.x-target.x,p.z-target.z);this.yaw+=angleDelta(this.yaw,aim)*Math.min(1,dt*4);}
    const f=new THREE.Vector3(p.x,1.35,p.z);if(target){f.x+=(target.x-p.x)*.14;f.z+=(target.z-p.z)*.14;f.y=target.type==='boss'?2:1.4;}
    this.focus.lerp(f,this.ready?1-Math.exp(-dt*11):1);
    const distance=target?.type==='boss'?Math.max(this.distance,9):this.distance;
    const desired=new THREE.Vector3(this.focus.x+Math.sin(this.yaw)*distance*Math.cos(this.pitch),this.focus.y+Math.sin(this.pitch)*distance,this.focus.z+Math.cos(this.yaw)*distance*Math.cos(this.pitch));
    desired.x=clamp(desired.x,-17.7,17.7);desired.z=clamp(desired.z,-22,22);
    const ray=new THREE.Ray(this.focus,new THREE.Vector3().subVectors(desired,this.focus).normalize()),point=new THREE.Vector3();
    for(const c of colliders){const box=new THREE.Box3(new THREE.Vector3(c.x-c.w/2-.2,0,c.z-c.d/2-.2),new THREE.Vector3(c.x+c.w/2+.2,3.1,c.z+c.d/2+.2));if(ray.intersectBox(box,point)&&point.distanceTo(this.focus)<desired.distanceTo(this.focus)){desired.copy(point).addScaledVector(ray.direction,-.35);}}
    this.camera.position.lerp(desired,this.ready?1-Math.exp(-dt*9):1);
    this.shake=Math.max(0,this.shake-dt*2.8);
    if(shakeAllowed&&this.shake>0){this.camera.position.x+=(Math.random()-.5)*this.shake*.22;this.camera.position.y+=(Math.random()-.5)*this.shake*.14;}
    this.camera.lookAt(this.focus);this.camera.fov=THREE.MathUtils.lerp(this.camera.fov,p.dodge>0?64:57,dt*6);this.camera.updateProjectionMatrix();this.ready=true;
  }
}

export class CinematicDirector{
  constructor(camera,onCaption){this.camera=camera;this.onCaption=onCaption;this.active=false;this.time=0;this.index=0;}
  start(shots,onFinish){this.shots=shots;this.onFinish=onFinish;this.active=true;this.time=0;this.index=0;this.enter();}
  enter(){const s=this.shots[this.index];this.onCaption(s.speaker||'',s.text||'');if(s.onEnter)s.onEnter();}
  update(dt){
    if(!this.active)return;this.time+=dt;const s=this.shots[this.index],t=clamp(this.time/s.duration,0,1),ease=t*t*(3-2*t);
    this.camera.position.fromArray(s.from).lerp(new THREE.Vector3(...(s.to||s.from)),ease);
    const focus=new THREE.Vector3(...s.target).lerp(new THREE.Vector3(...(s.targetTo||s.target)),ease);this.camera.lookAt(focus);this.camera.fov=s.fov||48;this.camera.updateProjectionMatrix();
    if(s.update)s.update(t);
    if(t>=1){this.index++;this.time=0;if(this.index>=this.shots.length)this.finish();else this.enter();}
  }
  finish(){if(!this.active)return;this.active=false;const cb=this.onFinish;this.onFinish=null;cb?.();}
}
