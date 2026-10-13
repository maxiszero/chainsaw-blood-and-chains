import * as THREE from '../vendor/three.module.js';

// Original, locally generated environment art. No remote assets are used.
export function createWorld(scene) {
  const group = new THREE.Group();
  group.name = 'Kurosawa freight depot · warehouse 04';
  scene.add(group);
  const colliders = [];
  const destructibles = [];
  const bounds = { minX: -17, maxX: 17, minZ: -21, maxZ: 21 };
  const rand = seededRandom(48271);
  const batches = new Map();
  const transform = new THREE.Object3D();
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  let combat = false;

  function material(color, roughness = .8, metalness = .15, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  }
  const iron = material(0x17252e, .63, .74);
  const rust = material(0x603832, .76, .5);
  const darkRust = material(0x30272a, .92, .3);
  const concrete = material(0x9ba6a4, .95, .03, { map: wallTexture(rand) });
  const wood = material(0x514735, .98, .05);
  const yellow = material(0xab8040, .82, .1);
  const pale = material(0x7c9aa6, .76, .42);
  const black = material(0x0b1016, .98, .05);
  const glass = new THREE.MeshBasicMaterial({ map: windowTexture(rand), color: 0x8dbece, transparent: true, opacity: .9, side: THREE.DoubleSide });
  const warmGlass = new THREE.MeshBasicMaterial({ map: glass.map, color: 0xcca86e, transparent: true, opacity: .63, side: THREE.DoubleSide });
  const ember = new THREE.MeshBasicMaterial({ color: 0xffbd60 });
  const redLamp = new THREE.MeshBasicMaterial({ color: 0xef4739 });

  function instance(geometry, mat, position, scale, rotation = [0, 0, 0]) {
    const key = `${geometry.uuid}:${mat.uuid}`;
    if (!batches.has(key)) batches.set(key, { geometry, mat, transforms: [] });
    transform.position.set(...position);
    transform.scale.set(...scale);
    transform.rotation.set(...rotation);
    transform.updateMatrix();
    batches.get(key).transforms.push(transform.matrix.clone());
  }
  function box(mat, x, y, z, w, h, d, rotation = [0, 0, 0]) {
    instance(unitBox, mat, [x, y, z], [w, h, d], rotation);
  }
  function cylinder(mat, x, y, z, radius, length, rotation = [0, 0, 0]) {
    instance(unitCylinder, mat, [x, y, z], [radius, length, radius], rotation);
  }
  function beam(mat, a, b, width = .14, depth = width) {
    const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b);
    const delta = bv.clone().sub(av);
    transform.position.copy(av.add(bv).multiplyScalar(.5));
    transform.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
    transform.scale.set(width, delta.length(), depth);
    transform.updateMatrix();
    const key = `${unitBox.uuid}:${mat.uuid}`;
    if (!batches.has(key)) batches.set(key, { geometry: unitBox, mat, transforms: [] });
    batches.get(key).transforms.push(transform.matrix.clone());
  }
  function plane(mat, x, y, z, w, h, rx = 0, ry = 0, rz = 0) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    group.add(mesh);
    return mesh;
  }

  // A stained slab has drawn expansion joints, drains, aggregate and painted lanes.
  const floorMap = floorTexture(rand);
  const floor = plane(material(0xa9b7ba, .49, .23, { map: floorMap }), 0, -.018, 0, 42, 52, -Math.PI / 2);
  floor.receiveShadow = true;
  floor.name = 'Wet concrete / painted loading lanes';
  box(concrete, -19.3, 5.75, 0, .6, 11.5, 48);
  box(concrete, 19.3, 5.75, 0, .6, 11.5, 48);
  box(concrete, 0, 5.75, -24, 39, 11.5, .55);
  box(concrete, -13.5, 5.5, 24, 12, 11, .6);
  box(concrete, 13.5, 5.5, 24, 12, 11, .6);
  box(concrete, 0, 9.5, 24, 15, 3, .6);
  // The dark ceiling is a backdrop; the key light represents broken roof lights.
  // It deliberately does not cast a solid shadow across the whole playable floor.
  plane(black, 0, 12.7, 0, 39, 48, Math.PI / 2);

  // Rhythmic columns, exposed I-beams and open triangular roof trusses.
  for (const z of [-22, -14, -6, 2, 10, 18, 23]) {
    for (const x of [-18.5, 18.5]) {
      box(rust, x, 6, z, .43, 12, .46);
      box(darkRust, x, .13, z, 1.2, .26, 1.2);
      box(rust, x, 5.8, z, .7, .3, 1.1);
      box(rust, x, 11.8, z, .75, .3, 1.1);
      box(yellow, x, 1.05, z - .25, .52, 1.65, .055);
      for (let i = 0; i < 4; i++) box(black, x, .43 + i * .41, z - .286, .5, .16, .012, [0, 0, -.43]);
    }
    beam(rust, [-18.5, 10.7, z], [18.5, 10.7, z], .24, .32);
    beam(rust, [-18.5, 10.7, z], [0, 12.2, z], .21, .28);
    beam(rust, [0, 12.2, z], [18.5, 10.7, z], .21, .28);
    for (let x = -18; x < 18; x += 4.5) {
      const roofY = 12.2 - Math.abs(x + 2.25) / 18.5 * 1.5;
      beam(rust, [x, 10.7, z], [x + 2.25, roofY, z], .105);
      beam(rust, [x + 2.25, roofY, z], [x + 4.5, 10.7, z], .105);
    }
  }
  for (const x of [-15, -9, 0, 9, 15]) beam(darkRust, [x, 12.12, -24], [x, 12.12, 24], .19);

  // Gridded panes are weathered illustrations, with real iron mullions.
  for (const side of [-1, 1]) {
    for (const z of [-18, -10, -2, 6, 14, 21]) {
      plane(side === -1 ? glass : warmGlass, side * 18.955, 7.2, z, 5.7, 3.55, 0, -side * Math.PI / 2);
      for (const y of [5.37, 7.2, 9.02]) box(iron, side * 18.86, y, z, .16, .13, 5.96);
      for (let i = -2; i <= 2; i++) box(iron, side * 18.85, 7.2, z + i * 1.44, .18, 3.72, .1);
      box(iron, side * 18.71, 5.32, z, .64, .16, 6.1);
    }
  }
  for (const x of [-12, 0, 12]) {
    plane(glass, x, 8.6, -23.68, 7.9, 3.05);
    for (let i = -2; i <= 2; i++) box(iron, x + i * 1.93, 8.6, -23.57, .11, 3.18, .16);
    for (const y of [7.04, 8.58, 10.14]) box(iron, x, y, -23.57, 8.12, .1, .16);
  }

  // Rear loading shutter and asymmetrical warehouse signage frame the boss.
  box(iron, 0, 3.15, -23.48, 12.1, 6.3, .42);
  for (let y = .25; y < 6.1; y += .22) box(pale, 0, y, -23.22, 11.6, .068, .13);
  box(darkRust, -6.18, 3.2, -23.08, .28, 6.5, .28);
  box(darkRust, 6.18, 3.2, -23.08, .28, 6.5, .28);
  box(yellow, 0, .07, -21.8, 12.4, .12, .5);
  const mainSign = signTexture('黒沢運輸', 'KUROSAWA FREIGHT DEPOT', '第四倉庫  /  TOKYO — 04', false);
  plane(new THREE.MeshBasicMaterial({ map: mainSign }), -11.85, 3.35, -23.61, 8.8, 2.7);
  const numberSign = signTexture('04', 'STORAGE / 24H', '危険  ·  立入禁止', true);
  plane(new THREE.MeshBasicMaterial({ map: numberSign }), 12.1, 3.6, -23.59, 6.3, 3.6);
  const caution = signTexture('火気厳禁', 'NO OPEN FLAME', '高圧設備', true);
  plane(new THREE.MeshBasicMaterial({ map: caution }), -18.92, 2.85, 9, 2.3, 1.5, 0, Math.PI / 2);

  // Service balcony, conduits and ladder: layered silhouettes along the sides.
  box(iron, -17.25, 4.65, -8, 3.1, .22, 25.7);
  box(black, -17.25, 4.77, -8, 3.1, .03, 25.7);
  for (let z = -20; z <= 5; z += 2.7) {
    box(rust, -15.78, 5.28, z, .09, 1.28, .09);
    beam(darkRust, [-15.85, 4.58, z], [-18.75, 2.65, z], .18);
  }
  box(rust, -15.78, 5.86, -8, .1, .09, 25.9);
  box(rust, -15.78, 5.27, -8, .08, .07, 25.9);
  for (const z of [-20.85, 4.85]) {
    box(rust, -17.25, 5.84, z, 2.9, .09, .09);
    box(rust, -17.25, 5.26, z, 2.9, .07, .08);
  }
  for (const z of [6.4, 7.6]) cylinder(rust, -18.28, 2.6, z, .045, 5.2);
  for (let y = .35; y < 5; y += .36) beam(pale, [-18.22, y, 6.4], [-18.22, y, 7.6], .065);
  for (const y of [2.4, 2.8, 3.28]) {
    cylinder(iron, 18.73, y, 0, .13, 46, [Math.PI / 2, 0, 0]);
    for (const z of [-19, -10, 0, 10, 19]) cylinder(rust, 18.73, y, z, .18, .09, [Math.PI / 2, 0, 0]);
  }
  cylinder(rust, 18.45, 5.2, -18.2, .21, 10.4);
  cylinder(iron, -18.77, 3.3, 15.2, .2, 6.6);
  for (let z = -19; z < 20; z += 8) box(iron, 18.76, 2.85, z, .27, 1.35, .16);
  for (const p of [[-18, 2.1, 13.5], [18, 1.85, -11.2]]) {
    box(pale, p[0], p[1], p[2], .85, 1.45, 1.15);
    box(iron, p[0] + (p[0] < 0 ? .44 : -.44), p[1], p[2], .08, 1.18, .9);
    box(redLamp, p[0] + (p[0] < 0 ? .5 : -.5), p[1] + .38, p[2] + .2, .04, .07, .1);
  }

  // An overhead crane, its hook suspended away from the central fight.
  box(yellow, 0, 9.55, -8, 36.6, .65, 1.2);
  box(iron, 0, 9.17, -8, 36.8, .11, 1.38);
  box(darkRust, 10.8, 8.75, -8, 2.2, 1.3, 1.8);
  for (const x of [10.6, 11]) cylinder(black, x, 6.25, -8, .029, 4.1);
  const hookCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(10.8, 4.3, -8), new THREE.Vector3(10.8, 3.75, -8),
    new THREE.Vector3(11.12, 3.58, -8), new THREE.Vector3(11.43, 3.75, -8),
    new THREE.Vector3(11.43, 4.03, -8),
  ]);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(hookCurve, 16, .1, 6, false), iron));

  // Large static freight piles give cover at the edges, never at either spawn.
  for (const pile of [
    [-14.2, -17.8, 4.2, 3.4, 3.3], [14.4, -17.4, 4.3, 3, 3.5],
    [-14.4, 1.3, 3.5, 2.8, 4.7], [14.8, 7.4, 3.2, 3.1, 4.3],
    [-14.8, 18.7, 3.3, 2.3, 3.2],
  ]) {
    const [x, z, w, h, d] = pile;
    box(wood, x, h / 2, z, w, h, d);
    box(darkRust, x, .12, z, w + .15, .24, d + .2);
    for (const y of [.36, h - .32]) {
      box(iron, x, y, z - d / 2 - .018, w, .095, .036);
      box(iron, x, y, z + d / 2 + .018, w, .095, .036);
    }
    for (const px of [-w * .32, w * .32]) {
      box(pale, x + px, h / 2, z, .09, h + .025, d + .035);
    }
    for (let y = .6; y < h; y += .42) {
      box(darkRust, x, y, z - d / 2 - .024, w, .025, .018);
      box(darkRust, x, y, z + d / 2 + .024, w, .025, .018);
    }
    colliders.push({ x, z, w, d });
  }

  const cratePositions = [[-10.5, 10.2], [11.5, 1.5], [12.8, -6.4], [-11.3, -10.7], [-13, 14], [11.6, 16.3]];
  const crateMaterial = material(0xffffff, .94, .13, { vertexColors: true });
  const crateGeometry = makeCrateGeometry();
  for (let i = 0; i < cratePositions.length; i++) {
    const [x, z] = cratePositions[i];
    const mesh = new THREE.Mesh(crateGeometry, crateMaterial);
    mesh.position.set(x, .65, z);
    mesh.rotation.y = (rand() - .5) * .45;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'Breakable shipping crate';
    group.add(mesh);
    destructibles.push({ mesh, x, z, radius: .86, hp: 30, maxHp: 30 });
  }
  const barrelMap = barrelTexture(rand);
  const barrelMat = material(0xc1ada2, .67, .6, { map: barrelMap });
  const barrelProfile = [[0, 0], [.48, 0], [.49, .08], [.49, .25], [.525, .27], [.525, .33], [.49, .35], [.49, .91], [.525, .94], [.525, 1], [.49, 1.03], [.49, 1.22], [.46, 1.27], [0, 1.27]].map(([r, y]) => new THREE.Vector2(r, y));
  const barrelGeo = new THREE.LatheGeometry(barrelProfile, 14);
  for (const [x, z] of [[15, -12], [16.2, -12.3], [-16.5, 11], [-15.4, 11.3], [12, 12.5], [13.1, 12.7], [-11.8, -2.8]]) {
    const mesh = new THREE.Mesh(barrelGeo, barrelMat);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = rand() * Math.PI * 2;
    mesh.castShadow = true;
    mesh.name = 'Breakable oil drum';
    group.add(mesh);
    destructibles.push({ mesh, x, z, radius: .58, hp: 24, maxHp: 24 });
  }

  // Fine rubbish is batched; silhouettes remain quiet in the playable center.
  for (let i = 0; i < 100; i++) {
    const x = (rand() < .5 ? -1 : 1) * (12 + rand() * 6);
    const z = rand() * 44 - 22;
    const debrisMat = i % 4 === 0 ? pale : i % 3 === 0 ? wood : darkRust;
    box(debrisMat, x, .045, z, .12 + rand() * .45, .045, .15 + rand() * .5, [0, rand() * Math.PI, 0]);
  }

  // Puddles are irregular polygons, with broken window highlights painted on top.
  const puddleMat = material(0x203847, .075, .71, { transparent: true, opacity: .7, depthWrite: false });
  const reflectionMat = new THREE.MeshBasicMaterial({ map: glass.map, color: 0x69868a, transparent: true, opacity: .10, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const [x, z, sx, sz] of [[-9, 16, 3.4, 2.4], [7, 5, 2.3, 4.2], [-8, -6, 3.6, 2.7], [10, -16, 3.2, 1.8], [1, 20, 5.6, 2.5], [-13, 5, 1.8, 2.7]]) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 24; i++) {
      const angle = i / 24 * Math.PI * 2;
      const r = .8 + rand() * .2;
      const px = Math.cos(angle) * sx * r, py = Math.sin(angle) * sz * r;
      if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
    }
    shape.closePath();
    const puddle = new THREE.Mesh(new THREE.ShapeGeometry(shape), puddleMat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(x, .006, z);
    group.add(puddle);
    plane(reflectionMat, x, .009, z, sx * 1.25, sz * .95, -Math.PI / 2, 0, -.3);
  }

  // Outside the loading bay: the last city lights beyond the rain.
  plane(material(0x1e2b34, .7, .25), 0, -.04, 41, 80, 38, -Math.PI / 2);
  for (let i = 0; i < 15; i++) {
    const x = -35 + i * 5.1;
    const h = 8 + rand() * 12;
    box(black, x, h / 2, 51 + rand() * 8, 3.5 + rand() * 3, h, 4);
    for (let j = 0; j < 8; j++) {
      if (rand() > .4) box(j % 3 === 0 ? ember : pale, x + (rand() - .5) * 2.8, 2 + rand() * (h - 3), 48.8, .25, .48, .05);
    }
  }
  for (const x of [-7.5, 7.5]) {
    box(iron, x, 4.1, 24.1, .42, 8.2, .8);
    box(yellow, x, 1, 23.61, .45, 1.95, .05);
  }
  box(iron, 0, 8.08, 24.2, 15.5, .36, .8);
  // Rolled shutter teeth above the open entrance.
  for (let y = 8.25; y < 9.5; y += .13) box(pale, 0, y, 23.67, 14.6, .036, .07);
  box(iron, -10, 4, 29.5, .15, 8, .15);
  beam(iron, [-10, 7.9, 29.5], [-6.5, 7.9, 29.5], .14);
  box(ember, -6.5, 7.85, 29.5, .85, .06, .44);

  const ambient = new THREE.HemisphereLight(0x9bb5c7, 0x25252d, .9);
  group.add(ambient);
  const moon = new THREE.DirectionalLight(0xaacde9, 2.15);
  moon.position.set(-17, 22, 8);
  moon.target.position.set(0, 0, -5);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -26, right: 26, top: 30, bottom: -30, near: 1, far: 75 });
  moon.shadow.bias = -.0006;
  moon.shadow.normalBias = .04;
  group.add(moon, moon.target);
  const fill = new THREE.DirectionalLight(0x7193aa, .5);
  fill.position.set(8, 6, 15);
  group.add(fill);
  const glowTexture = lightTexture();
  const glowMaterial = new THREE.SpriteMaterial({ map: glowTexture, color: 0xffae49, transparent: true, opacity: .64, blending: THREE.AdditiveBlending, depthWrite: false });
  const lamps = [];
  const lampShadeGeo = new THREE.ConeGeometry(.52, .38, 16, 1, true);
  for (const [x, z] of [[-8, -15], [8, -15], [-8, 1], [8, 1], [-8, 17], [8, 17]]) {
    cylinder(iron, x, 9.08, z, .026, 3.1);
    instance(lampShadeGeo, iron, [x, 7.53, z], [1, 1, 1], [Math.PI, 0, 0]);
    cylinder(ember, x, 7.35, z, .4, .05);
    const glow = new THREE.Sprite(glowMaterial);
    glow.position.set(x, 7.31, z);
    glow.scale.set(2.5, 2.5, 1);
    group.add(glow);
    const spot = new THREE.SpotLight(0xffa449, 85, 19, .63, .7, 1.5);
    spot.position.set(x, 7.24, z);
    spot.target.position.set(x, 0, z);
    group.add(spot, spot.target);
    lamps.push({ spot, base: 85, phase: rand() * 8 });
    plane(new THREE.MeshBasicMaterial({ map: glowTexture, color: 0xf1a657, transparent: true, opacity: .16, depthWrite: false, blending: THREE.AdditiveBlending }), x, .013, z, 10, 10, -Math.PI / 2);
  }
  const danger = new THREE.PointLight(0xe24832, 30, 12, 1.6);
  danger.position.set(6.7, 5.9, -22.5);
  group.add(danger);
  cylinder(redLamp, 6.7, 5.7, -22.75, .16, .26);

  // Thin translucent shafts: fog catches the windows without obscuring combat.
  const shaftMaterial = new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color(0x8ebacb) }, opacity: { value: .075 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec2 vUv; uniform vec3 tint; uniform float opacity; void main(){float edge=pow(sin(vUv.x*3.1415926),1.8);float fall=pow(1.0-vUv.y,1.7);gl_FragColor=vec4(tint,edge*fall*opacity);}',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  for (const z of [-17, -1, 15]) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-18.7, 8.8, z - 2, -18.7, 8.8, z + 2, 2, .07, z + 10, 2, .07, z + 4], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    group.add(new THREE.Mesh(geo, shaftMaterial));
  }

  const dustPositions = new Float32Array(220 * 3);
  for (let i = 0; i < 220; i++) {
    dustPositions[i * 3] = rand() * 36 - 18;
    dustPositions[i * 3 + 1] = rand() * 10 + .2;
    dustPositions[i * 3 + 2] = rand() * 46 - 23;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xb7d1d7, size: .042, transparent: true, opacity: .29, depthWrite: false, blending: THREE.AdditiveBlending }));
  group.add(dust);
  const rainCount = 160;
  const rainPositions = new Float32Array(rainCount * 6);
  for (let i = 0; i < rainCount; i++) {
    const x = rand() * 28 - 14, y = rand() * 12, z = 24.3 + rand() * 17;
    rainPositions.set([x, y, z, x - .11, y + .62, z], i * 6);
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x9dbfd5, transparent: true, opacity: .2, depthWrite: false }));
  group.add(rain);

  // One draw call per architectural material, irrespective of detail count.
  for (const { geometry, mat, transforms } of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometry, mat, transforms.length);
    transforms.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  return {
    group, colliders, destructibles, bounds,
    update(dt, time) {
      const step = Math.min(dt, .05);
      for (let i = 0; i < rainCount; i++) {
        const k = i * 6;
        rainPositions[k + 1] -= step * 15;
        rainPositions[k + 4] -= step * 15;
        if (rainPositions[k + 1] < 0) {
          rainPositions[k + 1] = 12;
          rainPositions[k + 4] = 12.62;
        }
      }
      rainGeo.attributes.position.needsUpdate = true;
      dust.rotation.y = Math.sin(time * .024) * .018;
      dust.position.y = Math.sin(time * .12) * .12;
      for (const lamp of lamps) lamp.spot.intensity = lamp.base * (.97 + Math.sin(time * 2.8 + lamp.phase) * .018 + Math.sin(time * 17.4 + lamp.phase) * .012);
      danger.intensity = combat ? 28 + Math.sin(time * 5) * 13 : 22;
    },
    reset() {
      combat = false;
      for (const prop of destructibles) {
        prop.hp = prop.maxHp;
        prop.mesh.visible = true;
        prop.mesh.scale.setScalar(1);
      }
    },
    setCombat(value) { combat = Boolean(value); },
  };
}

