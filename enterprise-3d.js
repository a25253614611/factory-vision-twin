import * as THREE from "three";
import { STAGES, createEnterpriseState } from "./enterprise-core.js";

const canvas = document.getElementById("enterpriseCanvas");
const fallback = document.getElementById("sceneFallback");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
} catch (error) {
  fallback.hidden = false;
  console.warn("Enterprise 3D view unavailable:", error);
}

if (renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1d29);
  scene.fog = new THREE.Fog(0x0a1d29, 27, 52);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  const target = new THREE.Vector3(0, 0.65, 0);
  let radius = 27, azimuth = 0.02, polar = 0.94;
  function setCamera() {
    camera.position.set(target.x + radius * Math.sin(polar) * Math.sin(azimuth),
      target.y + radius * Math.cos(polar), target.z + radius * Math.sin(polar) * Math.cos(azimuth));
    camera.lookAt(target);
  }
  setCamera();
  scene.add(new THREE.HemisphereLight(0xc1eaf3, 0x102b3b, 2.2));
  const sun = new THREE.DirectionalLight(0xe2fbff, 2.8);
  sun.position.set(-7, 13, 8);
  scene.add(sun);
  const material = (color, metalness = .2, roughness = .52) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 14), material(0x102b39, .1, .9));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.04;
  scene.add(floor);
  const grid = new THREE.GridHelper(28, 28, 0x2b6172, 0x214755);
  grid.position.y = -.018;
  scene.add(grid);
  const campusBorder = new THREE.Mesh(new THREE.BoxGeometry(27.3,.16,12.6),material(0x153c4a,.4,.7));
  campusBorder.position.y = -.15;
  scene.add(campusBorder);

  const points = [[-9,-2.5],[-6,2.1],[-3,-2.5],[0,2.1],[3,-2.5],[6,2.1],[9,-2.5]];
  const buildingColors = [0x45c5db,0x72abbf,0x92bdc0,0x55d7d5,0x61dcbb,0x8cb2fa,0xe4bd77];
  const interactives = [];
  const buildings = [];
  const accent = new THREE.MeshStandardMaterial({ color:0x7be9ea, emissive:0x318992, emissiveIntensity:.4, metalness:.35, roughness:.38 });
  const dark = material(0x183747,.52,.5);
  const metal = material(0x618194,.72,.36);
  const glass = material(0x2c8191,.18,.28);
  function box(w,h,d,mat,x,y,z,parent,index) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
    mesh.position.set(x,y,z);
    parent.add(mesh);
    if (index !== undefined) { mesh.userData.station = index; interactives.push(mesh); }
    return mesh;
  }
  function label(text, color, x, z) {
    const c = document.createElement("canvas");
    c.width=384;c.height=60;
    const ctx=c.getContext("2d");
    ctx.fillStyle="#0b2634e8";ctx.fillRect(0,0,384,60);
    ctx.strokeStyle=color;ctx.lineWidth=3;ctx.strokeRect(2,2,380,56);
    ctx.fillStyle=color;ctx.font="bold 23px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(text,192,31);
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false}));
    sprite.position.set(x,3.45,z);sprite.scale.set(2.7,.43,1);scene.add(sprite);
  }
  points.forEach(([x,z],index)=>{
    const group = new THREE.Group();group.position.set(x,0,z);scene.add(group);
    const color=buildingColors[index];
    const walls=material(color,.5,.45);
    const roof=material(color,.48,.3);
    box(2.55,.19,2.7,dark,0,.16,0,group,index);
    box(1.8,1.7,1.75,walls,0,1.11,0,group,index);
    box(2.0,.13,1.95,roof,0,2.02,0,group,index);
    box(1.15,.6,.06,glass,0,1.31,.91,group,index);
    box(1.6,.055,.08,accent,0,1.87,.97,group,index);
    if (index === 3) {
      for (const dx of [-.55,.55]) {
        const stack=new THREE.Mesh(new THREE.CylinderGeometry(.16,.19,1.0,12),metal);
        stack.position.set(dx,2.6,-.4);group.add(stack);
      }
    } else if (index === 4) {
      const optic=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.3,24),accent);
      optic.position.set(0,2.28,0);group.add(optic);
    } else if (index === 5) {
      for (const dx of [-.45,.45]) box(.45,.36,.45,metal,dx,2.29,0,group,index);
    } else if (index === 6) {
      box(.65,.55,.72,metal,-.45,2.36,0,group,index);
      box(.65,.35,.72,metal,.45,2.24,0,group,index);
    } else {
      box(1.2,.38,.8,metal,0,2.27,-.3,group,index);
    }
    label(STAGES[index].en,`#${color.toString(16).padStart(6,"0")}`,x,z);
    buildings.push({group,walls,roof});
  });

  const railPoints = points.map(([x,z])=>new THREE.Vector3(x,.21,z));
  const lineCurve = new THREE.CatmullRomCurve3(railPoints,false,"centripetal");
  const rail = new THREE.Mesh(new THREE.TubeGeometry(lineCurve,180,.055,8,false),
    new THREE.MeshStandardMaterial({color:0x3eabb4,emissive:0x177483,emissiveIntensity:.5}));
  scene.add(rail);
  const flow=[];
  const dotGeo=new THREE.SphereGeometry(.105,10,8);
  for(let i=0;i<18;i++){
    const dot=new THREE.Mesh(dotGeo,new THREE.MeshBasicMaterial({color:0x75e5e8}));
    scene.add(dot);flow.push(dot);
  }
  const lotGeo=new THREE.SphereGeometry(.2,16,12);
  const lotMeshes=new Map();
  let current=createEnterpriseState(), selected=0;
  function refresh() {
    buildings.forEach((building,index)=>{
      const held=current.lots.some((lot)=>lot.stage===index&&lot.held);
      const lit=index===selected;
      building.walls.emissive=new THREE.Color(held?0xa35632:lit?0x156b78:0x071c26);
      building.walls.emissiveIntensity=held?.8:lit?.55:.3;
      building.group.scale.setScalar(lit?1.04:1);
    });
    current.lots.forEach((lot,index)=>{
      let mesh=lotMeshes.get(lot.id);
      if(!mesh){mesh=new THREE.Mesh(lotGeo,new THREE.MeshBasicMaterial({color:lot.color}));scene.add(mesh);lotMeshes.set(lot.id,mesh);}
      mesh.visible=lot.stage<STAGES.length;
      if(!mesh.visible)return;
      const [x,z]=points[lot.stage];
      mesh.userData.target=new THREE.Vector3(x-0.45+index*.3,2.65,z+1.2);
      mesh.userData.held=lot.held;
      if(!mesh.userData.started){mesh.position.copy(mesh.userData.target);mesh.userData.started=true;}
      mesh.material.color.set(lot.held?0xff9a71:lot.color);
    });
  }
  refresh();
  window.addEventListener("enterprise:update",(event)=>{
    current=event.detail.state;selected=event.detail.selected;refresh();
  });

  const raycaster=new THREE.Raycaster();
  const mouse=new THREE.Vector2();
  let pointer=null;
  canvas.addEventListener("pointerdown",(event)=>{pointer={x:event.clientX,y:event.clientY,moved:false};canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener("pointermove",(event)=>{
    if(!pointer)return;
    const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
    if(Math.abs(dx)+Math.abs(dy)>3)pointer.moved=true;
    if(pointer.moved){azimuth-=dx*.005;polar=Math.max(.42,Math.min(1.35,polar+dy*.005));setCamera();}
    pointer.x=event.clientX;pointer.y=event.clientY;
  });
  canvas.addEventListener("pointerup",(event)=>{
    if(pointer&&!pointer.moved){
      const rect=canvas.getBoundingClientRect();
      mouse.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
      raycaster.setFromCamera(mouse,camera);
      const hit=raycaster.intersectObjects(interactives,false)[0];
      if(hit)window.dispatchEvent(new CustomEvent("enterprise:select",{detail:{index:hit.object.userData.station}}));
    }
    pointer=null;
  });
  canvas.addEventListener("pointercancel",()=>{pointer=null;});
  canvas.addEventListener("wheel",(event)=>{event.preventDefault();radius=Math.max(18,Math.min(42,radius+event.deltaY*.018));setCamera();},{passive:false});
  function resize(){const rect=canvas.getBoundingClientRect();if(rect.width<1||rect.height<1)return;renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();}
  new ResizeObserver(resize).observe(canvas);resize();
  function animate(time){
    flow.forEach((dot,index)=>{const point=lineCurve.getPoint((time*.000055+index/18)%1);dot.position.copy(point);});
    let index=0;
    for(const mesh of lotMeshes.values()){
      if(mesh.visible&&mesh.userData.target){mesh.position.lerp(mesh.userData.target,.065);mesh.position.y=mesh.userData.target.y+Math.sin(time*.003+index)*.09;mesh.scale.setScalar(mesh.userData.held?1.45:1);}
      index++;
    }
    renderer.render(scene,camera);requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}
