// Original, fictional exterior models. No manufacturer CAD or third-party model code is included.
import * as THREE from "three";

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const cylinderGeometry = new Map();
const torusGeometry = new Map();
const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
const material = (color, metalness = .26, roughness = .57, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });

export const finish = {
  shell: material(0xc7dfe1),
  pale: material(0xe5f2ec, .12, .72),
  alloy: material(0x7f9cab, .68, .36),
  steel: material(0x465e6b, .76, .32),
  dark: material(0x203947, .26, .65),
  recess: material(0x102935, .19, .77),
  glass: material(0x57c7d0, .08, .18, { transparent: true, opacity: .55, depthWrite: false }),
  amberGlass: material(0xe5a767, .07, .24, { transparent: true, opacity: .63, depthWrite: false }),
  teal: material(0x36d5c1, .25, .39, { emissive: 0x075c5a, emissiveIntensity: .37 }),
  blue: material(0x6cbbef, .25, .44, { emissive: 0x153c65, emissiveIntensity: .28 }),
  orange: material(0xf6b568, .25, .54),
  violet: material(0x877bd1, .29, .48),
  wafer: material(0x5c71a0, .48, .24),
  rubber: material(0x172b33, .04, .95)
};

export function box(parent, width, height, depth, x, y, z, surface = finish.shell, shadow = true) {
  const mesh = new THREE.Mesh(boxGeometry, surface);
  mesh.scale.set(width, height, depth);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  parent.add(mesh);
  return mesh;
}

export function cyl(parent, top, bottom, height, x, y, z, surface = finish.alloy, sides = 16, shadow = true) {
  const key = `${top}/${bottom}/${height}/${sides}`;
  if (!cylinderGeometry.has(key)) cylinderGeometry.set(key, new THREE.CylinderGeometry(top, bottom, height, sides));
  const mesh = new THREE.Mesh(cylinderGeometry.get(key), surface);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  parent.add(mesh);
  return mesh;
}

function torus(parent, radius, tube, x, y, z, surface, horizontal = true) {
  const key = `${radius}/${tube}`;
  if (!torusGeometry.has(key)) torusGeometry.set(key, new THREE.TorusGeometry(radius, tube, 7, 24));
  const mesh = new THREE.Mesh(torusGeometry.get(key), surface);
  mesh.position.set(x, y, z);
  if (horizontal) mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = false;
  parent.add(mesh);
  return mesh;
}