function seededRandom(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
}

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function floorTexture(rand) {
  return canvasTexture(1536, 1536, (ctx, w, h) => {
    ctx.fillStyle = '#3d4b52'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 38000; i++) {
      const s = 1 + rand() * 3;
      ctx.fillStyle = `rgba(${rand() < .5 ? '166,183,190' : '9,18,26'},${.025 + rand() * .085})`;
      ctx.fillRect(rand() * w, rand() * h, s, s);
    }
    for (let i = 0; i < 350; i++) {
      const x = rand() * w, y = rand() * h;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 30 + rand() * 130);
      g.addColorStop(0, 'rgba(9,15,19,.11)'); g.addColorStop(1, 'rgba(9,15,19,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 170, y - 170, 340, 340);
    }
    ctx.strokeStyle = 'rgba(10,17,23,.7)'; ctx.lineWidth = 2;
    for (let n = 1; n < 9; n++) {
      ctx.beginPath(); ctx.moveTo(n * w / 9, 0); ctx.lineTo(n * w / 9, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, n * h / 9); ctx.lineTo(w, n * h / 9); ctx.stroke();
    }
    ctx.fillStyle = '#9c803e';
    for (const x of [w * .25, w * .75]) {
      ctx.fillRect(x, 48, 5, h - 96);
      for (let y = 120; y < h - 70; y += 210) ctx.fillRect(x - (x > w / 2 ? 0 : 180), y, 180, 5);
    }
    ctx.save(); ctx.translate(w / 2, h * .84); ctx.rotate(Math.PI);
    ctx.fillStyle = 'rgba(186,169,119,.45)'; ctx.font = 'bold 60px monospace'; ctx.textAlign = 'center'; ctx.fillText('KEEP CLEAR', 0, 0); ctx.restore();
    for (const y of [h * .12, h * .88]) {
      ctx.fillStyle = '#151c20'; ctx.fillRect(w * .32, y, w * .36, 21);
      ctx.fillStyle = '#4b5759';
      for (let x = w * .32; x < w * .68; x += 9) ctx.fillRect(x, y + 3, 3, 15);
    }
    for (let n = 0; n < 32; n++) {
      let x = rand() * w, y = rand() * h;
      ctx.strokeStyle = 'rgba(7,13,17,.46)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let i = 0; i < 8; i++) { x += rand() * 19 - 8; y += rand() * 18; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    for (let i = 0; i < 1000; i++) {
      ctx.fillStyle = 'rgba(35,46,51,.35)'; ctx.fillRect(rand() * w, rand() * h, 2 + rand() * 12, 1 + rand() * 4);
    }
  });
}

