import * as THREE from '../vendor/three.module.js';

// All silhouettes are authored from cross sections. Shared surfaces and batched
// details keep the little ink-and-blood cast inexpensive enough for a crowd.
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const palette = {
  ink: 0x171918, coal: 0x292b29, steel: 0x9aa39e, edge: 0xd8dbce,
  ivory: 0xe6dfc7, shirt: 0xdedac8, skin: 0xd8a67f, shade: 0x966b55,
  orange: 0xba451e, orangeLight: 0xec6825, rust: 0x73321f,
  blood: 0x731d20, red: 0xb32d24, hair: 0xd2ae62, hairShade: 0x957537,
  rotten: 0x80856d, rottenDark: 0x565d4b, bruise: 0x754944,
  coat: 0xb6a78b, auburn: 0x9a432c, auburnLight: 0xbd633e, gold: 0xd9a844,
};
const gradient = new THREE.DataTexture(new Uint8Array([62,62,62,255,151,151,151,255,255,255,255,255]), 3, 1, THREE.RGBAFormat);
gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
gradient.needsUpdate = true;
const materials = Object.fromEntries(Object.entries(palette).map(([name, color]) => [name,
  new THREE.MeshToonMaterial({color, gradientMap: gradient})]));
materials.glint = new THREE.MeshBasicMaterial({color: 0xffedbb});
materials.eyeRed = new THREE.MeshBasicMaterial({color: 0xe85c36});
materials.outline = new THREE.MeshBasicMaterial({color: palette.ink, side: THREE.BackSide});

function loft(rings, sides = 10) {
  const vertices = [], indices = [];
  for (const [y, rx, rz, cx = 0, cz = 0] of rings) {
    for (let k = 0; k < sides; k++) {
      const angle = TAU * k / sides;
      vertices.push(cx + Math.cos(angle) * rx, y, cz + Math.sin(angle) * rz);
    }
  }
  for (let j = 0; j < rings.length - 1; j++) {
    for (let k = 0; k < sides; k++) {
      const a = j * sides + k, b = a + sides;
      const c = j * sides + (k + 1) % sides + sides, d = j * sides + (k + 1) % sides;
      indices.push(a,b,c,a,c,d);
    }
  }
  const low = vertices.length / 3;
  vertices.push(rings[0][3] || 0,rings[0][0],rings[0][4] || 0);
  const high = vertices.length / 3, last = rings[rings.length-1];
  vertices.push(last[3] || 0,last[0],last[4] || 0);
  for (let k = 0; k < sides; k++) {
    indices.push(low,k,(k+1)%sides);
    const a = (rings.length-1)*sides;
    indices.push(high,a+(k+1)%sides,a+k);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function wedge(points, depth = 0.025) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0],points[0][1]);
  for (let i=1;i<points.length;i++) shape.lineTo(points[i][0],points[i][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,steps:1,curveSegments:5});
  geometry.translate(0,0,-depth/2);
  return geometry;
}

function batch(parts) {
  const positions = [], normals = [];
  const normalMatrix = new THREE.Matrix3();
  const point = new THREE.Vector3(), normal = new THREE.Vector3();
  for (const part of parts) {
    const source = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...(part.position || [0,0,0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rotation || [0,0,0]))),
      new THREE.Vector3(...(part.scale || [1,1,1])));
    normalMatrix.getNormalMatrix(matrix);
    const reflected = matrix.determinant() < 0;
    for (let i=0;i<source.attributes.position.count;i++) {
      // Baking a reflection must flip winding as well as its surface normals.
      const index = reflected ? i-i%3+[0,2,1][i%3] : i;
      point.fromBufferAttribute(source.attributes.position,index).applyMatrix4(matrix);
      normal.fromBufferAttribute(source.attributes.normal,index).applyMatrix3(normalMatrix).normalize();
      positions.push(point.x,point.y,point.z);
      normals.push(normal.x,normal.y,normal.z);
    }
    if (source !== part.geometry) source.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  return geometry;
}

const GEO = {
  torso: loft([[0,.17,.12],[.12,.205,.135],[.42,.285,.15],[.54,.24,.135],[.59,.105,.09]]),
  pelvis: loft([[-.15,.175,.12],[0,.21,.14],[.13,.19,.12]]),
  thigh: loft([[0,.119,.125],[-.12,.123,.126],[-.33,.083,.083],[-.48,.07,.071]]),
  shin: loft([[0,.076,.074],[-.13,.083,.075],[-.35,.052,.053],[-.44,.055,.055]]),
  upperArm: loft([[0,.078,.08],[-.11,.092,.087],[-.27,.061,.066],[-.36,.052,.057]]),
  forearm: loft([[0,.055,.055],[-.12,.07,.062],[-.27,.046,.043],[-.34,.039,.04]]),
  sleeve: loft([[.03,.083,.086],[-.06,.105,.098],[-.16,.096,.083],[-.27,.079,.073]]),
  cuff: loft([[.023,.085,.082],[-.042,.088,.083]]),
  hand: loft([[.01,.041,.034],[-.06,.057,.037],[-.13,.043,.037],[-.16,.03,.028]],8),
  boot: loft([[0,.071,.108,0,.057],[.03,.085,.14,0,.067],[.115,.071,.129,0,.04],[.19,.052,.059]]),
  sole: loft([[0,.077,.145,0,.066],[.034,.084,.145,0,.064]],10),
  head: loft([[-.15,.065,.074,0,.022],[-.095,.117,.116,0,.021],[.025,.133,.132],[.135,.108,.111],[.17,.055,.062]],12),
  neck: loft([[0,.065,.064],[.135,.07,.065]],8),
  eye: new THREE.SphereGeometry(1,8,6),
  tooth: wedge([[-.034,0],[.036,0],[.022,.072]],.045),
  smallTooth: wedge([[-.02,0],[.02,0],[.004,.06]],.019),
};
// Hook profile is in the blade's Y/Z plane: it must read as a little cutting
// tooth from the side, not as the rectangular end of a broad extrusion.
const CHAIN_TOOTH = wedge([[-.024,-.004],[.025,-.004],[.008,.032],[-.009,.029],[.003,.009],[-.024,.010]],.034);
CHAIN_TOOTH.rotateY(-Math.PI/2);
const CHAIN_LINK = loft([[-.008,.027,.025],[.007,.027,.025]],6);

