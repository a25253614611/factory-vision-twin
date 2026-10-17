import * as THREE from "three";

const canvas = document.getElementById("threeCanvas");
const fallback = document.getElementById("sceneFallback");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
} catch (error) {
  fallback.hidden = false;
  console.warn("Wafer 3D view unavailable:", error);
}

if (renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1a2b);
  scene.fog = new THREE.Fog(0x0b1a2b, 17, 31);
  const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 80);
  const target = new THREE.Vector3(0, 1.0, 0);
  let azimuth = 0.62, polar = 1.04, radius = 18.5;
  function updateCamera() {
    camera.position.set(radius * Math.sin(polar) * Math.sin(azimuth),
      target.y + radius * Math.cos(polar), radius * Math.sin(polar) * Math.cos(azimuth));
    camera.lookAt(target);
  }
  updateCamera();

  const mat = (color, metalness = 0.1, roughness = 0.5) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const steel = mat(0x57778b, 0.7, 0.35);
  const dark = mat(0x203849, 0.55, 0.42);
  const deck = mat(0x25475b, 0.45, 0.44);
  const cyan = new THREE.MeshStandardMaterial({ color: 0x61dbed, emissive: 0x178aa3, emissiveIntensity: 0.55 });
  const green = new THREE.MeshStandardMaterial({ color: 0x53e6b2, emissive: 0x168a5c, emissiveIntensity: 0.5 });
  const coral = new THREE.MeshStandardMaterial({ color: 0xff8a73, emissive: 0x8a2e25, emissiveIntensity: 0.65 });

  function box(w, h, d, material, x, y, z, parent = scene) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  function cylinder(radius, height, material, x, y, z, parent = scene) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 32), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  function torus(radius, tube, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, 72), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  }
  function label(text, color, x, y, z, scale = 1) {
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 320;
    labelCanvas.height = 64;
    const ctx = labelCanvas.getContext("2d");
    ctx.fillStyle = "#0c2435e8";
    ctx.fillRect(0, 0, 320, 64);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 316, 60);
    ctx.fillStyle = color;
    ctx.font = "bold 25px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 160, 33);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(labelCanvas), transparent: true }));
    sprite.position.set(x, y, z);
    sprite.scale.set(2.7 * scale, 0.54 * scale, 1);
    scene.add(sprite);
  }

  scene.add(new THREE.HemisphereLight(0xb9e7f4, 0x132b3d, 2.0));
  const key = new THREE.DirectionalLight(0xb6eeff, 2.8);
  key.position.set(-4, 9, 5);
  scene.add(key);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(25, 14), mat(0x102638, 0.15, 0.82));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.03;
  scene.add(floor);
  const grid = new THREE.GridHelper(25, 25, 0x305d77, 0x234459);
  grid.position.y = 0.012;
  scene.add(grid);

  // Three fictional process modules and a wafer transfer rail.
  box(15.2, 0.16, 1.25, steel, 0, 0.63, 0);
  box(15.0, 0.08, 0.97, deck, 0, 0.75, 0);
  for (const x of [-6.6, -3.2, 0.2, 3.6, 6.6]) {
    box(0.18, 0.54, 1.1, dark, x, 0.29, 0);
    box(0.09, 0.02, 0.9, cyan, x, 0.8, 0);
  }
  for (const [x, name] of [[-4.7, "DEPOSITION"], [0, "ETCH"], [4.7, "OPTICAL REVIEW"]]) {
    box(2.6, 2.05, 1.85, dark, x, 1.07, -2.0);
    box(2.25, 1.35, 0.13, steel, x, 1.15, -1.03);
    box(1.68, 0.78, 0.025, mat(0x102e42), x, 1.15, -0.94);
    box(1.1, 0.05, 0.04, cyan, x, 1.58, -0.92);
    label(name, name === "OPTICAL REVIEW" ? "#71e4c1" : "#8bdced", x, 2.54, -1.1,
      name === "OPTICAL REVIEW" ? 0.88 : 0.8);
  }
  // Inspection optics and wafer stage.
  box(0.16, 1.52, 0.17, steel, 4.7, 2.5, 0.1);
  cylinder(0.34, 0.42, dark, 4.7, 1.66, 0.1);
  torus(0.46, 0.055, cyan, 4.7, 1.35, 0.1);
  const inspectionLight = new THREE.PointLight(0x6de4ef, 2.7, 4);
  inspectionLight.position.set(4.7, 1.55, 0.1);
  scene.add(inspectionLight);

  // FOUP-inspired carrier and two review destinations; all geometry is fictional.
  box(1.28, 1.36, 1.48, dark, -7.75, 0.77, 1.95);
  box(1.28, 0.13, 1.48, cyan, -7.75, 1.51, 1.95);
  for (const height of [0.52, 0.76, 1.0, 1.24]) box(0.92, 0.04, 0.9, steel, -7.75, height, 2.7);
  label("WAFER CARRIER", "#9be7ef", -7.5, 2.0, 2.1, 0.7);
  box(3.1, 0.13, 0.68, green, 7.15, 0.64, -1.65);
  box(3.1, 0.13, 0.68, coral, 7.15, 0.64, 1.65);
  label("PASS", "#7af1bb", 7.1, 1.62, -1.65, 0.7);
  label("REVIEW", "#ffa993", 7.1, 1.62, 1.65, 0.7);

  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = textureCanvas.height = 256;
  const tctx = textureCanvas.getContext("2d");
  tctx.fillStyle = "#3b788b";
  tctx.beginPath(); tctx.arc(128, 128, 126, 0, Math.PI * 2); tctx.fill();
  tctx.save();
  tctx.beginPath(); tctx.arc(128, 128, 125, 0, Math.PI * 2); tctx.clip();
  tctx.strokeStyle = "#1b465b";
  tctx.lineWidth = 3;
  for (let p = 6; p < 256; p += 22) {
    tctx.beginPath(); tctx.moveTo(p, 0); tctx.lineTo(p, 256); tctx.stroke();
    tctx.beginPath(); tctx.moveTo(0, p); tctx.lineTo(256, p); tctx.stroke();
  }
  tctx.restore();
  const waferMat = mat(0x569bb0, 0.72, 0.27);
  const waferTop = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(textureCanvas), transparent: true, side: THREE.DoubleSide });
  const waferGeometry = new THREE.CylinderGeometry(0.68, 0.68, 0.065, 64);
  const topGeometry = new THREE.CircleGeometry(0.67, 64);
  const markerGeometry = new THREE.SphereGeometry(0.075, 12, 8);
  const wafers = [];
  function createWafer(verdict = "neutral", detail = null, demo = false) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(waferGeometry, waferMat));
    const top = new THREE.Mesh(topGeometry, waferTop);
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.038;
    group.add(top);
    if (detail?.boxes?.length) {
      for (const finding of detail.boxes.slice(0, 12)) {
        const x = ((finding.x + finding.w / 2) / detail.width - 0.5) * 1.28;
        const z = ((finding.y + finding.h / 2) / detail.height - 0.5) * 1.28;
        if (x * x + z * z > 0.57 ** 2) continue;
        const marker = new THREE.Mesh(markerGeometry, coral);
        marker.position.set(x, 0.095, z);
        group.add(marker);
      }
    }
    group.position.set(-7.2, 0.92, 0);
    scene.add(group);
    wafers.push({ group, verdict, demo, speed: demo ? 1.18 : 1.48 });
  }
  createWafer("neutral", null, true);
  wafers[0].group.position.x = -2.3;
  createWafer("neutral", null, true);
  wafers[1].group.position.x = 2.1;

  function removeWafer(wafer) { scene.remove(wafer.group); }
  window.addEventListener("flowtwin:inspection", (event) => {
    createWafer(event.detail.verdict, event.detail);
    if (wafers.length > 14) removeWafer(wafers.shift());
  });
  window.addEventListener("flowtwin:reset", () => {
    for (let i = wafers.length - 1; i >= 0; i--) {
      if (!wafers[i].demo) { removeWafer(wafers[i]); wafers.splice(i, 1); }
    }
  });

  const flow = [];
  const flowGeometry = new THREE.SphereGeometry(0.046, 8, 6);
  for (let i = 0; i < 12; i++) {
    const dot = new THREE.Mesh(flowGeometry, cyan);
    dot.position.y = 0.83;
    dot.position.z = -0.52;
    scene.add(dot);
    flow.push(dot);
  }

  let pointer = null;
  canvas.addEventListener("pointerdown", (event) => {
    pointer = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!pointer) return;
    azimuth -= (event.clientX - pointer.x) * 0.006;
    polar = Math.max(0.36, Math.min(1.46, polar + (event.clientY - pointer.y) * 0.006));
    pointer = { x: event.clientX, y: event.clientY };
    updateCamera();
  });
  canvas.addEventListener("pointerup", () => { pointer = null; });
  canvas.addEventListener("pointercancel", () => { pointer = null; });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    radius = Math.max(10, Math.min(28, radius + event.deltaY * 0.015));
    updateCamera();
  }, { passive: false });
  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  let previous = performance.now();
  function animate(time) {
    const dt = Math.min((time - previous) / 1000, 0.05);
    previous = time;
    for (let i = wafers.length - 1; i >= 0; i--) {
      const wafer = wafers[i];
      wafer.group.position.x += wafer.speed * dt;
      if (wafer.group.position.x > 5.3 && wafer.verdict !== "neutral") {
        const destination = wafer.verdict === "review" ? 1.65 : -1.65;
        wafer.group.position.z += Math.sign(destination - wafer.group.position.z) *
          Math.min(Math.abs(destination - wafer.group.position.z), dt * 1.12);
      }
      if (wafer.group.position.x > 8.5) {
        removeWafer(wafer);
        wafers.splice(i, 1);
        if (wafer.demo && wafers.filter((item) => item.demo).length < 2) createWafer("neutral", null, true);
      }
    }
    flow.forEach((dot, index) => { dot.position.x = -7.2 + ((time * 0.0014 + index * 1.24) % 14.5); });
    inspectionLight.intensity = 2.5 + Math.sin(time * 0.004) * 0.3;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}