function wallTexture(rand) {
  const map = canvasTexture(768, 768, (ctx, w, h) => {
    ctx.fillStyle = '#6b787e'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2e444c'; ctx.fillRect(0, h * .64, w, h * .36);
    for (let i = 0; i < 14000; i++) {
      const shade = rand() > .5 ? '190,188,172' : '14,26,32';
      ctx.fillStyle = `rgba(${shade},${.04 + rand() * .13})`;
      ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 4, 1 + rand() * 3);
    }
    for (let i = 0; i < 180; i++) {
      const x = rand() * w, y = rand() * h;
      const g = ctx.createLinearGradient(0, y, 0, y + 80 + rand() * 170);
      g.addColorStop(0, 'rgba(25,31,30,.20)'); g.addColorStop(1, 'rgba(25,31,30,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, 2 + rand() * 18, 240);
    }
    ctx.strokeStyle = 'rgba(25,40,45,.5)'; ctx.lineWidth = 2;
    for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(0, i * 96); ctx.lineTo(w, i * 96); ctx.stroke(); }
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 4; j++) { const x = j * 192 + i % 2 * 96; ctx.beginPath(); ctx.moveTo(x, i * 96); ctx.lineTo(x, i * 96 + 96); ctx.stroke(); }
    }
  });
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(4, 1);
  return map;
}

