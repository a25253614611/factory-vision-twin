import * as THREE from "three";
import { EQUIPMENT, ZONES, zoneStatus } from "./monitor-core.js";
import { box, cyl, buildEquipmentModel } from "./equipment-models.js";

const STATUS_COLORS = { running: 0x58ddb1, warning: 0xffcd74, alarm: 0xff925d,
  down: 0xff5f6c, maintenance: 0x85b9ff, idle: 0x8aa0a8 };
const mat = (color, metalness = .18, roughness = .64) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
const white = mat(0xc9e4df), metal = mat(0x718e9b, .56, .38), dark = mat(0x1d3947),
  cyan = mat(0x42cdbb);

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
export function createMonitorWorld(canvas, callbacks = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 900 ? 1.25 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b2631);
  const camera = new THREE.OrthographicCamera(-20, 20, 15, -15, .1, 110);
  const target = new THREE.Vector3(0, .3, 0);
  const desiredTarget = target.clone();
  let azimuth = .61, zoom = 1, desiredZoom = 1, elevation = 35, desiredElevation = 35,
    distance = 48, desiredDistance = 48, focusedMachine = null;
  let drag = false, downX = 0, downY = 0, lastX = 0, lastY = 0;
  function positionCamera() {
    camera.position.set(target.x + Math.sin(azimuth) * distance, target.y + elevation,
      target.z + Math.cos(azimuth) * distance);
    camera.lookAt(target);
  }
  positionCamera();
  scene.add(new THREE.HemisphereLight(0xe3ffff, 0x173342, 2.3));
  const light = new THREE.DirectionalLight(0xffffff, 2.4); light.position.set(-9, 20, 12); light.castShadow = true;
  light.shadow.mapSize.set(window.innerWidth < 900 ? 768 : 1024, window.innerWidth < 900 ? 768 : 1024);
  Object.assign(light.shadow.camera, { left: -22, right: 22, top: 18, bottom: -18, far: 65 });
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
  const bayGroups = new Map(), bayBorders = new Map(), bayLabels = [];
  for (const zone of ZONES) {
    const group = new THREE.Group(); group.position.set(zone.x, 0, zone.z); scene.add(group); bayGroups.set(zone.id, group);
    box(group, 9.45, .08, 8.6, 0, -.03, 0, mat(0x31505c));
    box(group, 9.10, .095, 8.26, 0, -.005, 0, mat(0x1c3d4a));
    const border = box(group, 9.42, .035, .14, 0, .055, 4.25, mat(0x4d9a95));
    box(group, 9.42, .035, .14, 0, .055, -4.25, metal);
    for (const x of [-4.65, 4.65]) box(group, .1, .04, 8.5, x, .06, 0, metal);
    const zoneLabel = new THREE.Sprite(label(`${zone.code} · ${zone.name}`, "#c0f6ed", "#173440", 30));
    zoneLabel.position.set(0, 2.7, -3.85); zoneLabel.scale.set(5.0, .94, 1); group.add(zoneLabel);
    bayLabels.push(zoneLabel);
    bayBorders.set(zone.id, border);
  }
  // An overhead transport line ties the six synthetic bays together.
  const transport = new THREE.Group(); scene.add(transport);
  for (const x of [-14, -7, 0, 7, 14]) {
    box(transport, .16, 3.2, .16, x, 1.69, 0, metal);
    box(transport, .9, .08, .14, x, 3.32, 0, metal);
  }
  for (const z of [-.23, .23]) box(transport, 30.5, .13, .1, 0, 3.25, z, dark);
  const carrier = new THREE.Group(); transport.add(carrier);
  box(carrier, 1.1, .52, .7, 0, 2.79, 0, white);
  box(carrier, .85, .08, .55, 0, 3.15, 0, metal);
  box(carrier, .72, .07, .12, 0, 2.77, .36, cyan);
  const machines = new Map(), pickables = [];
  for (const spec of EQUIPMENT) {
    const zoneGroup = bayGroups.get(spec.zone);
    const local = spec.index % 4;
    const group = new THREE.Group(); group.position.set(local % 2 ? 2.15 : -2.15, 0, local < 2 ? -1.45 : 1.55);
    group.userData.machineId = spec.id; zoneGroup.add(group); machines.set(spec.id, group); pickables.push(group);
    group.userData.model = buildEquipmentModel(group, spec);
    const statusMaterial = new THREE.MeshBasicMaterial({ color: STATUS_COLORS.running });
    const beacon = cyl(group, .14, .14, .14, -.69, 2.06, .65, statusMaterial, 16);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.04, 1.14, 32), new THREE.MeshBasicMaterial({ color: 0x7be8d2, transparent: true, opacity: .0, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .18; group.add(ring);
    const idLabel = new THREE.Sprite(label(spec.id, "#e9ffff", "#1b3e49", 44));
    idLabel.position.set(0, 2.41, .75); idLabel.scale.set(1.85, .35, 1); group.add(idLabel);
    group.userData.beacon = beacon; group.userData.ring = ring; group.userData.idLabel = idLabel;
  }
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let selected = EQUIPMENT[0].id, renderWidth = 0, renderHeight = 0;
  function resize() {
    const width = canvas.clientWidth, height = canvas.clientHeight; if (!width || !height) return;
    if (width !== renderWidth || height !== renderHeight) {
      renderer.setSize(width, height, false);
      renderWidth = width; renderHeight = height;
    }
    const aspect = width / height;
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
  function showModelDetails(id) {
    focusedMachine = id;
    const activeZone = EQUIPMENT.find((spec) => spec.id === id)?.zone;
    for (const [zoneId, group] of bayGroups) group.visible = !id || zoneId === activeZone;
    for (const [machineId, group] of machines) {
      group.visible = !id || machineId === id;
      group.userData.model.detail.visible = machineId === id;
      group.userData.idLabel.visible = !id;
    }
    for (const item of bayLabels) item.visible = !id;
    transport.visible = !id;
  }
  function focusZone(zoneId) {
    const zone = ZONES.find((item) => item.id === zoneId);
    showModelDetails(null);
    desiredTarget.set(zone ? zone.x : 0, .3, zone ? zone.z : 0);
    desiredZoom = zone ? 1.65 : 1;
    desiredElevation = 35; desiredDistance = 48;
  }
  function focusMachine(id) {
    const group = machines.get(id);
    if (!group) return;
    select(id); showModelDetails(id);
    const position = group.getWorldPosition(new THREE.Vector3());
    desiredTarget.set(position.x, 1.0, position.z);
    desiredZoom = 6.3; desiredElevation = 10; desiredDistance = 16;
  }
  function setState(state) {
    for (const machine of state.machines) {
      const group = machines.get(machine.id);
      group.userData.beacon.material.color.setHex(STATUS_COLORS[machine.status]);
      group.userData.ring.material.color.setHex(machine.status === "running" ? 0x8ff5dc : STATUS_COLORS[machine.status]);
      group.userData.operating = ["running", "warning", "alarm"].includes(machine.status);
    }
    for (const zone of ZONES) bayBorders.get(zone.id).material.color.setHex(STATUS_COLORS[zoneStatus(state, zone.id)]);
  }
  canvas.addEventListener("pointerdown", (event) => {
    drag = true; downX = lastX = event.clientX; downY = lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag) return;
    if (Math.hypot(event.clientX - downX, event.clientY - downY) > 5) {
      azimuth += (event.clientX - lastX) * .007;
      desiredElevation = Math.max(focusedMachine ? 4 : 17,
        Math.min(focusedMachine ? 28 : 60, desiredElevation + (event.clientY - lastY) * .08));
    }
    lastX = event.clientX; lastY = event.clientY;
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!drag) return; drag = false;
    if (Math.hypot(event.clientX - downX, event.clientY - downY) > 8) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    for (const hit of raycaster.intersectObjects(pickables.filter((group) => group.visible), true)) {
      let object = hit.object;
      while (object && !object.userData.machineId) object = object.parent;
      if (object?.userData.machineId) { select(object.userData.machineId); callbacks.onSelect?.(selected); return; }
    }
  });
  canvas.addEventListener("pointercancel", () => { drag = false; });
  canvas.addEventListener("dblclick", () => {
    focusMachine(selected);
    callbacks.onFocus?.(selected);
  });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    desiredZoom = Math.max(.7, Math.min(focusedMachine ? 8 : 2.8, desiredZoom - event.deltaY * .0009));
  }, { passive: false });
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let animationId = 0, lastFrame = 0, inView = true, disposed = false;
  function startLoop() {
    if (!disposed && inView && !document.hidden && !animationId)
      animationId = requestAnimationFrame(animate);
  }
  function animate(time) {
    animationId = 0;
    if (disposed || !inView || document.hidden) return;
    if (lastFrame && time - lastFrame < 32) { startLoop(); return; }
    const frameFactor = Math.min(2.5, (time - (lastFrame || time - 32)) / 16.7);
    lastFrame = time;
    target.lerp(desiredTarget, .19);
    zoom += (desiredZoom - zoom) * .19;
    elevation += (desiredElevation - elevation) * .19;
    distance += (desiredDistance - distance) * .19;
    positionCamera(); resize();
    if (!reducedMotion) carrier.position.x = Math.sin(time * .00022) * 14.7;
    const selectedGroup = machines.get(selected);
    if (selectedGroup && !reducedMotion)
      selectedGroup.userData.ring.scale.setScalar(1 + .07 * Math.sin(time * .004));
    if (!reducedMotion) for (const group of machines.values()) {
      if (!group.userData.operating) continue;
      for (const rotor of group.userData.model.rotors)
        rotor.mesh.rotation[rotor.axis] += rotor.speed * frameFactor;
    }
    renderer.render(scene, camera);
    startLoop();
  }
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) startLoop();
  }, { threshold: .01 });
  visibilityObserver.observe(canvas);
  document.addEventListener("visibilitychange", startLoop);
  startLoop();
  return {
    select, focusZone, focusMachine, setState,
    dispose() {
      disposed = true;
      cancelAnimationFrame(animationId);
      observer.disconnect(); visibilityObserver.disconnect();
      document.removeEventListener("visibilitychange", startLoop);
      renderer.dispose();
    }
  };
}
