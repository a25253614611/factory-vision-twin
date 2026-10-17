import * as THREE from "three";
import { SHIFT_STATIONS } from "./shift-core.js";

// All meshes are original procedural approximations. Dimensions and layout are fictional.
const colors = { wall: 0xd7e7e4, trim: 0x8bb4b3, dark: 0x25404b, steel: 0x78969c,
  cyan: 0x48d8c8, amber: 0xffba68, floor: 0xb9d0cf, white: 0xf4fbf6 };

function material(color, metalness = 0, roughness = .68) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}
const mat = Object.fromEntries(Object.entries(colors).map(([name, color]) => [name, material(color, name === "steel" ? .35 : 0)]));
const glass = new THREE.MeshStandardMaterial({ color: 0x6dc9cb, transparent: true, opacity: .27, metalness: .1, roughness: .2, side: THREE.DoubleSide });
const display = new THREE.MeshBasicMaterial({ color: 0x173844 });

function box(parent, w, h, d, x, y, z, m = mat.wall) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function cylinder(parent, rt, rb, h, x, y, z, m = mat.steel, sides = 24) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, sides), m);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function line(parent, points, radius, m) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, points.length * 8), radius, 8, false), m);
  mesh.castShadow = true; parent.add(mesh); return mesh;
}
function canvasTexture(draw, width = 512, height = 256) {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
function sign(parent, title, subtitle, x, y, z, width = 2.3) {
  const texture = canvasTexture((ctx, w, h) => {
    ctx.fillStyle = "#17313b"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#5ae5cf"; ctx.fillRect(0, 0, 16, h);
    ctx.fillStyle = "#f1fff9"; ctx.font = "bold 58px sans-serif"; ctx.fillText(title, 32, 103);
    ctx.fillStyle = "#9ec7c7"; ctx.font = "bold 32px sans-serif"; ctx.fillText(subtitle, 32, 174);
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 2), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
  mesh.position.set(x, y, z); parent.add(mesh); return mesh;
}
function screen(parent, x, y, z, width = .9, height = .62, label = "STATUS") {
  box(parent, width + .12, height + .12, .12, x, y, z, mat.dark);
  const tex = canvasTexture((ctx, w, h) => {
    ctx.fillStyle = "#153944"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#6fe7cc"; ctx.font = "bold 34px sans-serif"; ctx.fillText(label, 27, 52);
    ctx.fillStyle = "#377b84"; for(let i=0;i<4;i++)ctx.fillRect(30, 90+i*32, 300-i*38, 12);
    ctx.fillStyle = "#68d2bf"; ctx.fillRect(350, 110, 110, 80);
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: tex }));
  face.position.set(x, y, z + .068); parent.add(face);
}
function wafer(parent, x, y, z, radius = .34) {
  const disk = cylinder(parent, radius, radius, .035, x, y, z, material(0x263c62, .3, .25), 48);
  const top = new THREE.Mesh(new THREE.CircleGeometry(radius * .95, 48), material(0x6480aa, .35, .28));
  top.rotation.x = -Math.PI / 2; top.position.set(x, y + .02, z); parent.add(top);
  const grid = new THREE.GridHelper(radius * 1.7, 8, 0x9ab0d8, 0x839bc7);
  grid.position.set(x, y + .023, z); parent.add(grid); return disk;
}
function cabinet(parent, x, width = 2.6) {
  box(parent, width, .14, 1.85, x, .22, -4.1, mat.dark);
  box(parent, width, 2.65, 1.75, x, 1.55, -4.1, mat.wall);
  box(parent, width, .18, 1.84, x, 2.92, -4.1, mat.steel);
  for (const side of [-1, 1]) box(parent, .055, 2.4, 1.7, x + side * width / 2, 1.55, -4.1, mat.trim);
  box(parent, width - .3, 1.68, .08, x, 1.55, -3.18, glass);
  box(parent, width - .3, .08, .12, x, 2.4, -3.11, mat.trim);
  box(parent, width - .3, .12, .18, x, .55, -3.07, mat.dark);
}
function buildCarrier(root) {
  cabinet(root, 0);
  box(root, 1.3, .18, 1.0, 0, 1.02, -2.82, mat.steel);
  box(root, 1.02, .68, .75, 0, 1.46, -2.8, mat.white);
  box(root, .98, .1, .8, 0, 1.85, -2.8, mat.dark);
  box(root, .58, .13, .08, 0, 1.95, -2.8, mat.steel);
  for(let i=0;i<5;i++)box(root, .74, .025, .5, 0, 1.24 + i*.1, -2.37, mat.steel);
  screen(root, .77, 2.13, -3.02, .54, .4, "LOT");
  for(let i=0;i<3;i++)box(root, .33, .09, .13, -.8+i*.37, .75, -2.98, mat.cyan);
}
function buildTool(root) {
  cabinet(root, 0, 2.8);
  for(const x of [-.65,.65]){
    cylinder(root, .52, .52, 1.45, x, 1.36, -3.64, mat.steel, 32);
    cylinder(root, .55, .55, .11, x, 2.13, -3.64, mat.dark, 32);
    cylinder(root, .32, .32, .06, x, 2.22, -3.64, mat.cyan, 32);
    line(root, [[x,2.25,-3.64],[x,2.8,-3.64],[x,3.3,-4.15]], .055, mat.steel);
  }
  screen(root, 0, 1.55, -2.94, .82, .5, "ETCH");
  box(root, 1.3, .12, .35, 0, .66, -2.72, mat.amber);
}
function buildAoi(root) {
  cabinet(root, 0, 2.8);
  box(root, 1.5, .24, 1.08, -.25, 1.08, -2.72, mat.dark);
  wafer(root, -.25, 1.22, -2.7, .48);
  box(root, .15, 1.18, .18, -.25, 2.33, -2.73, mat.steel);
  cylinder(root, .32, .25, .42, -.25, 1.88, -2.73, mat.dark, 32);
  cylinder(root, .2, .2, .08, -.25, 1.6, -2.73, mat.cyan, 32);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.4, .045, 8, 32), mat.cyan);
  ring.rotation.x = Math.PI/2; ring.position.set(-.25, 1.48, -2.73); root.add(ring);
  screen(root, .86, 2.1, -2.99, .76, .55, "AOI");
  for(let i=0;i<4;i++)box(root, .16, .07, .15, .47+i*.19, .85, -2.67, i===3?mat.amber:mat.cyan);
}
function buildReview(root) {
  cabinet(root, 0, 2.8);
  box(root, 2.35, .14, 1.0, 0, .93, -2.68, mat.steel);
  for(const x of [-.72,0,.72]) screen(root, x, 1.77, -2.93, .61, .52, x===0?"QA":"DATA");
  for(const x of [-.68,.68])box(root,.14,.75,.18,x,1.32,-2.8,mat.dark);
  box(root, 1.55, .05, .48, 0, 1.02, -2.27, mat.dark);
  for(let i=0;i<5;i++)box(root,.15,.025,.09,-.5+i*.25,1.06,-2.16,mat.trim);
  box(root, .45, .16, .5, .75, .65, -1.97, mat.dark);
}
function buildHandoff(root) {
  cabinet(root, 0, 2.7);
  box(root, 2.1, .12, .86, 0, 1.0, -2.7, mat.steel);
  screen(root, -.43, 1.85, -3.01, 1.25, .78, "SHIFT");
  box(root, .55, .5, .55, .82, 1.31, -2.77, mat.white);
  box(root, .43, .045, .55, .82, 1.53, -2.45, mat.dark);
  box(root, .5, .035, .34, .82, 1.09, -2.25, mat.white);
  for(let i=0;i<4;i++)box(root, .63, .035, .42, -.7, 1.08+i*.04, -2.38, mat.white);
}
const builders = [buildCarrier, buildTool, buildAoi, buildReview, buildHandoff];