function windowTexture(rand) {
  return canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#678898'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 3; j++) {
        ctx.fillStyle = `rgba(188,221,228,${.13 + rand() * .44})`;
        ctx.fillRect(i * 64 + 3, j * 85 + 3, 58, 79);
      }
    }
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(8,22,31,.0)'); g.addColorStop(1, 'rgba(8,22,31,.58)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1e303b'; ctx.lineWidth = 5;
    for (let i = 0; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, h); ctx.stroke(); }
    for (let i = 0; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(0, i * 85); ctx.lineTo(w, i * 85); ctx.stroke(); }
    for (let i = 0; i < 35; i++) {
      ctx.fillStyle = 'rgba(27,42,45,.13)'; ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 6, 20 + rand() * 90);
    }
    ctx.fillStyle = '#21313a';
    for (const [x, y] of [[127, 0], [320, 85], [64, 170]]) {
      ctx.beginPath(); ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + 54, y + 2); ctx.lineTo(x + 14, y + 42); ctx.lineTo(x + 31, y + 59); ctx.lineTo(x + 3, y + 78); ctx.fill();
    }
  });
}

function signTexture(title, subtitle, foot, red) {
  return canvasTexture(768, 320, (ctx, w, h) => {
    ctx.fillStyle = red ? '#8e372c' : '#17333b'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#aaa693'; ctx.lineWidth = 7; ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = '#ddd8c2'; ctx.textAlign = 'center';
    ctx.font = title === '04' ? 'bold 178px monospace' : '900 100px "Yu Gothic", "Noto Sans JP", sans-serif';
    ctx.fillText(title, w / 2, title === '04' ? 177 : 138);
    ctx.font = 'bold 29px monospace'; ctx.fillText(subtitle, w / 2, 228);
    ctx.font = '21px "Yu Gothic", sans-serif'; ctx.fillText(foot, w / 2, 275);
    for (let i = 0; i < 100; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(8,20,22,.12)' : 'rgba(218,210,178,.12)';
      ctx.fillRect((i * 367) % w, (i * 137) % h, 2 + (i * 7) % 33, 2);
    }
  });
}