function mesh(parent, geometry, material, position = [0,0,0], scale = [1,1,1], rotation = [0,0,0]) {
  const item = new THREE.Mesh(geometry,typeof material === 'string' ? materials[material] : material);
  item.position.set(...position); item.scale.set(...scale); item.rotation.set(...rotation);
  item.castShadow = true; item.receiveShadow = true;
  parent.add(item);
  return item;
}

function pivot(parent,name,position) {
  const node = new THREE.Group(); node.name = name; node.position.set(...position); parent.add(node); return node;
}
function outline(parent,geometry,position,scale = [1.04,1.025,1.05]) {
  const item = mesh(parent,geometry,'outline',position,scale);
  item.castShadow = false; item.receiveShadow = false;
  return item;
}
function tube(points,radius = .025,segments = 14) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),segments,radius,6,false);
}

function makeSaw(length = .86, width = .105) {
  const group = new THREE.Group(); group.name = 'living_chainsaw';
  const shape = new THREE.Shape();
  shape.moveTo(width,-width);
  shape.lineTo(length-width,-width);
  shape.absarc(length-width,0,width,-Math.PI/2,Math.PI/2,false);
  shape.lineTo(width,width);
  shape.absarc(width,0,width,Math.PI/2,Math.PI*1.5,false);
  const geometry = new THREE.ExtrudeGeometry(shape,{depth:.065,bevelEnabled:true,bevelSize:.012,bevelThickness:.01,bevelSegments:1,curveSegments:7});
  geometry.translate(0,0,-.0325); geometry.rotateY(-Math.PI/2);
  mesh(group,geometry,'steel');
  // The guide plate sits on both outside faces of the bar, where it can catch
  // light. Its former inset was hidden inside an opaque outer housing.
  const inset=geometry.clone();inset.scale(.25,.63,.84);inset.translate(0,0,length*.07);
  for(const sign of [-1,1])mesh(group,inset,'edge',[sign*.047,0,0]);
  const plate=loft([[-width*.36,.004,length*.20],[width*.36,.004,length*.20]],8);
  const grime=loft([[-width*.16,.003,length*.10],[width*.16,.003,length*.10]],7);
  const hardware=[];
  for(const sign of [-1,1]) {
    mesh(group,plate,'coal',[sign*.056,0,length*.38]);
    mesh(group,grime,'rust',[sign*.057,-width*.32,length*.68]);
    for(const z of [length*.22,length*.54])hardware.push({geometry:GEO.eye,position:[sign*.062,0,z],scale:[.006,.014,.014]});
  }
  mesh(group,batch(hardware),'steel');
  const straight = length - 2*width, perimeter = straight*2 + TAU*width;
  const count = Math.max(18,Math.round(perimeter/.074));
  const teeth = new THREE.InstancedMesh(CHAIN_TOOTH,materials.steel,count);
  const links = new THREE.InstancedMesh(CHAIN_LINK,materials.coal,count);
  teeth.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  links.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  teeth.castShadow = true; teeth.frustumCulled = false;
  links.castShadow = true;links.frustumCulled = false;
  group.add(teeth,links);
  const helper = new THREE.Object3D();
  function update(time,moving = true) {
    for (let k=0;k<count;k++) {
      let d = ((k/count + (moving ? time*2.8 : 0))%1)*perimeter;
      let y,z,ny,nz;
      if (d<straight) {y=-width;z=width+d;ny=-1;nz=0;}
      else if ((d-=straight)<Math.PI*width) {
        const a=d/width-Math.PI/2;y=Math.sin(a)*width;z=length-width+Math.cos(a)*width;ny=Math.sin(a);nz=Math.cos(a);
      } else if ((d-=Math.PI*width)<straight) {y=width;z=length-width-d;ny=1;nz=0;}
      else {d-=straight;const a=d/width+Math.PI/2;y=Math.sin(a)*width;z=width+Math.cos(a)*width;ny=Math.sin(a);nz=Math.cos(a);}
      helper.position.set(0,y,z);helper.rotation.set(Math.atan2(nz,ny),0,0);helper.updateMatrix();
      teeth.setMatrixAt(k,helper.matrix);
      links.setMatrixAt(k,helper.matrix);
    }
    teeth.instanceMatrix.needsUpdate=true;
    links.instanceMatrix.needsUpdate=true;
  }
  update(0,false);
  return {group,update};
}

function hairGeometry() {
  const parts = [{geometry:loft([[-.005,.135,.13],[.115,.145,.128],[.185,.11,.10],[.23,.015,.015]],10)}];
  const strand = wedge([[-.049,.055],[.045,.05],[.009,-.115]],.055);
  for (let i=0;i<9;i++) {
    const angle = i/9*TAU;
    parts.push({geometry:strand,position:[Math.sin(angle)*.125,.015+(i%3)*.025,Math.cos(angle)*.12],rotation:[.3,angle,(i%2 ? .24 : -.24)]});
  }
  for (let i=0;i<4;i++) parts.push({geometry:strand,position:[-.08+i*.048,.21,.01],rotation:[0,0,-.52+i*.18],scale:[1.1,-1.1,.8]});
  return batch(parts);
}
const HAIR = hairGeometry();

function buildRig({shirt = 'shirt',skin = 'skin',pants = 'coal',humanHead = true} = {}) {
  const group = new THREE.Group();
  const hips = pivot(group,'hips',[0,1.02,0]);
  mesh(hips,GEO.pelvis,pants);
  const spine = pivot(hips,'spine',[0,.02,0]);
  mesh(spine,GEO.torso,shirt);
  const neck = pivot(spine,'neck',[0,.56,0]);
  mesh(neck,GEO.neck,skin);
  const head = pivot(neck,'head',[0,.245,0]);
  if (humanHead) mesh(head,GEO.head,skin);
  const limbs = {};
  for (const [side,sign] of [['left',-1],['right',1]]) {
    const leg = pivot(hips,`${side}_hip`,[sign*.116,-.06,0]);
    mesh(leg,GEO.thigh,pants);
    const knee = pivot(leg,`${side}_knee`,[0,-.47,0]);
    mesh(knee,GEO.shin,pants);
    const foot = pivot(knee,`${side}_ankle`,[0,-.48,0]);
    mesh(foot,GEO.boot,'ink'); mesh(foot,GEO.sole,'coal');
    const arm = pivot(spine,`${side}_shoulder`,[sign*.273,.47,0]);
    arm.rotation.z=sign*.08;
    mesh(arm,GEO.upperArm,skin);
    mesh(arm,GEO.sleeve,shirt);
    mesh(arm,GEO.cuff,shirt,[0,-.265,0]);
    const elbow = pivot(arm,`${side}_elbow`,[0,-.35,0]);
    mesh(elbow,GEO.forearm,skin);
    const hand = pivot(elbow,`${side}_wrist`,[0,-.325,0]);
    mesh(hand,GEO.hand,skin);
    limbs[side]={leg,knee,foot,arm,elbow,hand};
  }
  group.userData.rig={hips,spine,neck,head,...limbs};
  return {group,hips,spine,neck,head,...limbs};
}

