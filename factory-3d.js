import * as THREE from "three";

const canvas = document.getElementById("threeCanvas");
const fallback = document.getElementById("sceneFallback");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
} catch (error) {
  fallback.hidden = false;
  console.warn("3D visualization unavailable:", error);
}

if (renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1a2a);
  scene.fog = new THREE.Fog(0x0d1a2a, 15, 32);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100);
  const target = new THREE.Vector3(0, 0.95, 0);
  let azimuth = 0.67, polar = 1.08, radius = 17.8;

  function updateCamera() {
    camera.position.set(
      target.x + radius * Math.sin(polar) * Math.sin(azimuth),
      target.y + radius * Math.cos(polar),
      target.z + radius * Math.sin(polar) * Math.cos(azimuth)
    );
    camera.lookAt(target);
  }
  updateCamera();

  const material = (color, metalness = 0.1, roughness = 0.5) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const steel = material(0x536a79, 0.74, 0.31);
  const darkSteel = material(0x233b4a, 0.64, 0.35);
  const beltMat = material(0x253340, 0.2, 0.85);
  const cyanMat = new THREE.MeshStandardMaterial({ color: 0x55d5ed, emissive: 0x1789a2, emissiveIntensity: 0.85 });
  const greenMat = new THREE.MeshStandardMaterial({ color: 0x4be0a9, emissive: 0x107955, emissiveIntensity: 0.45 });
  const reviewMat = new THREE.MeshStandardMaterial({ color: 0xff8b73, emissive: 0x8f2c29, emissiveIntensity: 0.55 });

  function box(width, height, depth, colorOrMaterial, x, y, z, parent = scene) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth),
      typeof colorOrMaterial === "number" ? material(colorOrMaterial) : colorOrMaterial);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  function cylinder(radius, height, colorOrMaterial, x, y, z, parent = scene) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 20),
      typeof colorOrMaterial === "number" ? material(colorOrMaterial) : colorOrMaterial);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  scene.add(new THREE.HemisphereLight(0x9cdeff, 0x183040, 2.3));
  const key = new THREE.DirectionalLight(0xe6f9ff, 2.1);
  key.position.set(-5, 9, 6);
  scene.add(key);
  const fill = new THREE.PointLight(0x51d5e9, 25, 11);
  fill.position.set(0, 4, 0);
  scene.add(fill);

  box(17, 0.25, 10, 0x15283a, 0, -0.22, 0);
  const grid = new THREE.GridHelper(17, 18, 0x3a6a7a, 0x294658);
  grid.position.y = -0.08;
  scene.add(grid);
  box(14.2, 0.2, 2.65, steel, 0, 0.43, 0);
  box(13.7, 0.08, 2.1, beltMat, 0, 0.58, 0);
  box(13.9, 0.2, 0.13, darkSteel, 0, 0.67, -1.14);
  box(13.9, 0.2, 0.13, darkSteel, 0, 0.67, 1.14);
  for (let x = -6.6; x <= 6.6; x += 0.56) {
    box(0.042, 0.025, 2.02, 0x526271, x, 0.64, 0);
  }
  for (const x of [-5.4, -2.7, 0, 2.7, 5.4]) {
    for (const z of [-1.0, 1.0]) box(0.15, 0.7, 0.18, steel, x, 0.05, z);
  }

  // Inspection camera and light ring.
  box(0.23, 3.3, 0.23, steel, 0, 2.1, -2.1);
  box(2.2, 0.22, 0.22, steel, 0, 3.67, -1.05);
  box(0.92, 0.58, 0.78, darkSteel, 0, 3.36, 0.05);
  cylinder(0.24, 0.28, 0x121e2e, 0, 2.95, 0.05);
  cylinder(0.11, 0.03, cyanMat, 0, 2.79, 0.05);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.83, 0.055, 8, 48), cyanMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 2.58, 0.05);
  scene.add(ring);
  box(0.085, 2.08, 2.02, new THREE.MeshBasicMaterial({ color: 0x37c9de, transparent: true, opacity: 0.10, depthWrite: false }), 0, 1.64, 0.05);
  for (const x of [-0.95, 0.95]) {
    const marker = box(0.07, 0.03, 2.15, cyanMat, x, 0.67, 0);
    marker.material.transparent = true;
    marker.material.opacity = 0.6;
  }

  // Diverter and output lanes.
  box(0.35, 0.8, 0.35, steel, 4.4, 1.0, -1.65);
  box(1.6, 0.12, 0.17, cyanMat, 4.7, 1.33, -0.91).rotation.y = -0.45;
  box(3.3, 0.17, 1.38, 0x234b48, 6.38, 0.39, -2.2).rotation.y = 0.28;
  box(3.3, 0.17, 1.38, 0x563a3b, 6.38, 0.39, 2.2).rotation.y = -0.28;
  box(2.4, 0.09, 0.09, greenMat, 6.5, 0.52, -2.2);
  box(2.4, 0.09, 0.09, reviewMat, 6.5, 0.52, 2.2);

  function label(text, color, x, y, z) {
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 420; labelCanvas.height = 84;
    const ctx = labelCanvas.getContext("2d");
    ctx.fillStyle = "#102337e9";
    ctx.fillRect(0, 0, 420, 84);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 416, 80);
    ctx.font = "bold 36px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.fillText(text, 210, 53);
    const texture = new THREE.CanvasTexture(labelCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.scale.set(2.5, 0.5, 1);
    sprite.position.set(x, y, z);
    scene.add(sprite);
  }
  label("VISION INSPECT", "#70e7ee", 0, 4.35, 0);
  label("PASS", "#71e7b0", 6.2, 1.65, -2.6);
  label("REVIEW", "#ffa390", 6.2, 1.65, 2.55);

  const pieces = [];
  const screwMat = material(0xc6d7da, 0.8, 0.22);
  const neutralMat = material(0x4c8090);
  const reusablePieceMaterials = new Set([reviewMat, greenMat, neutralMat, screwMat]);
  function removePiece(piece) {
    scene.remove(piece.group);
    piece.group.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry.dispose();
      if (!reusablePieceMaterials.has(child.material)) child.material.dispose();
    });
  }
  function createPiece(verdict, demo = false) {
    const group = new THREE.Group();
    box(0.98, 0.16, 0.78, 0x172c3a, 0, 0, 0, group);
    box(0.83, 0.055, 0.64, verdict === "review" ? reviewMat : verdict === "clear" ? greenMat : neutralMat, 0, 0.11, 0, group);
    box(0.42, 0.045, 0.32, 0x293f53, 0, 0.16, 0, group);
    for (const sx of [-0.34, 0.34]) {
      for (const sz of [-0.24, 0.24]) {
        if (verdict === "review" && sx > 0 && sz > 0) continue;
        cylinder(0.055, 0.025, screwMat, sx, 0.16, sz, group);
      }
    }
    group.position.set(-7.3, 0.77, 0);
    scene.add(group);
    pieces.push({ group, verdict, demo, speed: demo ? 1.25 : 1.85 });
  }
  createPiece("neutral", true);
  pieces[0].group.position.x = -4.1;
  createPiece("neutral", true);
  pieces[1].group.position.x = 1.9;

  window.addEventListener("flowtwin:inspection", (event) => {
    createPiece(event.detail.verdict);
    if (pieces.length > 18) {
      const old = pieces.shift();
      removePiece(old);
    }
  });

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
    radius = Math.max(10, Math.min(27, radius + event.deltaY * 0.015));
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

  let last = performance.now();
  function animate(time) {
    const dt = Math.min((time - last) / 1000, 0.05);
    last = time;
    for (let i = pieces.length - 1; i >= 0; i--) {
      const piece = pieces[i];
      piece.group.position.x += piece.speed * dt;
      if (piece.group.position.x > 4.0 && piece.verdict === "review") {
        piece.group.position.z = Math.min(2.25, piece.group.position.z + dt * 1.55);
      } else if (piece.group.position.x > 4.0 && piece.verdict === "clear") {
        piece.group.position.z = Math.max(-2.25, piece.group.position.z - dt * 1.55);
      }
      piece.group.rotation.y = Math.sin(time * 0.0006 + i) * 0.012;
      if (piece.group.position.x > 8.0) {
        removePiece(piece);
        pieces.splice(i, 1);
        if (piece.demo && pieces.filter((item) => item.demo).length < 2) createPiece("neutral", true);
      }
    }
    ring.material.emissiveIntensity = 0.75 + Math.sin(time * 0.003) * 0.25;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}
