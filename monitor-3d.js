import * as THREE from "three";
import { EQUIPMENT, ZONES, zoneStatus } from "./monitor-core.js";

const STATUS_COLORS = { running: 0x58ddb1, warning: 0xffcd74, alarm: 0xff925d,
  down: 0xff5f6c, maintenance: 0x85b9ff, idle: 0x8aa0a8 };
const mat = (color, metalness = .18, roughness = .64) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
const white = mat(0xc9e4df), metal = mat(0x718e9b, .56, .38), dark = mat(0x1d3947),
  glass = new THREE.MeshStandardMaterial({ color: 0x6fd2cf, transparent: true, opacity: .42, metalness: .1, roughness: .25 }),
  cyan = mat(0x42cdbb), inner = mat(0x294b59);

function box(parent, w, h, d, x, y, z, material = white) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function cyl(parent, rTop, rBottom, h, x, y, z, material = metal, sides = 20) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, sides), material);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function label(text, foreground = "#c9fff1", background = "#163542", size = 29) {
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = background; ctx.fillRect(0, 0, 512, 96);
  ctx.strokeStyle = foreground; ctx.lineWidth = 4; ctx.strokeRect(3, 3, 506, 90);
  ctx.font = `bold ${size}px system-ui,sans-serif`; ctx.fillStyle = foreground;
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, 256, 49, 480);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
}
function machineModel(root, type) {
  box(root, 1.65, .14, 1.65, 0, .10, 0, dark);
  for (const x of [-.62, .62]) for (const z of [-.62, .62]) box(root, .12, .36, .12, x, .24, z, metal);
  if (type === "chiller") {
    box(root, 1.45, 1.2, 1.28, 0, .9, 0, white);
    for (const x of [-.43, .43]) cyl(root, .25, .25, .1, x, 1.55, -.13, metal);
    for (let n = 0; n < 5; n++) box(root, 1.2, .045, .05, 0, .5 + n * .18, .67, inner);
    box(root, .44, .26, .06, .4, 1.14, .67, dark);
  } else if (type === "air") {
    box(root, 1.45, 1.38, 1.28, 0, .98, 0, white);
    const fan = cyl(root, .44, .44, .055, 0, 1.11, .68, metal, 24); fan.rotation.x = Math.PI / 2;
    for (const angle of [0, Math.PI / 2]) {
      const blade = box(root, .68, .08, .08, 0, 1.11, .72, dark); blade.rotation.z = angle;
    }
  } else if (type === "power") {
    for (const x of [-.42, .42]) {
      box(root, .62, 1.42, 1.28, x, 1.0, 0, white);
      for (let n = 0; n < 4; n++) box(root, .43, .13, .04, x, .55 + n * .28, .67, inner);
    }
  } else if (type === "litho") {
    box(root, 1.52, 1.4, 1.35, 0, 1.0, 0, white);
    box(root, .96, .73, .08, 0, 1.12, .71, glass);
    cyl(root, .25, .27, .45, -.15, 1.05, .43, dark);
    box(root, .45, .32, .07, .48, 1.44, .72, inner);
    box(root, .95, .1, .18, 0, 1.82, 0, cyan);
  } else if (type === "deposition") {
    box(root, 1.48, .65, 1.25, 0, .55, 0, white);
    for (const x of [-.39, .39]) {
      cyl(root, .35, .35, .93, x, 1.32, -.14, metal, 24);
      cyl(root, .36, .36, .12, x, 1.85, -.14, dark, 24);
    }
    box(root, .75, .3, .07, 0, .74, .66, inner);
  } else if (type === "etch") {
    box(root, 1.48, 1.36, 1.3, 0, .98, 0, white);
    for (const x of [-.45, .45]) {
      cyl(root, .31, .31, .14, x, 1.85, -.09, metal, 24);
      box(root, .48, .43, .06, x, 1.1, .68, glass);
    }
    box(root, 1.35, .085, .10, 0, .41, .71, mat(0xe4ae61));
  } else if (type === "cmp") {
    box(root, 1.48, .67, 1.36, 0, .56, 0, white);
    cyl(root, .53, .53, .13, 0, 1.0, -.1, dark, 28);
    cyl(root, .38, .38, .06, 0, 1.1, -.1, metal, 28);
    box(root, .14, .78, .14, .51, 1.46, -.39, metal);
    box(root, .78, .1, .1, .18, 1.8, -.39, metal);
    box(root, .46, .34, .06, -.4, .7, .72, inner);
  } else {
    box(root, 1.48, 1.13, 1.32, 0, .85, 0, white);
    box(root, 1.04, .11, .77, 0, .75, .51, dark);
    cyl(root, .35, .35, .05, 0, .84, .48, mat(0x576da0), 32);
    box(root, .12, .85, .12, 0, 1.54, .15, metal);
    cyl(root, .22, .18, .31, 0, 1.83, .15, dark, 24);
    box(root, .45, .34, .06, .48, 1.36, .70, inner);
    if (type === "metrology") cyl(root, .16, .16, .29, -.44, 1.39, -.1, cyan, 20);
  }
  box(root, .52, .06, .08, .47, 1.8, .61, cyan);
}