function eyes(parent, color = 'ink', y = .015, z = .136, size = .022) {
  for (const sign of [-1,1]) {
    mesh(parent,GEO.eye,'ivory',[sign*.059,y,z],[size*1.1,size*.65,.012]);
    mesh(parent,GEO.eye,color,[sign*.059,y,z+.01],[size*.38,size*.64,.008]);
  }
}

function faceTeeth(parent,width=.16,count=7,y=-.09,z=.127,scale=1) {
  const parts=[];
  for(let i=0;i<count;i++) parts.push({geometry:GEO.smallTooth,position:[-width/2+i*width/(count-1),y,z],scale:[scale,-scale,scale]});
  return mesh(parent,batch(parts),'ivory');
}

export function createDenji() {
  const rig = buildRig({humanHead:false});
  const {group,hips,spine,head,left,right}=rig;
  group.name='Denji';
  outline(spine,GEO.torso,[0,0,0]);
  // Open collar, loosened tie, shirt placket and the little starter handle.
  mesh(spine,wedge([[-.09,.02],[0,-.13],[.035,.03]],.014),'ivory',[-.055,.54,.115]);
  mesh(spine,wedge([[.09,.02],[0,-.13],[-.035,.03]],.014),'ivory',[.055,.54,.115]);
  const tie=pivot(spine,'tie',[0,.49,.164]);
  mesh(tie,wedge([[-.034,0],[.036,0],[.023,-.046],[.047,-.29],[0,-.355],[-.035,-.29],[-.016,-.05]],.017),'ink');
  const buttonParts=[];
  for(let i=0;i<3;i++) buttonParts.push({geometry:GEO.eye,position:[0,.12+i*.105,.137],scale:[.008,.008,.008]});
  mesh(spine,batch(buttonParts),'coal');
  mesh(spine,tube([[.015,.28,.15],[.045,.265,.19],[.015,.23,.19],[-.012,.25,.17]],.009,8),'ink');
  mesh(spine,wedge([[-.10,0],[-.05,.027],[.048,-.05],[.032,-.14],[-.02,-.10]],.014),'blood',[-.12,.37,.148]);
  const human=pivot(head,'human_face',[0,0,0]);
  mesh(human,GEO.head,'skin');outline(human,GEO.head,[0,0,0],[1.045,1.035,1.04]);
  mesh(human,HAIR,'hair');
  eyes(human);
  mesh(human,wedge([[-.065,0],[.065,.008],[.038,-.039],[-.049,-.029]],.010),'ink',[0,-.062,.146]);
  faceTeeth(human,.11,5,-.065,.153,.45);
  const transformed=pivot(head,'chainsaw_head',[0,0,0]);
  const helmet=loft([[-.14,.10,.11,0,-.023],[-.06,.163,.16,0,-.014],[.07,.166,.175],[.16,.125,.13],[.23,.063,.066]],8);
  mesh(transformed,helmet,'orange');outline(transformed,helmet,[0,0,0],[1.035,1.03,1.04]);
  mesh(transformed,loft([[-.015,.178,.177],[.04,.155,.184],[.08,.13,.17]],8),'orangeLight',[0,.07,0]);
  mesh(transformed,wedge([[-.124,.03],[.135,.03],[.115,-.13],[-.09,-.145]],.03),'ink',[0,-.02,.139]);
  faceTeeth(transformed,.20,9,-.004,.16,.75);
  const lowerTeeth=faceTeeth(transformed,.18,8,.003,.155,.64);
  lowerTeeth.rotation.z=Math.PI;lowerTeeth.position.y=-.135;
  const sideParts=[];
  for (const sign of [-1,1]) {
    for(let i=0;i<3;i++) sideParts.push({geometry:wedge([[-.023,0],[.029,0],[.021,-.086],[-.025,-.072]],.014),position:[sign*.153,.12-i*.04,-.03],rotation:[0,sign*Math.PI/2,-.25]});
  }
  mesh(transformed,batch(sideParts),'ink');
  mesh(transformed,tube([[-.12,.07,-.12],[-.17,.22,-.15],[0,.29,-.17],[.17,.22,-.15],[.12,.07,-.12]],.026,12),'ink');
  const headSaw=makeSaw(.80,.091);
  transformed.add(headSaw.group);headSaw.group.position.set(0,.12,.115);
  const armSaws=[];
  for(const [limb,sign] of [[left,-1],[right,1]]) {
    const attachment=pivot(limb.elbow,'arm_chainsaw',[sign*.014,-.12,.01]);
    mesh(attachment,loft([[-.14,.077,.08],[-.04,.096,.096],[.085,.063,.063]],8),'blood');
    const saw=makeSaw(.82,.085);
    attachment.add(saw.group);saw.group.rotation.x=Math.PI/2;saw.group.position.set(sign*.025,-.03,.036);
    armSaws.push({attachment,saw});
  }
  let isTransformed=false,clock=0,fall=0;
  function setTransformed(value) {
    isTransformed=!!value; human.visible=!isTransformed;transformed.visible=isTransformed;
    for(const arm of armSaws) arm.attachment.visible=isTransformed;
  }
  setTransformed(false);
  function update(dt,{time,speed=0,attack=0,attackType='light',attackStep=0,transform=0,dodge=0,parry=0,hurt=0,dead=false,transformed:form}={}) {
    clock = Number.isFinite(time) ? time : clock+dt;
    if(form!==undefined && !!form!==isTransformed) setTransformed(form);
    const movement=clamp(Math.abs(speed),0,1),step=clock*(9.5+movement*2.5),stride=Math.sin(step)*movement;
    const hit=clamp(attack,0,1),strike=Math.sin(hit*Math.PI),heavy=attackType==='heavy';
    hips.position.y=1.02+Math.abs(Math.sin(step))*.045*movement+Math.sin(clock*2.2)*.009-dodge*.24;
    hips.rotation.set(-movement*.11-dodge*.8,0,stride*.022);
    spine.rotation.set(-strike*(heavy?.30:.13)+parry*.12,-strike*(heavy?.9:.56),-hurt*.17);
    head.rotation.set(-movement*.035+strike*.04,-spine.rotation.y*.4,Math.sin(clock*1.7)*.012);
    left.leg.rotation.x=stride*.69;right.leg.rotation.x=-stride*.69;
    left.knee.rotation.x=Math.max(0,-stride)*.83;right.knee.rotation.x=Math.max(0,stride)*.83;
    left.foot.rotation.x=-left.knee.rotation.x*.27;right.foot.rotation.x=-right.knee.rotation.x*.27;
    left.arm.rotation.set(-stride*.46-strike*1.35-parry*1.30,0,-.09-strike*.58-parry*.25);
    right.arm.rotation.set(stride*.46-strike*(heavy?2.5:2.05)-parry*1.65,0,.10+strike*.45+parry*.2);
    left.elbow.rotation.x=-.14-strike*.65-parry*.65;
    right.elbow.rotation.x=-.15-strike*.30-parry*.45;
    // Distinct right cut, left return and raised double-blade finisher.
    const combo=((Math.floor(attackStep)%3)+3)%3;
    if(!heavy && hit>0) {
      if(combo===1) {
        spine.rotation.y=strike*.61;
        left.arm.rotation.set(-stride*.25-strike*1.95,0,-.08-strike*.22);
        right.arm.rotation.set(stride*.20-strike*.66,0,.1+strike*.58);
        left.elbow.rotation.x=-.2-strike*.5;
      } else if(combo===2) {
        spine.rotation.set(-strike*.26,strike*.17,-hurt*.17);
        left.arm.rotation.x=-strike*2.5;right.arm.rotation.x=-strike*2.65;
        left.arm.rotation.z=-.20;right.arm.rotation.z=.20;
        left.elbow.rotation.x=-strike*.47;right.elbow.rotation.x=-strike*.47;
      }
    }
    if(transform>0) {
      const pull=clamp(transform,0,1),reach=Math.sin(Math.min(1,pull*2)*Math.PI/2);
      const release=clamp((pull-.55)/.45,0,1);
      spine.rotation.x=-Math.sin(pull*Math.PI)*.13;
      head.rotation.x=.18*reach-.22*release;
      right.arm.rotation.set(.65*reach-.95*release,-.05*reach,-.65*reach+.26*release);
      right.elbow.rotation.set(-2.10*reach+1.0*release,0,-.40*reach);
      right.hand.rotation.y=-.50*reach;
      left.arm.rotation.x=-.13*reach;left.elbow.rotation.x=-.10;
    } else {
      right.elbow.rotation.y=0;right.elbow.rotation.z=0;right.hand.rotation.y=0;
    }
    tie.rotation.x=movement*.25+Math.sin(step+1)*movement*.22+strike*.4;
    tie.rotation.z=Math.sin(clock*3)*.04+spine.rotation.y*.3;
    fall=THREE.MathUtils.damp(fall,dead?1:0,7,dt);
    hips.rotation.x+=fall*1.35;hips.position.y-=fall*.80;
    if(isTransformed) {headSaw.update(clock,!dead);for(const arm of armSaws) arm.saw.update(clock,!dead);}
  }
  return {group,update,setTransformed};
}