function avatar(parent, x, z, accent = 0x75cfc0) {
  const group = new THREE.Group(); group.position.set(x, 0, z); parent.add(group);
  const suit = material(0xeef7ef), edge = material(accent), visor = material(0x244852, .2, .2);
  box(group, .44, .65, .29, 0, 1.03, 0, suit);
  box(group, .47, .09, .33, 0, 1.36, 0, edge);
  cylinder(group, .24, .21, .39, 0, 1.64, 0, suit, 20);
  box(group, .34, .17, .04, 0, 1.66, .205, visor);
  for(const side of [-1,1]){
    box(group,.14,.52,.16,side*.33,1.0,0,suit);
    box(group,.15,.52,.18,side*.13,.46,0,suit);
    box(group,.22,.11,.34,side*.13,.16,.09,edge);
  }
  cylinder(group, .27, .27, .07, 0, 1.43, 0, edge, 20);
  group.userData.walk = 0; return group;
}

export function createShiftWorld(canvas, callbacks = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xd7e9e7);
  const camera = new THREE.OrthographicCamera(-15,15,9,-9,.1,100);
  let angle = .56; let zoom = 1;
  function positionCamera(){ const radius=31; camera.position.set(Math.sin(angle)*radius, 25, Math.cos(angle)*radius); camera.lookAt(0,1,-1.5); camera.updateProjectionMatrix(); }
  positionCamera();
  scene.add(new THREE.HemisphereLight(0xffffff,0x8aa9b1,2));
  const sun = new THREE.DirectionalLight(0xffffff,2.6); sun.position.set(-8,18,13); sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-17,right:17,top:14,bottom:-14,near:1,far:52}); sun.shadow.bias=-.00015; scene.add(sun);
  const room = new THREE.Group(); scene.add(room);
  box(room,25,.22,13.7,0,-.16,-1.5,mat.floor);
  const tile = canvasTexture((ctx,w,h)=>{ctx.fillStyle="#bbd1d0";ctx.fillRect(0,0,w,h);ctx.strokeStyle="#9bb9b7";ctx.lineWidth=3;for(let i=0;i<=w;i+=64){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,h);ctx.stroke()}for(let j=0;j<=h;j+=64){ctx.beginPath();ctx.moveTo(0,j);ctx.lineTo(w,j);ctx.stroke()}},512,512);
  tile.wrapS=tile.wrapT=THREE.RepeatWrapping;tile.repeat.set(3.2,1.8);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(25,13.7),new THREE.MeshStandardMaterial({map:tile,roughness:.84}));
  floor.rotation.x=-Math.PI/2;floor.position.set(0,-.045,-1.5);floor.receiveShadow=true;room.add(floor);
  box(room,25,4.8,.18,0,2.3,-8.3,mat.wall);
  box(room,.16,4.8,13.7,-12.5,2.3,-1.5,mat.wall);
  box(room,.16,4.8,13.7,12.5,2.3,-1.5,mat.wall);
  for(let i=0;i<12;i++){
    const x=-11.5+i*2.1;
    box(room,.045,4.4,.2,x,2.35,-8.17,mat.trim);
    box(room,1.65,1.3,.03,x+.83,3.5,-8.18,glass);
    box(room,1.8,.07,.15,x+.83,2.83,-8.08,mat.steel);
  }
  for(let i=0;i<16;i++){
    const x=-11.4+i*1.5;
    box(room,.09,.014,10,x,.005,-1.5,mat.white);
  }
  box(room,22.7,.09,.55,0,.025,2.85,mat.cyan);
  // Overhead handling rail, suspension frames, vents and a moving carrier.
  for(const x of [-10,-5,0,5,10]){
    box(room,.14,2.25,.14,x,3.7,-5.5,mat.steel);
    box(room,2.0,.12,.45,x,4.76,-5.5,mat.steel);
    box(room,1.1,.07,.8,x,4.72,-.4,mat.white);
    box(room,.77,.014,.57,x,4.675,-.4,mat.trim);
  }
  for(const dz of [-.32,.32])box(room,22,.12,.09,0,4.76,-5.5+dz,mat.dark);
  line(room,[[-11,4.55,-7.25],[-4,4.55,-7.25],[4,4.55,-7.25],[11,4.55,-7.25]],.08,mat.cyan);
  const carrier = new THREE.Group(); room.add(carrier);
  box(carrier,.7,.45,.59,0,4.27,-5.5,mat.white);
  box(carrier,.6,.08,.5,0,4.56,-5.5,mat.steel);
  box(carrier,.51,.06,.13,0,4.26,-5.19,mat.cyan);
  const roots=[]; const lights=[];
  SHIFT_STATIONS.forEach((station,index)=>{
    const root = new THREE.Group(); root.position.x=station.x; root.userData.stationIndex=index; room.add(root); roots.push(root);
    builders[index](root);
    sign(root,station.code,index===2?"OPTICAL QUALITY":"LOT-2041",0,3.31,-3.01,index===2?2.5:2.35);
    box(root,2.75,.045,.055,0,.035,-1.97,mat.dark);
    const beacon = cylinder(root,.11,.11,.2,1.16,3.16,-3.2,mat.trim,16);lights.push(beacon);
    const halo = new THREE.Mesh(new THREE.RingGeometry(.45,.52,32),new THREE.MeshBasicMaterial({color:0x4be3bf,transparent:true,opacity:.68,side:THREE.DoubleSide}));
    halo.rotation.x=-Math.PI/2;halo.position.set(0,.028,-1.3);root.add(halo);root.userData.halo=halo;
  });
  for(const x of [-10.8,10.8]){
    box(room,.9,2.2,.5,x,1.1,-6.9,mat.steel);
    for(let j=0;j<5;j++)box(room,.7,.05,.52,x,.4+j*.37,-6.55,mat.dark);
  }
  const player=avatar(room,-9.5,2.35);
  const npcA=avatar(room,-5.8,3.7,0x72aacf); npcA.rotation.y=-.7;
  const npcB=avatar(room,6.2,3.65,0xeac68f); npcB.rotation.y=.4;
  const raycaster=new THREE.Raycaster(); const pointer=new THREE.Vector2(); const floorPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  let active=0, route=[], input={x:0,z:0}, last=performance.now(), dragging=false, downX=0, downY=0, previousX=0;
  function resize(){
    const width=canvas.clientWidth,height=canvas.clientHeight;if(!width||!height)return;
    renderer.setSize(width,height,false);const aspect=width/height;const span=Math.max(15/zoom,26/(aspect*zoom));
    camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();
  }
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  function nearIndex(){return SHIFT_STATIONS.findIndex((s)=>Math.hypot(player.position.x-s.x,player.position.z-s.z)<1.12);}
  function goTo(index){
    const station=SHIFT_STATIONS[index];if(!station)return;
    route=[new THREE.Vector3(player.position.x,0,.7),new THREE.Vector3(station.x,0,.7),new THREE.Vector3(station.x,0,station.z)];
    callbacks.onRoute?.(index);
  }
  function setActive(index){active=index;roots.forEach((root,i)=>{
    root.userData.halo.material.color.setHex(i===index?0x40f5c1:0x8bb7b7);
    root.userData.halo.material.opacity=i===index ? .95 : .25;
    lights[i].material=i===index?mat.cyan:mat.trim;
  });}
  setActive(0);
  function setInput(x,z){input={x,z};if(x||z)route=[];}
  function ray(event){const r=canvas.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);}
  canvas.addEventListener("pointerdown",(event)=>{dragging=true;downX=previousX=event.clientX;downY=event.clientY;canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener("pointermove",(event)=>{if(!dragging)return;if(Math.abs(event.clientX-downX)>8){angle=Math.max(-.78,Math.min(.9,angle+(event.clientX-previousX)*.005));positionCamera();}previousX=event.clientX;});
  canvas.addEventListener("pointerup",(event)=>{
    if(!dragging)return;dragging=false;if(Math.hypot(event.clientX-downX,event.clientY-downY)>9)return;
    ray(event);const hits=raycaster.intersectObjects(roots,true);
    if(hits.length){let object=hits[0].object;while(object&&!Number.isInteger(object.userData.stationIndex))object=object.parent;
      if(object){const index=object.userData.stationIndex;goTo(index);callbacks.onSelect?.(index);return;}}
    const target=new THREE.Vector3();if(raycaster.ray.intersectPlane(floorPlane,target)){
      route=[new THREE.Vector3(Math.max(-10.5,Math.min(10.5,target.x)),0,Math.max(-1.35,Math.min(3.7,target.z)))];
    }
  });
  canvas.addEventListener("pointercancel",()=>{dragging=false;});
  canvas.addEventListener("wheel",(event)=>{event.preventDefault();zoom=Math.max(.75,Math.min(1.35,zoom-event.deltaY*.0006));resize();},{passive:false});
  let animationId=0;
  function animate(now){
    animationId=requestAnimationFrame(animate);const dt=Math.min(.05,(now-last)/1000);last=now;
    carrier.position.x=Math.sin(now*.00017)*8.5;
    let vx=input.x,vz=input.z;if(vx||vz){const n=Math.hypot(vx,vz);vx/=n;vz/=n;}
    else if(route.length){const next=route[0],dx=next.x-player.position.x,dz=next.z-player.position.z,n=Math.hypot(dx,dz);
      if(n<.1){route.shift();if(!route.length)callbacks.onArrival?.(nearIndex());}
      else{vx=dx/n;vz=dz/n;}}
    const moving=Math.hypot(vx,vz)>.01;
    if(moving){player.position.x=Math.max(-10.6,Math.min(10.6,player.position.x+vx*dt*3.2));player.position.z=Math.max(-1.4,Math.min(3.75,player.position.z+vz*dt*3.2));player.rotation.y=Math.atan2(vx,vz);player.userData.walk+=dt*12;player.children[0].position.y=1.03+Math.sin(player.userData.walk)*.035;}
    else player.children[0].position.y=1.03;
    roots.forEach((root,i)=>{root.userData.halo.scale.setScalar(i===active?1+.08*Math.sin(now*.003):1);});
    renderer.render(scene,camera);
  }
  animationId=requestAnimationFrame(animate);
  return {goTo,setActive,setInput,getNearIndex:nearIndex,resetAvatar(){player.position.set(-9.5,0,2.35);route=[];},dispose(){cancelAnimationFrame(animationId);observer.disconnect();renderer.dispose();}};
}