function barrelTexture(rand) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5e2925'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#242b2f'; ctx.fillRect(0, 35, w, 8); ctx.fillRect(0, 199, w, 8);
    ctx.fillStyle = '#bbaa79'; ctx.fillRect(73, 96, 58, 61);
    ctx.fillStyle = '#382e25'; ctx.font = 'bold 38px sans-serif'; ctx.fillText('!', 95, 136);
    for (let i = 0; i < 230; i++) {
      ctx.fillStyle = rand() > .5 ? 'rgba(207,157,94,.14)' : 'rgba(7,14,18,.23)';
      ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 5, 3 + rand() * 21);
    }
  });
}

function lightTexture() {
  return canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,.85)');
    g.addColorStop(.06, 'rgba(255,245,223,.75)');
    g.addColorStop(.24, 'rgba(255,222,156,.25)');
    g.addColorStop(1, 'rgba(255,201,110,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  });
}

function makeCrateGeometry() {
  const positions = [], normals = [], colors = [];
  const base = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const dummy = new THREE.Object3D();
  function part(x, y, z, w, h, d, color, rz = 0) {
    dummy.position.set(x, y, z); dummy.scale.set(w, h, d); dummy.rotation.set(0, 0, rz); dummy.updateMatrix();
    const geometry = base.clone().applyMatrix4(dummy.matrix);
    const p = geometry.attributes.position.array, n = geometry.attributes.normal.array;
    const c = new THREE.Color(color);
    positions.push(...p); normals.push(...n);
    for (let i = 0; i < p.length / 3; i++) colors.push(c.r, c.g, c.b);
    geometry.dispose();
  }
  part(0, 0, 0, 1.28, 1.22, 1.28, 0x483d2e);
  for (let j = 0; j < 5; j++) {
    const v = -.49 + j * .245;
    part(0, v, -.66, 1.32, .225, .06, j % 2 ? 0x857153 : 0x6c5a42);
    part(0, v, .66, 1.32, .225, .06, j % 2 ? 0x746145 : 0x887353);
    part(-.66, v, 0, .06, .225, 1.32, 0x77664d);
    part(.66, v, 0, .06, .225, 1.32, 0x665640);
    part(v, .63, 0, .225, .065, 1.32, 0x8b7758);
  }
  for (const x of [-.49, .49]) {
    part(x, 0, -.7, .105, 1.32, .06, 0x2e383b);
    part(x, 0, .7, .105, 1.32, .06, 0x343f41);
    part(x, .68, 0, .105, .055, 1.44, 0x3b4647);
  }
  part(0, 0, -.738, 1.64, .13, .04, 0x9b8260, .72);
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.computeBoundingSphere();
  base.dispose();
  return merged;
}