export function createPochita() {
  const group=new THREE.Group();group.name='Pochita';
  const body=pivot(group,'body',[0,.29,0]);
  const bodyGeometry=loft([[-.15,.16,.24],[-.07,.225,.31],[.08,.24,.29],[.21,.17,.21],[.25,.07,.11]],12);
  mesh(body,bodyGeometry,'orangeLight');outline(body,bodyGeometry,[0,0,0],[1.025,1.025,1.025]);
  mesh(body,loft([[-.08,.158,.05],[.04,.174,.06],[.11,.11,.035]],10),'orange',[0,-.015,.258]);
  const feet=[];
  for(const x of [-.135,.135]) for(const z of [-.15,.14]) {
    const foot=pivot(group,'paw',[x,.11,z]);
    mesh(foot,loft([[-.11,.062,.073],[-.045,.063,.075],[.075,.045,.044]],8),'orange');feet.push(foot);
  }
  const saw=makeSaw(.41,.063);body.add(saw.group);saw.group.position.set(0,.13,.21);
  for(const sign of [-1,1]) {
    mesh(body,GEO.eye,'ink',[sign*.111,.06,.264],[.043,.055,.023]);
    mesh(body,GEO.eye,'glint',[sign*.111-.010,.079,.284],[.012,.014,.007]);
  }
  mesh(body,wedge([[-.062,.013],[.063,.013],[.038,-.032],[-.035,-.032]],.01),'ink',[0,-.047,.313]);
  mesh(body,wedge([[-.026,0],[.03,0],[.013,-.019]],.01),'ivory',[0,-.044,.32]);
  mesh(body,tube([[-.10,.17,-.02],[-.115,.34,-.065],[0,.37,-.09],[.115,.34,-.065],[.1,.17,-.02]],.037,16),'ink');
  const tail=pivot(body,'starter_tail',[0,.035,-.265]);
  mesh(tail,tube([[0,0,0],[0,.02,-.15],[.02,.08,-.17]],.014,8),'ink');
  mesh(tail,tube([[-.065,.08,-.17],[-.06,.14,-.17],[.06,.14,-.17],[.065,.08,-.17],[-.065,.08,-.17]],.014,10),'coal');
  let clock=0;
  return {group,update(dt,{time,speed=0,dead=false}={}) {
    clock=Number.isFinite(time)?time:clock+dt;
    const moving=clamp(Math.abs(speed),0,1),step=clock*15;
    body.position.y=.29+Math.sin(clock*3)*.013+Math.abs(Math.sin(step))*.037*moving;
    body.rotation.z=Math.sin(step)*.06*moving;tail.rotation.y=Math.sin(clock*8)*.3;
    for(let i=0;i<feet.length;i++)feet[i].rotation.x=Math.sin(step+(i%2)*Math.PI)*moving*.6;
    group.rotation.z=dead?Math.PI*.46:0;
    saw.update(clock,!dead && moving>.1);
  }};
}

