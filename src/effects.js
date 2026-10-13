import * as THREE from '../vendor/three.module.js';

const MAX_PARTICLES = 700;
const MAX_SLASHES = 14;
const MAX_WAVES = 10;
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;

function ribbonGeometry(width = .09) {
  const positions = [], uvs = [], indices = [];
  const segments = 40;
  for (let i=0;i<=segments;i++) {
    const u=i/segments, angle=-1.20+u*2.40;
    const taper=Math.pow(Math.sin(u*Math.PI),.65);
    for (const side of [-1,1]) {
      const radius=1+side*width*taper;
      positions.push(Math.sin(angle)*radius,Math.sin(u*Math.PI)*.055,Math.cos(angle)*radius);
      uvs.push(u,side===-1?0:1);
    }
    if (i<segments) {
      const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}

function translucent(color, opacity=0) {
  return new THREE.MeshBasicMaterial({color,opacity,transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,toneMapped:false});
}

/** Scene-local VFX. No per-frame geometry allocation, timers or listeners. */
export class Effects {
  constructor(scene) {
    this.scene=scene;
    this.group=new THREE.Group();this.group.name='combat_effects';scene.add(this.group);
    this.disposed=false;
    this.cursor=0;this.slashCursor=0;this.waveCursor=0;
    this.age=new Float32Array(MAX_PARTICLES);
    this.life=new Float32Array(MAX_PARTICLES);
    this.velocity=new Float32Array(MAX_PARTICLES*3);
    this.baseSize=new Float32Array(MAX_PARTICLES);
    this.kind=new Uint8Array(MAX_PARTICLES);
    this.bounces=new Uint8Array(MAX_PARTICLES);
    this.positions=new Float32Array(MAX_PARTICLES*3);
    this.colors=new Float32Array(MAX_PARTICLES*3);
    this.sizes=new Float32Array(MAX_PARTICLES);
    this.alpha=new Float32Array(MAX_PARTICLES);
    this.streakPositions=new Float32Array(MAX_PARTICLES*6);
    this.streakColors=new Float32Array(MAX_PARTICLES*6);
    this.streakAlpha=new Float32Array(MAX_PARTICLES*2);
    this.particleGeometry=new THREE.BufferGeometry();
    for (const [name,array,itemSize] of [
      ['position',this.positions,3],['color',this.colors,3],['aSize',this.sizes,1],['aAlpha',this.alpha,1],
    ]) this.particleGeometry.setAttribute(name,new THREE.BufferAttribute(array,itemSize).setUsage(THREE.DynamicDrawUsage));
    this.particleMaterial=new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,depthTest:true,toneMapped:false,
      uniforms:{uPixelScale:{value:440}},
      vertexShader:`
        attribute vec3 color;
        attribute float aSize;
        attribute float aAlpha;
        uniform float uPixelScale;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 viewPosition=modelViewMatrix*vec4(position,1.0);
          gl_Position=projectionMatrix*viewPosition;
          gl_PointSize=clamp(aSize*uPixelScale/max(0.2,-viewPosition.z),0.0,28.0);
          vColor=color;vAlpha=aAlpha;
        }
      `,
      fragmentShader:`
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 p=gl_PointCoord-0.5;
          float d=dot(p,p);
          float shape=1.0-smoothstep(0.13,0.25,d);
          float alpha=shape*vAlpha;
          if(alpha<0.01) discard;
          gl_FragColor=vec4(vColor,alpha);
          #include <colorspace_fragment>
        }
      `,
    });
    this.points=new THREE.Points(this.particleGeometry,this.particleMaterial);
    this.points.frustumCulled=false;this.points.renderOrder=4;this.group.add(this.points);
    this.streakGeometry=new THREE.BufferGeometry();
    for(const [name,array,itemSize] of [['position',this.streakPositions,3],['color',this.streakColors,3],['aAlpha',this.streakAlpha,1]]) {
      this.streakGeometry.setAttribute(name,new THREE.BufferAttribute(array,itemSize).setUsage(THREE.DynamicDrawUsage));
    }
    this.streakMaterial=new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,depthTest:true,toneMapped:false,blending:THREE.AdditiveBlending,
      vertexShader:`
        attribute vec3 color;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {vColor=color;vAlpha=aAlpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
      `,
      fragmentShader:`
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          if(vAlpha<0.01)discard;
          gl_FragColor=vec4(vColor,vAlpha);
          #include <colorspace_fragment>
        }
      `,
    });
    this.streaks=new THREE.LineSegments(this.streakGeometry,this.streakMaterial);
    this.streaks.frustumCulled=false;this.streaks.renderOrder=5;this.group.add(this.streaks);

    this.ribbonGeometry=ribbonGeometry(.087);
    this.coreGeometry=ribbonGeometry(.022);
    this.slashes=[];
    for(let i=0;i<MAX_SLASHES;i++) {
      const root=new THREE.Group();root.name='slash_ribbon';root.visible=false;
      const sweep=new THREE.Group();root.add(sweep);
      const halo=new THREE.Mesh(this.ribbonGeometry,translucent(0xe94b19));
      halo.scale.setScalar(1.03);halo.renderOrder=3;
      const edge=new THREE.Mesh(this.ribbonGeometry,translucent(0xff963f));
      edge.scale.setScalar(.997);edge.position.y=.006;edge.renderOrder=4;
      const core=new THREE.Mesh(this.coreGeometry,translucent(0xffefd0));
      core.position.y=.012;core.renderOrder=5;
      const echo=new THREE.Mesh(this.coreGeometry,translucent(0xff4d21));
      echo.scale.setScalar(.84);echo.rotation.y=-.19;echo.position.y=-.03;echo.renderOrder=3;
      sweep.add(halo,edge,core,echo);this.group.add(root);
      this.slashes.push({root,sweep,halo,edge,core,echo,age:0,life:0,scale:1,heavy:false});
    }
    this.ringGeometry=new THREE.RingGeometry(.978,1,96);
    this.waves=[];
    for(let i=0;i<MAX_WAVES;i++) {
      const root=new THREE.Group();root.name='impact_wave';root.visible=false;
      const ring=new THREE.Mesh(this.ringGeometry,translucent(0xff6536));
      ring.rotation.x=-Math.PI/2;ring.renderOrder=2;
      const echo=new THREE.Mesh(this.ringGeometry,translucent(0xffdda5));
      echo.rotation.x=-Math.PI/2;echo.scale.setScalar(.91);echo.position.y=.006;echo.renderOrder=2;
      root.add(ring,echo);this.group.add(root);
      this.waves.push({root,ring,echo,age:0,life:0,radius:1});
    }
    this.color=new THREE.Color();
  }

  burst(x,y,z,color=0xff6939,count=20,force=1) {
    if(this.disposed)return;
    this.color.set(color);
    const redBlood=this.color.r>this.color.g*2.3 && this.color.g<.20;
    const amount=clamp(Math.floor(count),0,MAX_PARTICLES),power=clamp(force,.05,12);
    for(let n=0;n<amount;n++) {
      const i=this.cursor;this.cursor=(this.cursor+1)%MAX_PARTICLES;
      const k=i*3,angle=Math.random()*TAU,radius=Math.random()*.095;
      const spark=!redBlood || Math.random()>.84;
      this.kind[i]=spark?1:0;this.bounces[i]=0;this.age[i]=0;
      this.life[i]=spark?.22+Math.random()*.43:.42+Math.random()*.47;
      this.positions[k]=x+Math.cos(angle)*radius;this.positions[k+1]=y+(Math.random()-.5)*.10;this.positions[k+2]=z+Math.sin(angle)*radius;
      const speed=(.8+Math.random()*3.8)*power;
      this.velocity[k]=Math.cos(angle)*speed;this.velocity[k+2]=Math.sin(angle)*speed;
      this.velocity[k+1]=(.25+Math.random()*3.7)*power;
      this.baseSize[i]=(spark?.019+Math.random()*.036:.035+Math.random()*.067)*Math.min(1.7,Math.sqrt(power));
      this.sizes[i]=this.baseSize[i];this.alpha[i]=1;
      const brightness=.65+Math.random()*.42;
      const hot=spark&&Math.random()>.45;
      const r=hot?1:this.color.r*brightness,g=hot?.72:this.color.g*brightness,b=hot?.32:this.color.b*brightness;
      this.colors[k]=r;this.colors[k+1]=g;this.colors[k+2]=b;
      const q=i*6;
      for(let end=0;end<2;end++) {
        this.streakColors[q+end*3]=r;this.streakColors[q+end*3+1]=g;this.streakColors[q+end*3+2]=b;
        this.streakPositions[q+end*3]=this.positions[k];this.streakPositions[q+end*3+1]=this.positions[k+1];this.streakPositions[q+end*3+2]=this.positions[k+2];
      }
      this.streakAlpha[i*2]=spark?.75:0;this.streakAlpha[i*2+1]=0;
    }
    this.particleGeometry.attributes.color.needsUpdate=true;
    this.streakGeometry.attributes.color.needsUpdate=true;
    this.markMotionDirty();
  }

  shockwave(x,z,color=0xff6536,radius=5) {
    if(this.disposed)return;
    const wave=this.waves[this.waveCursor];this.waveCursor=(this.waveCursor+1)%MAX_WAVES;
    wave.age=0;wave.life=.62;wave.radius=clamp(radius,.15,30);
    wave.root.visible=true;wave.root.position.set(x,.065,z);wave.root.scale.setScalar(.04);
    wave.ring.material.color.set(color);wave.ring.material.opacity=.6;wave.echo.material.opacity=.35;
  }

  slash(x,z,angle,heavy=false) {
    if(this.disposed)return;
    const slash=this.slashes[this.slashCursor];this.slashCursor=(this.slashCursor+1)%MAX_SLASHES;
    slash.age=0;slash.life=heavy?.34:.23;slash.heavy=!!heavy;slash.scale=heavy?1.82:1.23;
    slash.root.visible=true;slash.root.position.set(x,heavy?1.45:1.20,z);
    slash.root.rotation.set(0,angle,0);
    slash.sweep.rotation.set(heavy?.29:.07,-.54,heavy?-.76:-.12);
    slash.sweep.scale.setScalar(slash.scale*.86);
    slash.halo.material.opacity=.14;slash.edge.material.opacity=.51;slash.core.material.opacity=.94;slash.echo.material.opacity=.28;
  }

  markMotionDirty() {
    for(const name of ['position','aSize','aAlpha'])this.particleGeometry.attributes[name].needsUpdate=true;
    this.streakGeometry.attributes.position.needsUpdate=true;
    this.streakGeometry.attributes.aAlpha.needsUpdate=true;
  }

  update(dt) {
    if(this.disposed)return;
    // A resumed/background tab must not launch particles through the entire map.
    const step=clamp(Number.isFinite(dt)?dt:0,0,.06);
    let hasParticles=false;
    for(let i=0;i<MAX_PARTICLES;i++) {
      if(this.life[i]<=0)continue;
      hasParticles=true;
      const k=i*3,q=i*6;
      this.age[i]+=step;
      if(this.age[i]>=this.life[i]) {
        this.life[i]=0;this.alpha[i]=0;this.sizes[i]=0;
        this.streakAlpha[i*2]=this.streakAlpha[i*2+1]=0;continue;
      }
      const spark=this.kind[i]===1,t=this.age[i]/this.life[i],drag=Math.exp(-step*(spark?1.8:2.1));
      this.velocity[k]*=drag;this.velocity[k+2]*=drag;this.velocity[k+1]-=step*(spark?12:16);
      for(let c=0;c<3;c++)this.positions[k+c]+=this.velocity[k+c]*step;
      if(this.positions[k+1]<.045) {
        this.positions[k+1]=.045;
        if(spark&&this.bounces[i]===0) {
          this.velocity[k+1]=Math.abs(this.velocity[k+1])*.29;this.bounces[i]=1;
          this.velocity[k]*=.55;this.velocity[k+2]*=.55;
        } else {
          this.velocity[k]*=.65;this.velocity[k+1]=0;this.velocity[k+2]*=.65;
          this.age[i]=Math.max(this.age[i],this.life[i]*.65);
        }
      }
      this.alpha[i]=Math.pow(1-t,spark?1.15:.7)*.94;
      this.sizes[i]=this.baseSize[i]*(spark?1-t*.6:1-t*.24);
      if(spark) {
        const trail=.016*(1-t*.4);
        for(let c=0;c<3;c++) {
          this.streakPositions[q+c]=this.positions[k+c];
          this.streakPositions[q+3+c]=this.positions[k+c]-this.velocity[k+c]*trail;
        }
        this.streakAlpha[i*2]=this.alpha[i]*.82;this.streakAlpha[i*2+1]=this.alpha[i]*.08;
      }
    }
    if(hasParticles)this.markMotionDirty();
    for(const slash of this.slashes) {
      if(!slash.root.visible)continue;
      slash.age+=step;const t=slash.age/slash.life;
      if(t>=1) {slash.root.visible=false;continue;}
      const fade=Math.pow(1-t,1.35),size=slash.scale*(.86+t*.19);
      slash.sweep.rotation.y=-.54+t*1.0;
      slash.sweep.scale.setScalar(size);
      slash.halo.material.opacity=fade*.14;slash.edge.material.opacity=fade*.57;
      slash.core.material.opacity=fade*.95;slash.echo.material.opacity=fade*.24;
      slash.echo.rotation.y=-.19-t*.15;
    }
    for(const wave of this.waves) {
      if(!wave.root.visible)continue;
      wave.age+=step;const t=wave.age/wave.life;
      if(t>=1) {wave.root.visible=false;continue;}
      wave.root.scale.setScalar(wave.radius*(.04+.96*(1-Math.pow(1-t,2))));
      wave.ring.material.opacity=.62*Math.pow(1-t,1.5);wave.echo.material.opacity=.33*Math.pow(1-t,2);
    }
  }

  clear() {
    if(this.disposed)return;
    this.life.fill(0);this.alpha.fill(0);this.sizes.fill(0);this.streakAlpha.fill(0);
    for(const slash of this.slashes)slash.root.visible=false;
    for(const wave of this.waves)wave.root.visible=false;
    this.cursor=this.slashCursor=this.waveCursor=0;this.markMotionDirty();
  }

  dispose() {
    if(this.disposed)return;
    this.clear();this.scene.remove(this.group);
    this.particleGeometry.dispose();this.streakGeometry.dispose();
    this.particleMaterial.dispose();this.streakMaterial.dispose();
    this.ribbonGeometry.dispose();this.coreGeometry.dispose();this.ringGeometry.dispose();
    for(const slash of this.slashes)for(const item of [slash.halo,slash.edge,slash.core,slash.echo])item.material.dispose();
    for(const wave of this.waves) {wave.ring.material.dispose();wave.echo.material.dispose();}
    this.group.clear();this.disposed=true;
  }
}