function pipe(parent, start, end, radius = .045, surface = finish.alloy) {
  const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
  const direction = b.clone().sub(a);
  const mesh = new THREE.Mesh(unitCylinder, surface);
  mesh.position.copy(a.add(b).multiplyScalar(.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  mesh.scale.set(radius, direction.length(), radius);
  mesh.castShadow = false;
  parent.add(mesh);
  return mesh;
}

function vent(parent, x, y, z, width, count = 5, surface = finish.steel) {
  for (let i = 0; i < count; i++)
    box(parent, width, .026, .027, x, y + i * .105, z, surface, false);
}

function display(parent, x, y, z, width = .46) {
  box(parent, width + .07, .29, .065, x, y, z, finish.dark, false);
  box(parent, width, .22, .068, x, y, z + .004, finish.blue, false);
  for (let i = 0; i < 3; i++) box(parent, width * (.57 - i * .08), .014, .069,
    x - .045, y + .065 - i * .055, z + .005, finish.teal, false);
}

function loadPort(parent, x, z = .83) {
  box(parent, .72, .64, .37, x, .5, z, finish.steel);
  box(parent, .57, .14, .41, x, .86, z, finish.dark);
  box(parent, .51, .41, .035, x, .49, z + .205, finish.recess, false);
  for (let i = 0; i < 4; i++) box(parent, .38, .018, .04, x, .34 + i * .09, z + .23, finish.teal, false);
  box(parent, .2, .045, .035, x, .95, z + .21, finish.alloy, false);
}

function cabinetBase(root) {
  box(root, 1.82, .14, 1.88, 0, .09, 0, finish.dark);
  for (const x of [-.72, .72]) for (const z of [-.75, .75])
    box(root, .10, .25, .1, x, .24, z, finish.steel);
  box(root, 1.68, .055, 1.71, 0, .34, 0, finish.alloy);
}

function chiller(root, detail, rotors) {
  box(root, 1.64, 1.02, 1.5, 0, .88, 0);
  box(root, 1.67, .13, 1.56, 0, 1.45, 0, finish.steel);
  for (const x of [-.42, .42]) {
    const fan = cyl(root, .31, .31, .045, x, 1.55, 0, finish.recess, 24);
    fan.userData.role = "fan";
    const blades = new THREE.Group(); blades.position.set(x, 1.585, 0); root.add(blades);
    for (let i = 0; i < 4; i++) {
      const blade = box(blades, .41, .015, .08, .17, 0, 0, finish.alloy, false);
      blade.rotation.y = i * Math.PI / 2;
      blade.position.set(Math.cos(i * Math.PI / 2) * .15, 0, Math.sin(i * Math.PI / 2) * .15);
    }
    rotors.push({ mesh: blades, axis: "y", speed: .018 });
  }
  box(root, .65, .65, .08, .38, .96, .78, finish.dark);
  display(detail, .38, 1.13, .83, .42);
  vent(detail, -.42, .54, .785, .54, 6);
  for (const x of [-.62, .62]) {
    cyl(detail, .14, .14, .56, x, .69, -.7, finish.steel, 14);
    pipe(detail, [x, .93, -.68], [x, 1.3, -.66], .07, finish.teal);
  }
  pipe(detail, [-.62, 1.29, -.66], [.62, 1.29, -.66], .065, finish.teal);
  for (const x of [-.33, .33]) torus(detail, .13, .018, x, .65, .796, finish.orange, false);
}

function airHandler(root, detail, rotors) {
  box(root, 1.7, 1.23, 1.55, 0, .98, 0);
  box(root, 1.2, .34, .9, 0, 1.77, -.18, finish.steel);
  box(root, 1.35, 1.04, .08, 0, .98, .79, finish.dark);
  const fan = new THREE.Group(); fan.position.set(0, 1.01, .86); root.add(fan);
  cyl(fan, .11, .11, .08, 0, 0, 0, finish.teal, 16, false).rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const blade = box(fan, .42, .1, .04, 0, 0, .04, finish.alloy, false);
    blade.rotation.z = i * Math.PI / 3;
  }
  torus(root, .43, .045, 0, 1.01, .89, finish.alloy, false);
  rotors.push({ mesh: fan, axis: "z", speed: .012 });
  vent(detail, -.5, .51, .84, .22, 5);
  vent(detail, .5, .51, .84, .22, 5);
  for (let i = 0; i < 5; i++) box(detail, .028, .78, .035, -.58 + i * .29, .97, -.79, finish.steel, false);
  display(detail, .56, 1.45, .82, .3);
}

function ups(root, detail) {
  for (const x of [-.43, .43]) {
    box(root, .77, 1.51, 1.48, x, 1.09, 0);
    box(root, .66, 1.35, .045, x, 1.1, .765, finish.steel);
    box(root, .58, .18, .052, x, 1.62, .8, finish.recess, false);
    vent(detail, x, .52, .798, .47, 5);
    for (let i = 0; i < 3; i++) box(detail, .035, .035, .054, x - .18 + i * .18, 1.63, .83, finish.teal, false);
  }
  box(root, 1.66, .11, 1.55, 0, 1.91, 0, finish.dark);
  display(detail, -.43, 1.33, .8, .3);
  for (const x of [-.4, .4]) pipe(detail, [x, .5, -.75], [x, .5, -1.02], .07, finish.rubber);
}

function lithography(root, detail) {
  box(root, 1.62, 1.33, 1.43, 0, 1.02, -.11);
  box(root, .82, .65, .065, 0, 1.14, .64, finish.amberGlass, false);
  box(root, 1.67, .09, 1.53, 0, 1.72, -.11, finish.steel);
  cyl(root, .23, .32, .55, -.35, 1.84, -.35, finish.dark, 20);
  cyl(root, .15, .15, .1, -.35, 2.15, -.35, finish.alloy, 20);
  loadPort(root, -.48, .92);
  loadPort(root, .48, .92);
  box(detail, .76, .07, .16, 0, .62, .75, finish.orange, false);
  display(detail, .54, 1.48, .67, .27);
  for (let i = 0; i < 4; i++) box(detail, 1.3, .02, .025, 0, .62 + i * .21, -.85, finish.steel, false);
  pipe(detail, [-.35, 1.58, -.74], [-.35, 2.07, -.35], .048, finish.teal);
}

function deposition(root, detail) {
  box(root, 1.61, .7, 1.46, 0, .65, -.12);
  for (const x of [-.42, .42]) {
    cyl(root, .35, .35, .9, x, 1.42, -.16, finish.steel, 24);
    cyl(root, .39, .39, .11, x, 1.93, -.16, finish.dark, 24);
    torus(root, .30, .035, x, 1.38, .22, finish.teal, false);
    box(detail, .35, .28, .055, x, 1.41, .19, finish.glass, false);
    pipe(detail, [x, 1.98, -.18], [x, 2.18, -.18], .052, finish.alloy);
  }
  pipe(detail, [-.42, 2.18, -.18], [.42, 2.18, -.18], .05, finish.teal);
  box(root, .58, .83, .54, 0, .79, .67, finish.dark);
  display(detail, 0, .91, .97, .4);
  for (let i = 0; i < 3; i++) pipe(detail, [-.68 + i * .22, .69, -.82], [-.68 + i * .22, 1.2, -.82], .027, finish.orange);
}

function etcher(root, detail) {
  box(root, 1.58, 1.25, 1.35, 0, 1.02, -.07);
  box(root, 1.64, .12, 1.43, 0, 1.73, -.07, finish.dark);
  for (const x of [-.46, .46]) {
    cyl(root, .31, .31, .14, x, 1.85, -.21, finish.alloy, 22);
    torus(root, .22, .027, x, 1.93, -.21, finish.orange);
    box(root, .52, .39, .058, x, 1.06, .65, finish.glass, false);
    vent(detail, x, .49, .67, .37, 3);
  }
  box(root, 1.36, .095, .13, 0, .44, .65, finish.orange);
  loadPort(root, 0, .84);
  display(detail, .56, 1.53, .63, .25);
  pipe(detail, [-.46, 1.98, -.2], [-.46, 2.17, -.2], .045, finish.steel);
  pipe(detail, [.46, 1.98, -.2], [.46, 2.17, -.2], .045, finish.steel);
  pipe(detail, [-.46, 2.17, -.2], [.46, 2.17, -.2], .045, finish.teal);
}

function polisher(root, detail, rotors) {
  box(root, 1.65, .66, 1.52, 0, .64, 0);
  const platen = new THREE.Group(); platen.position.set(-.1, 1.05, -.08); root.add(platen);
  cyl(platen, .57, .57, .12, 0, 0, 0, finish.dark, 28);
  cyl(platen, .44, .44, .025, 0, .075, 0, finish.wafer, 28, false);
  torus(platen, .51, .026, 0, .085, 0, finish.teal);
  rotors.push({ mesh: platen, axis: "y", speed: .006 });
  box(root, .16, .83, .16, .59, 1.46, -.49, finish.steel);
  box(root, .72, .13, .13, .23, 1.84, -.49, finish.alloy);
  cyl(root, .24, .24, .23, -.15, 1.66, -.49, finish.steel, 20);
  cyl(root, .18, .18, .04, -.15, 1.5, -.49, finish.rubber, 20);
  box(detail, .3, .35, .08, .59, .9, .78, finish.dark);
  display(detail, .59, .9, .83, .21);
  pipe(detail, [.72, 1.28, -.48], [.72, 1.5, .27], .04, finish.teal);
  box(detail, .16, .46, .43, -.74, .71, .42, finish.alloy);
}

function optical(root, detail, rotors, metrology) {
  box(root, 1.61, .19, 1.47, 0, .47, -.07, finish.dark);
  box(root, 1.61, .13, 1.47, 0, 1.58, -.07);
  box(root, 1.45, 1.03, .12, 0, 1.05, -.75, finish.shell);
  for (const x of [-.73, .73]) {
    box(root, .14, 1.04, 1.47, x, 1.04, -.07);
    box(root, .05, .5, 1.03, x, 1.06, 0, finish.glass, false);
  }
  box(root, 1.31, .56, .055, 0, 1.02, .69, finish.glass, false);
  box(root, 1.26, .09, .08, 0, .69, .7, finish.alloy);
  box(root, 1.26, .09, .08, 0, 1.35, .7, finish.alloy);
  box(root, 1.24, .11, .93, 0, .62, .06, finish.steel);
  box(detail, .98, .62, .045, 0, 1.03, -.83, finish.dark, false);
  vent(detail, -.1, .83, -.86, .49, 5);
  box(detail, .08, .29, .055, .45, 1.02, -.87, finish.alloy, false);
  const chuck = new THREE.Group(); chuck.position.set(-.22, .92, .37); root.add(chuck);
  cyl(chuck, .36, .36, .055, 0, 0, 0, finish.wafer, 28, false);
  torus(chuck, .3, .02, 0, .04, 0, finish.teal);
  rotors.push({ mesh: chuck, axis: "y", speed: .004 });
  box(root, .13, .65, .13, .22, 1.54, -.29, finish.steel);
  cyl(root, metrology ? .17 : .23, .19, .36, .22, 1.9, -.29, finish.dark, 22);
  cyl(root, .14, .14, .06, .22, 1.68, -.29, finish.glass, 20, false);
  torus(root, .19, .028, .22, 1.66, -.29, metrology ? finish.violet : finish.teal);
  box(root, .47, .3, .08, .56, 1.42, .7, finish.recess);
  display(detail, .56, 1.44, .75, .33);
  if (metrology) {
    box(detail, .7, .06, .08, -.33, 1.47, -.35, finish.steel);
    pipe(detail, [-.58, 1.47, -.35], [-.58, 1.06, -.35], .035, finish.violet);
  } else {
    box(detail, 1.11, .06, .07, 0, 1.49, -.44, finish.alloy);
    for (const x of [-.49, .49]) box(detail, .055, .35, .055, x, 1.29, -.44, finish.teal);
  }
  vent(detail, -.57, .45, .69, .26, 4);
}

export function buildEquipmentModel(root, spec) {
  const detail = new THREE.Group();
  detail.visible = false;
  root.add(detail);
  const rotors = [];
  cabinetBase(root);
  switch (spec.type) {
    case "chiller": chiller(root, detail, rotors); break;
    case "air": airHandler(root, detail, rotors); break;
    case "power": ups(root, detail); break;
    case "litho": lithography(root, detail); break;
    case "deposition": deposition(root, detail); break;
    case "etch": etcher(root, detail); break;
    case "cmp": polisher(root, detail, rotors); break;
    case "aoi": optical(root, detail, rotors, false); break;
    case "metrology": optical(root, detail, rotors, true); break;
    default: throw new Error(`Unknown equipment model: ${spec.type}`);
  }
  // A small per-tool badge makes otherwise identical parallel machines distinguishable.
  const serial = spec.index % 4 + 1;
  for (let i = 0; i < serial; i++) box(root, .055, .055, .055, -.69 + i * .11, 1.89, .73, finish.teal, false);
  return { detail, rotors };
}