export function createMakima() {
  const rig=buildRig();
  const {group,hips,spine,head,left,right}=rig;
  group.name='Makima';
  hips.scale.set(.94,1.02,.94);
  head.scale.set(.95,1,.95);
  // A long open Public Safety coat: separately authored side panels leave the
  // shirt and tie readable, including in the final doorway silhouette.
  const panels=loft([[-.64,.087,.166],[-.28,.075,.15],[.12,.052,.155],[.39,.082,.15],[.50,.09,.10]],9);
  const coatTails=[];
  for(const sign of [-1,1]) {
    const tail=pivot(spine,sign<0?'left_coat_tail':'right_coat_tail',[sign*.215,.025,-.015]);
    mesh(tail,panels,'coat');coatTails.push(tail);
    mesh(spine,wedge([[0,.03],[sign*.13,-.04],[sign*.06,-.21],[-sign*.027,-.13]],.028),'ivory',[sign*.089,.54,.154]);
    mesh(spine,wedge([[0,.04],[sign*.16,-.05],[sign*.09,-.25],[-sign*.027,-.11]],.030),'coat',[sign*.105,.49,.182]);
  }
  const back=pivot(spine,'coat_back',[0,0,-.12]);
  mesh(back,wedge([[-.245,.49],[.245,.49],[.216,.08],[.282,-.61],[.032,-.68],[0,-.44],[-.032,-.68],[-.282,-.61],[-.216,.08]],.075),'coat');
  const belt=loft([[-.026,.241,.169],[.026,.241,.169]],10);
  mesh(spine,belt,'shade',[0,.005,-.015]);
  for(const limb of [left,right]) {
    mesh(limb.arm,loft([[.035,.092,.093],[-.12,.10,.092],[-.32,.067,.067]],9),'coat');
    mesh(limb.elbow,loft([[.02,.07,.069],[-.16,.069,.059],[-.30,.048,.047]],9),'coat');
    mesh(limb.elbow,GEO.cuff,'ivory',[0,-.30,0],[.65,.6,.64]);
  }
  mesh(spine,wedge([[-.025,0],[.027,0],[.017,-.045],[.035,-.28],[0,-.33],[-.03,-.28],[-.015,-.045]],.016),'ink',[0,.50,.167]);
  const fringe=[];
  fringe.push({geometry:loft([[.035,.136,.126],[.13,.137,.121],[.205,.087,.090],[.222,.029,.032]],12)});
  const lock=wedge([[-.048,.065],[.039,.053],[.012,-.118],[-.018,-.056]],.032);
  for(let i=0;i<5;i++)fringe.push({geometry:lock,position:[-.097+i*.047,.132,.126],rotation:[0,0,-.25+i*.07],scale:[1,i===2?.86:.55,1]});
  for(const sign of [-1,1])fringe.push({geometry:loft([[.08,.042,.067],[-.05,.035,.047],[-.20,.026,.025],[-.25,.011,.013]],8),position:[sign*.133,-.003,-.005],rotation:[0,0,-sign*.1]});
  mesh(head,batch(fringe),'auburn');
  const braid=pivot(head,'braid',[0,.045,-.129]);
  const braidParts=[];
  const braidSegment=loft([[.037,.037,.037],[0,.05,.049],[-.042,.028,.033]],8);
  for(let i=0;i<10;i++)braidParts.push({geometry:braidSegment,position:[Math.sin(i*Math.PI)*.011,-i*.065,-.035-Math.sin(i/9*Math.PI)*.056],rotation:[0,0,(i%2?1:-1)*.4],scale:[1-i*.034,1,1-i*.025]});
  mesh(braid,batch(braidParts),'auburn');
  const braidHighlights=[];
  for(let i=0;i<8;i++)braidHighlights.push({geometry:braidSegment,position:[(i%2?1:-1)*.014,-i*.065,-.050-Math.sin(i/9*Math.PI)*.056],rotation:[0,0,(i%2?1:-1)*.45],scale:[.53,.65,.54]});
  mesh(braid,batch(braidHighlights),'auburnLight');
  mesh(braid,loft([[0,.029,.027],[-.02,.029,.027]],8),'ink',[0,-.617,-.039]);
  mesh(braid,loft([[0,.028,.025],[-.095,.012,.015],[-.12,.004,.007]],8),'auburn',[0,-.628,-.04]);
  for(const sign of [-1,1]) {
    mesh(head,GEO.eye,'ivory',[sign*.059,.020,.135],[.030,.015,.007]);
    mesh(head,GEO.eye,'gold',[sign*.059,.020,.143],[.014,.014,.004]);
  }
  const irisRings=[],pupils=[];
  for(const sign of [-1,1]) {
    for(const radius of [.008,.012])irisRings.push({geometry:new THREE.TorusGeometry(radius,.0017,4,16),position:[sign*.059,.020,.148]});
    pupils.push({geometry:GEO.eye,position:[sign*.059,.020,.151],scale:[.003,.005,.002]});
  }
  mesh(head,batch(irisRings),'blood');mesh(head,batch(pupils),'ink');
  const features=[];
  for(const sign of [-1,1])features.push({geometry:wedge([[-.033,0],[.032,.008],[.028,.013],[-.034,.008]],.004),position:[sign*.059,.041,.142]});
  features.push({geometry:wedge([[-.029,0],[.029,0],[.012,-.005],[-.012,-.005]],.005),position:[0,-.073,.144]});
  mesh(head,batch(features),'shade');
  mesh(head,wedge([[-.008,.016],[.005,.023],[.012,-.017],[-.009,-.017]],.012),'skin',[0,-.014,.142]);
  let clock=0;
  return {group,update(dt,{time,speed=0,dead=false}={}) {
    clock=Number.isFinite(time)?time:clock+dt;
    const movement=clamp(Math.abs(speed),0,1),step=clock*7.4,stride=Math.sin(step)*movement;
    hips.position.y=1.02+Math.sin(clock*1.7)*.008+Math.abs(Math.sin(step))*.027*movement;
    spine.rotation.set(-.013,Math.sin(clock*.55)*.018,Math.sin(clock*.8)*.008);
    head.rotation.set(-.023,Math.sin(clock*.45)*.029,.025);
    left.leg.rotation.x=stride*.37;right.leg.rotation.x=-stride*.37;
    left.knee.rotation.x=Math.max(0,-stride)*.43;right.knee.rotation.x=Math.max(0,stride)*.43;
    left.arm.rotation.set(-stride*.19-.035,0,-.055);right.arm.rotation.set(stride*.19-.035,0,.055);
    left.elbow.rotation.x=right.elbow.rotation.x=-.10;
    braid.rotation.set(Math.sin(clock*1.6)*.035+movement*.15,0,Math.sin(clock*1.1)*.028);
    for(let i=0;i<coatTails.length;i++)coatTails[i].rotation.x=Math.sin(step+i*Math.PI)*movement*.075;
    back.rotation.x=Math.sin(clock*1.8)*.012+movement*.08;
    if(dead) {hips.position.y=.35;hips.rotation.x=1.3;}else hips.rotation.x=0;
  }};
}