export function createMonitorWorld(canvas, callbacks = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b2631);
  const camera = new THREE.OrthographicCamera(-20, 20, 15, -15, .1, 110);
  const target = new THREE.Vector3(0, .3, 0);
  let azimuth = .61, zoom = 1, drag = false, downX = 0, downY = 0, lastX = 0;
  function positionCamera() {
    camera.position.set(target.x + Math.sin(azimuth) * 48, target.y + 35, target.z + Math.cos(azimuth) * 48);
    camera.lookAt(target); camera.updateProjectionMatrix();
  }
  positionCamera();
  scene.add(new THREE.HemisphereLight(0xe3ffff, 0x173342, 2.3));
  const light = new THREE.DirectionalLight(0xffffff, 2.4); light.position.set(-9, 20, 12); light.castShadow = true;
  light.shadow.mapSize.set(1536, 1536); Object.assign(light.shadow.camera, { left: -22, right: 22, top: 18, bottom: -18, far: 65 });
  light.shadow.bias = -.00025; scene.add(light);
  const floor = box(scene, 35.8, .26, 22.2, 0, -.2, 0, mat(0x16313e));
  floor.receiveShadow = true;
  const tileTexture = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const ctx = c.getContext("2d"); ctx.fillStyle = "#244552"; ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "#355b68"; ctx.lineWidth = 2;
    for (let i = 0; i <= 256; i += 32) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke(); }
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(6, 4); return texture;
  })();
  const tile = new THREE.Mesh(new THREE.PlaneGeometry(35.8, 22.2), new THREE.MeshStandardMaterial({ map: tileTexture, roughness: .86 }));
  tile.rotation.x = -Math.PI / 2; tile.position.y = -.055; tile.receiveShadow = true; scene.add(tile);
  for (const z of [-10.9, 10.9]) box(scene, 35.9, .85, .18, 0, .3, z, metal);
  for (const x of [-17.8, 17.8]) box(scene, .18, .85, 22, x, .3, 0, metal);
  box(scene, 34, .035, 1.35, 0, .005, 0, mat(0x388c91));
  const bayGroups = new Map(), bayBorders = new Map();
  for (const zone of ZONES) {
    const group = new THREE.Group(); group.position.set(zone.x, 0, zone.z); scene.add(group); bayGroups.set(zone.id, group);
    box(group, 9.45, .08, 8.6, 0, -.03, 0, mat(0x31505c));
    box(group, 9.10, .095, 8.26, 0, -.005, 0, mat(0x1c3d4a));
    const border = box(group, 9.42, .035, .14, 0, .055, 4.25, mat(0x4d9a95));
    box(group, 9.42, .035, .14, 0, .055, -4.25, metal);
    for (const x of [-4.65, 4.65]) box(group, .1, .04, 8.5, x, .06, 0, metal);
    const zoneLabel = new THREE.Sprite(label(`${zone.code} · ${zone.name}`, "#c0f6ed", "#173440", 30));
    zoneLabel.position.set(0, 2.7, -3.85); zoneLabel.scale.set(5.0, .94, 1); group.add(zoneLabel);
    bayBorders.set(zone.id, border);
  }
  // An overhead transport line ties the six synthetic bays together.
  for (const x of [-14, -7, 0, 7, 14]) {
    box(scene, .16, 3.2, .16, x, 1.69, 0, metal);
    box(scene, .9, .08, .14, x, 3.32, 0, metal);
  }
  for (const z of [-.23, .23]) box(scene, 30.5, .13, .1, 0, 3.25, z, dark);
  const carrier = new THREE.Group(); scene.add(carrier);
  box(carrier, 1.1, .52, .7, 0, 2.79, 0, white);
  box(carrier, .85, .08, .55, 0, 3.15, 0, metal);
  box(carrier, .72, .07, .12, 0, 2.77, .36, cyan);
  const machines = new Map(), pickables = [];
  for (const spec of EQUIPMENT) {
    const zoneGroup = bayGroups.get(spec.zone);
    const local = spec.index % 4;
    const group = new THREE.Group(); group.position.set(local % 2 ? 2.15 : -2.15, 0, local < 2 ? -1.45 : 1.55);
    group.userData.machineId = spec.id; zoneGroup.add(group); machines.set(spec.id, group); pickables.push(group);
    machineModel(group, spec.type);
    const statusMaterial = new THREE.MeshBasicMaterial({ color: STATUS_COLORS.running });
    const beacon = cyl(group, .16, .16, .14, -.60, 1.83, .62, statusMaterial, 16);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.85, .92, 32), new THREE.MeshBasicMaterial({ color: 0x7be8d2, transparent: true, opacity: .0, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .08; group.add(ring);
    const idLabel = new THREE.Sprite(label(spec.id, "#e9ffff", "#1b3e49", 44));
    idLabel.position.set(0, 2.25, .75); idLabel.scale.set(1.85, .35, 1); group.add(idLabel);
    group.userData.beacon = beacon; group.userData.ring = ring;
  }
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let selected = EQUIPMENT[0].id, currentState = null;
  function resize() {
    const width = canvas.clientWidth, height = canvas.clientHeight; if (!width || !height) return;
    renderer.setSize(width, height, false); const aspect = width / height;
    const span = Math.max(25 / zoom, 37 / (aspect * zoom));
    camera.left = -span * aspect / 2; camera.right = span * aspect / 2;
    camera.top = span / 2; camera.bottom = -span / 2; camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
  function select(id) {
    if (!machines.has(id)) return;
    selected = id;
    for (const [machineId, group] of machines) group.userData.ring.material.opacity = machineId === id ? .95 : 0;
  }
  select(selected);
  function focusZone(zoneId) {
    const zone = ZONES.find((item) => item.id === zoneId);
    target.set(zone ? zone.x : 0, .3, zone ? zone.z : 0);
    zoom = zone ? 1.32 : 1;
    positionCamera(); resize();
  }
  function setState(state) {
    currentState = state;
    for (const machine of state.machines) {
      const group = machines.get(machine.id);
      group.userData.beacon.material.color.setHex(STATUS_COLORS[machine.status]);
      group.userData.ring.material.color.setHex(machine.status === "running" ? 0x8ff5dc : STATUS_COLORS[machine.status]);
    }
    for (const zone of ZONES) bayBorders.get(zone.id).material.color.setHex(STATUS_COLORS[zoneStatus(state, zone.id)]);
  }
  canvas.addEventListener("pointerdown", (event) => { drag = true; downX = lastX = event.clientX; downY = event.clientY; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag) return;
    if (Math.abs(event.clientX - downX) > 6) { azimuth = Math.max(-.75, Math.min(1.25, azimuth + (event.clientX - lastX) * .005)); positionCamera(); }
    lastX = event.clientX;
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!drag) return; drag = false;
    if (Math.hypot(event.clientX - downX, event.clientY - downY) > 8) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    for (const hit of raycaster.intersectObjects(pickables, true)) {
      let object = hit.object;
      while (object && !object.userData.machineId) object = object.parent;
      if (object?.userData.machineId) { select(object.userData.machineId); callbacks.onSelect?.(selected); return; }
    }
  });
  canvas.addEventListener("pointercancel", () => { drag = false; });
  canvas.addEventListener("wheel", (event) => { event.preventDefault(); zoom = Math.max(.74, Math.min(1.85, zoom - event.deltaY * .0007)); resize(); }, { passive: false });
  let animationId = 0;
  function animate(time) {
    animationId = requestAnimationFrame(animate);
    carrier.position.x = Math.sin(time * .00022) * 14.7;
    const selectedGroup = machines.get(selected);
    if (selectedGroup) selectedGroup.userData.ring.scale.setScalar(1 + .07 * Math.sin(time * .004));
    renderer.render(scene, camera);
  }
  animationId = requestAnimationFrame(animate);
  return { select, focusZone, setState, dispose() { cancelAnimationFrame(animationId); observer.disconnect(); renderer.dispose(); } };
}