const zombieHead=loft([[-.17,.076,.082,0,.025],[-.105,.129,.113,0,.02],[.055,.139,.123],[.155,.095,.094],[.185,.035,.041]],10);
const zombieHair=batch(Array.from({length:6},(_,i)=>({geometry:wedge([[-.039,0],[.04,0],[.018,-.15]],.035),position:[Math.sin(i/6*TAU)*.12,.12,Math.cos(i/6*TAU)*.10],rotation:[.1,i/6*TAU,.25]})));

export function createZombie(type='normal') {
  const heavy=type==='heavy',runner=type==='runner',worker=type==='worker';
  const rig=buildRig({shirt:heavy?'bruise':worker?'orange':runner?'coal':'rottenDark',skin:'rotten',pants:'ink',humanHead:false});
  const {group,hips,spine,head,left,right}=rig;
  group.name=`Zombie_${type}`;
  group.scale.set(heavy?1.30:runner?.87:1,heavy?1.13:runner?.96:1,heavy?1.20:runner?.89:1);
  mesh(head,zombieHead,'rotten');
  mesh(head,zombieHair,'ink');
  const jaw=pivot(head,'loose_jaw',[0,-.11,.028]);
  mesh(jaw,loft([[-.11,.065,.068],[-.052,.13,.099],[.015,.12,.09]],8),'rottenDark');
  mesh(head,wedge([[-.097,.009],[.092,.031],[.102,-.075],[-.073,-.071]],.018),'ink',[0,-.055,.122]);
  faceTeeth(head,.16,7,-.06,.139,.72);
  eyes(head,'eyeRed',.035,.119,.025);
  mesh(head,wedge([[-.016,0],[.062,.09],[.078,.036],[.034,-.06]],.013),'blood',[.055,.017,.125]);
  const wounds=[];
  for(let i=0;i<3;i++) wounds.push({geometry:wedge([[-.06,.02],[.047,.055],[.07,-.05],[-.03,-.065]],.018),position:[-.10+(i%2)*.17,.33-i*.10,.146],rotation:[0,0,.3+i*.8]});
  mesh(spine,batch(wounds),'blood');
  const ribs=[];
  for(let i=0;i<3;i++) ribs.push({geometry:tube([[-.08,0,0],[-.02,-.018,.02],[.045,-.01,0]],.012,5),position:[.06,.29-i*.05,.16]});
  mesh(spine,batch(ribs),'ivory');
  for(const limb of [left,right]) {
    const fingers=[];
    for(let i=0;i<4;i++) fingers.push({geometry:loft([[0,.009,.011],[-.11-(i%2)*.025,.008,.008],[-.15,.003,.006]],5),position:[-.036+i*.023,-.115,.012],rotation:[-.13,0,(i-1.5)*.12]});
    mesh(limb.hand,batch(fingers),'rotten');
  }
  if(heavy) {
    mesh(spine,loft([[-.13,.21,.15],[.05,.32,.23],[.23,.35,.25],[.39,.27,.20],[.49,.15,.13]],12),'bruise',[0,.12,.025]);
    mesh(spine,tube([[-.18,.34,.20],[-.04,.27,.29],[.16,.24,.23],[.08,.11,.23],[-.10,.12,.25]],.045,14),'blood');
    left.arm.scale.set(1.4,1.22,1.35);right.arm.scale.set(1.4,1.22,1.35);
  }
  if(worker) mesh(head,loft([[0,.18,.16],[.055,.14,.135],[.13,.08,.07]],10),'orange',[0,.13,0]);
  if(runner) {spine.scale.y=.95;left.arm.scale.y=1.18;right.arm.scale.y=1.18;}
  let clock=0,fall=0;
  const phase=runner?1.7:heavy?.65:1.08;
  function update(dt,{time,speed=0,attack=0,hurt=0,dead=false}={}) {
    clock=Number.isFinite(time)?time:clock+dt;
    const moving=clamp(Math.abs(speed),0,1),step=clock*7.5*phase,stride=Math.sin(step)*moving;
    const strike=Math.sin(clamp(attack,0,1)*Math.PI);
    hips.position.y=1.02+Math.abs(Math.sin(step))*.035*moving;
    hips.rotation.set(runner?.21:.055,0,Math.sin(clock*1.6)*.035+stride*.024);
    spine.rotation.set(.09+strike*.26-hurt*.32,Math.sin(step)*moving*.08,stride*.05);
    head.rotation.set(.06+Math.sin(clock*2.7)*.04,-.04,.13+Math.sin(clock*1.3)*.045);
    jaw.rotation.x=-.08-Math.abs(Math.sin(clock*2))*.19-strike*.3;
    left.leg.rotation.x=stride*.56;right.leg.rotation.x=-stride*.56;
    left.knee.rotation.x=Math.max(0,-stride)*.55;right.knee.rotation.x=Math.max(0,stride)*.55;
    left.arm.rotation.set(-.63-stride*.25-strike*1.10,0,-.19);
    right.arm.rotation.set(-.46+stride*.25-strike*1.48,0,.17);
    left.elbow.rotation.x=-.28-Math.sin(clock*2)*.10;
    right.elbow.rotation.x=-.22+Math.sin(clock*2)*.08;
    fall=THREE.MathUtils.damp(fall,dead?1:0,6,dt);
    hips.rotation.x-=fall*1.49;hips.position.y-=fall*.79;head.rotation.z+=fall*.2;
  }
  return {group,update};
}

export function createZombieBoss() {
  const group=new THREE.Group();group.name='ZombieDevil';
  const hips=pivot(group,'pelvis',[0,1.65,0]);
  const torso=pivot(hips,'torso',[0,.18,0]);
  const mass=loft([[-.30,.43,.39,.03,.08],[.04,.70,.58,.08,.12],[.39,.87,.73,.03,.10],[.83,.96,.72,-.08,.02],[1.22,.98,.63,-.09,-.05],[1.55,.73,.49,-.17,-.06],[1.73,.40,.36,-.18,-.03]],18);
  mesh(torso,mass,'rottenDark');outline(torso,mass,[0,0,0],[1.025,1.025,1.025]);
  const belly=loft([[-.35,.11,.075,.12,0],[-.21,.39,.19,.12,.02],[.06,.63,.31,.09,.04],[.39,.71,.37,.02,0],[.73,.65,.30,-.05,-.07],[1.04,.44,.16,-.09,-.10],[1.16,.17,.07,-.12,-.11]],18);
  mesh(torso,belly,'rotten',[0,.02,.49]);
  const abdomenPatch=wedge([[-.29,.24],[-.14,.35],[.13,.29],[.24,.10],[.13,-.17],[-.07,-.24],[-.26,-.06]],.018);
  mesh(torso,abdomenPatch,'bruise',[.20,.38,.862],[.86,.91,1],[0,-.16,-.26]);
  const folds=[];
  folds.push({geometry:tube([[-.47,.33,.74],[-.23,.25,.86],[.08,.21,.85],[.22,.28,.85]],.016,12)});
  folds.push({geometry:tube([[-.25,.07,.77],[-.03,.015,.81],[.30,.09,.79]],.023,10)});
  folds.push({geometry:tube([[.24,.59,.84],[.32,.44,.87],[.27,.29,.86],[.34,.15,.79]],.012,12)});
  mesh(torso,batch(folds),'rottenDark');
  const ribParts=[];
  for(let i=0;i<3;i++)ribParts.push({geometry:tube([[0,0,0],[-.17,.045,.045],[-.30,-.02,-.016]],.023+i*.003,8),position:[-.13,1.13-i*.13,.62+i*.041],rotation:[0,0,-.09-i*.12]});
  for(let i=0;i<2;i++)ribParts.push({geometry:tube([[0,0,0],[.10,.03,.03],[.21,-.045,-.03]],.024,7),position:[.18,1.14-i*.16,.63+i*.048],rotation:[0,0,.2-i*.1]});
  mesh(torso,batch(ribParts),'coat');
  const neck=pivot(torso,'neck',[-.18,1.55,.12]);
  mesh(neck,loft([[0,.32,.32],[.23,.38,.35,-.035,.05],[.52,.27,.28,-.05,.09]],16),'rotten');
  const head=pivot(neck,'head',[-.055,.51,.18]);
  const skull=loft([[-.36,.26,.24,.045,.06],[-.17,.45,.35,.035,.08],[.10,.64,.45,-.025,.07],[.39,.73,.47,-.09,.015],[.65,.64,.43,-.12,-.035],[.84,.40,.32,-.105,-.06],[.98,.10,.12,-.055,-.08]],18);
  mesh(head,skull,'rotten');outline(head,skull,[0,0,0],[1.03,1.03,1.03]);
  mesh(head,wedge([[-.47,.11],[-.16,.12],[.16,.06],[.46,.13],[.50,-.08],[.32,-.25],[-.08,-.30],[-.41,-.16]],.029),'ink',[.055,-.055,.456],[1,1,1],[0,0,-.075]);
  const jaw=pivot(head,'jaw',[.04,-.22,.075]);
  mesh(jaw,loft([[-.38,.13,.12,.11,.13],[-.27,.35,.27,.08,.075],[-.12,.47,.32,.02,.05],[.065,.43,.25,-.015,.02]],16),'bruise');
  const teeth=[],lowerTeeth=[];
  for(let i=0;i<11;i++) {
    if(i!==2&&i!==7)teeth.push({geometry:GEO.tooth,position:[-.37+i*.079,.027-(i%3)*.018,.482-Math.abs(i-5)*.01],rotation:[0,0,(i%3-1)*.21],scale:[.8+(i%3)*.17,-1.35-(i%4)*.34,1.1]});
    if(i!==1&&i!==5&&i!==9)lowerTeeth.push({geometry:GEO.tooth,position:[-.32+i*.071,-.09+(i%3)*.02,.399-Math.abs(i-5)*.008],rotation:[0,0,(i%3-1)*-.23],scale:[.85+(i%2)*.18,.95+(i%3)*.49,1.05]});
  }
  mesh(head,batch(teeth),'coat');mesh(jaw,batch(lowerTeeth),'ivory');
  for(const [x,y,z,sx,sy,tilt] of [[-.36,.35,.423,.172,.074,-.19],[.25,.46,.433,.125,.112,.25]]) {
    mesh(head,GEO.eye,'ink',[x,y,z],[sx,sy,.055],[0,0,tilt]);
    mesh(head,GEO.eye,'eyeRed',[x+.012,y-.009,z+.051],[.021,.025,.012]);
    mesh(head,wedge([[-.17,0],[.14,.04],[.16,-.03],[-.10,-.049]],.038),'rottenDark',[x-.012,y+.071,z+.012],[1,.80,1],[0,0,tilt]);
  }
  // Uneven scalp folds replace the former toy-like row of crown spikes.
  mesh(head,loft([[-.12,.13,.055],[.03,.24,.09,-.025,0],[.18,.17,.07,-.05,-.015],[.23,.055,.03,-.07,-.03]],14),'coat',[-.25,.59,.297],[1.1,1,1],[.08,0,-.23]);
  mesh(head,wedge([[-.18,.17],[-.03,.23],[.13,.14],[.08,-.03],[-.09,-.19],[-.20,-.07]],.018),'bruise',[.40,.37,.363],[.70,1,1],[0,.38,-.11]);
  const scalpStrings=[];
  for(let i=0;i<5;i++)scalpStrings.push({geometry:tube([[-.43+i*.075,.65,.25],[-.53+i*.065,.46,.36],[-.54+i*.045,.20-i*.048,.32]],.012+(i%2)*.005,10)});
  mesh(head,batch(scalpStrings),'rottenDark');
  const limbs=[];
  for(const [s,index] of [[-1,0],[1,1]]) {
    const leg=pivot(hips,index?'right_hip':'left_hip',[s*.40,-.16,.01]);
    mesh(leg,loft([[0,.31,.32],[-.28,.35,.30],[-.66,.20,.19],[-.83,.18,.19]],10),'rottenDark');
    const knee=pivot(leg,'knee',[0,-.80,0]);
    mesh(knee,loft([[0,.19,.18],[-.28,.22,.21],[-.58,.14,.14]],9),'rotten');
    mesh(knee,loft([[-.67,.21,.36,0,.18],[-.54,.25,.36,0,.17],[-.41,.145,.19,0,.08]],9),'coal');
    const shoulder=pivot(torso,index?'right_shoulder':'left_shoulder',[s*.83,index?1.24:1.39,-.025]);
    const armScale=index?1.18:.94;
    shoulder.scale.setScalar(armScale);
    mesh(shoulder,loft([[.18,.24,.26],[-.06,.35,.34,s*.025,.01],[-.30,.36,.30,s*.055,.02],[-.58,.26,.23,s*.045,0],[-.86,.19,.20,s*.02,-.02]],16),index?'rottenDark':'rotten');
    const elbow=pivot(shoulder,'elbow',[0,-.82,0]);
    mesh(elbow,loft([[0,.20,.21],[-.22,.29,.25,s*.02,.03],[-.42,.31,.27,s*.035,.02],[-.68,.23,.20,s*.02,-.01],[-.91,.15,.15]],16),'rottenDark');
    const hand=pivot(elbow,'hand',[0,-.91,.04]);
    mesh(hand,loft([[.025,.15,.14],[-.13,.25+(index*.04),.19,s*.022,.01],[-.31,.25,.16,s*.04,.015],[-.39,.17,.12,s*.06,.02]],14),'rotten');
    const fingers=[];
    for(let k=0;k<4;k++) {
      const length=[.34,.52,.44,.31][(k+index)%4];
      fingers.push({geometry:loft([[0,.067,.074],[-length*.36,.067,.059,-s*.01,.034],[-length*.67,.047,.041,-s*.026,.105],[-length,.015,.019,-s*.035,.19]],10),position:[-.21+k*.14,-.30-(k%2)*.035,0],rotation:[-.12+(k%2)*.20,0,(k-1.5)*.11],scale:[index?1.11:1,1,1]});
    }
    fingers.push({geometry:loft([[0,.083,.09],[-.17,.064,.06,-s*.03,.04],[-.31,.025,.03,-s*.055,.11]],10),position:[s*.25,-.08,.04],rotation:[0,0,s*.65]});
    mesh(hand,batch(fingers),'rotten');
    const tendons=[];
    for(let k=0;k<4;k++)tendons.push({geometry:tube([[s*(.15+k*.04),.02-k*.018,.20],[s*(.23+k*.043),-.18-k*.10,.25],[s*(.22+k*.04),-.49-k*.10,.20],[s*(.15+k*.032),-.68-k*.077,.12]],.012+(k%2)*.009,13)});
    mesh(shoulder,batch(tendons),index?'shade':'coat');
    mesh(shoulder,wedge([[-.13,.13],[.09,.18],[.17,-.02],[.07,-.25],[-.12,-.17]],.017),'bruise',[s*.08,-.27,.303],[.95,1.08,1],[0,s*.20,s*.19]);
    limbs.push({leg,knee,shoulder,elbow,hand});
  }
  // Three absorbed skulls give the back its own readable, disturbing silhouette.
  const faces=[];
  for(let i=0;i<3;i++)faces.push({geometry:zombieHead,position:[-.43+i*.43,1.25-i%2*.27,-.57],rotation:[0,Math.PI,(i-1)*.23],scale:[1.4,1.4,1.4]});
  mesh(torso,batch(faces),'rotten');
  group.userData.rig={hips,torso,neck,head,jaw,limbs};
  let clock=0,fall=0;
  function update(dt,{time,speed=0,attack=0,attackType='light',hurt=0,dead=false}={}) {
    clock=Number.isFinite(time)?time:clock+dt;
    const moving=clamp(Math.abs(speed),0,1),step=clock*4.5,stride=Math.sin(step)*moving;
    const strike=Math.sin(clamp(attack,0,1)*Math.PI),slam=attackType==='heavy';
    hips.position.y=1.65+Math.abs(Math.sin(step))*.10*moving;
    hips.rotation.set(.055,0,stride*.04);
    torso.rotation.set(.10+strike*(slam?.34:.12)-hurt*.15,strike*(slam?0:.45)+stride*.035,-.025+Math.sin(clock)*.018);
    head.rotation.set(Math.sin(clock*1.3)*.025-strike*.08,-torso.rotation.y*.45,-.08+Math.sin(clock*.7)*.025);
    jaw.rotation.x=-.08-Math.abs(Math.sin(clock*1.5))*.19-strike*.30;
    for(let i=0;i<limbs.length;i++) {
      const limb=limbs[i],s=i?1:-1;
      limb.leg.rotation.x=stride*.32*s;limb.knee.rotation.x=Math.max(0,-stride*s)*.4;
      limb.shoulder.rotation.set(-.12-stride*.18*s-strike*(slam?2.5:(i?1.65:.45)),0,s*(.22+strike*.3));
      limb.elbow.rotation.x=-.12-strike*.36;
      limb.hand.rotation.z=Math.sin(clock*1.4+s)*.055;
    }
    fall=THREE.MathUtils.damp(fall,dead?1:0,3,dt);
    hips.position.y-=fall*1.30;hips.rotation.x+=fall*1.4;
  }
  return {group,update};
}
