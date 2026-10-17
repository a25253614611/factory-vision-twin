import { inspectImages } from "./inspection-core.js";
import { SHIFT_SCENARIOS, SHIFT_STATIONS, createShift, startShift, advanceShift, currentStationIndex, shiftOutcome } from "./shift-core.js";
import { createShiftWorld } from "./shift-3d.js";

const $ = (id) => document.getElementById(id);
const phaseOrder = ["carrier", "tool", "aoi", "review", "handoff"];
const phaseCopy = {
  carrier: ["載具交接", "先核對虛構批次 LOT-2041 與載具標籤，再讓批次進入查核流程。"],
  tool: ["查核製程履歷", "確認光學檢查前的設備紀錄完整。若現場有警報，應先取得設備與製程工程師的紀錄。"],
  aoi: ["執行晶圓影像比對", "用同製程層的合格參考圖，對待檢影像做平移校正、亮度補償與局部差異定位。"],
  review: ["決定品質處置", "根據 AOI 差異提示，選擇暫停批次以人工覆核，或在目前門檻下放行。請考慮誤報與漏檢。"],
  handoff: ["完成交班紀錄", "把影像結果、處置、時間與理由記錄給下一班；可下載結案 JSON 供面試展示。"]
};
const actionIds = { carrier: "scan", tool: "check", aoi: "inspect", handoff: "report" };
let state = restoreState() || createShift();
let world = null, imagePromise = null, imageSet = null, inspectionResult = null, toastTimer = 0;
let selectedScenario = state.scenario;

function restoreState() {
  try {
    const saved = JSON.parse(sessionStorage.getItem("flowtwin-shift-v1") || "null");
    return saved && SHIFT_SCENARIOS[saved.scenario] && ["intro", ...phaseOrder, "done"].includes(saved.phase) && Array.isArray(saved.events) ? saved : null;
  } catch { return null; }
}
function persist() { try { sessionStorage.setItem("flowtwin-shift-v1", JSON.stringify(state)); } catch { /* private mode */ } }
function esc(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
function clock() { const minute = 8 * 60 + state.minutes; return `${String(Math.floor(minute/60)).padStart(2,"0")}:${String(minute%60).padStart(2,"0")}`; }
function toast(message) { const node=$("toast");node.textContent=message;node.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove("show"),2900); }

function dataRow(label, value) { return `<div class="data-row"><span>${label}</span><b>${value}</b></div>`; }
function renderMap() {
  const active = state.phase === "intro" ? -1 : currentStationIndex(state);
  const completed = state.phase === "done" ? 5 : active;
  $("stationMap").innerHTML = SHIFT_STATIONS.map((station,index) =>
    `<button type="button" data-station="${index}" class="${index===active&&state.phase!=="done"?"active":""} ${index<completed?"complete":""}"><span>${index<completed?"✓":String(index+1).padStart(2,"0")}</span>${station.name}</button>`).join("");
  $("stationMap").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    const index=Number(button.dataset.station);
    if(world){world.goTo(index);toast(index===active?"正在前往任務站點":"正在探索「"+SHIFT_STATIONS[index].name+"」");}
    else toast("此裝置無法顯示 3D，可在右側依序完成任務");
  }));
}
function renderIntro() {
  $("stationCode").textContent="SELECT SCENARIO";$("stationTitle").textContent="開始一次值班";
  $("stationDescription").textContent="選擇合成情境，走訪五個站點，完成影像判讀與品質處置。";
  $("stationBody").innerHTML=`<p><strong>值班情境</strong></p><label for="scenarioSelect">選擇待檢批次</label><select id="scenarioSelect" style="width:100%;margin:8px 0 12px;padding:10px;background:#0d252e;color:white;border:1px solid #5b8587;border-radius:5px">${Object.entries(SHIFT_SCENARIOS).map(([id,scenario])=>`<option value="${id}" ${selectedScenario===id?"selected":""}>${scenario.name}</option>`).join("")}</select><p id="scenarioDescription">${SHIFT_SCENARIOS[selectedScenario].description}</p>${dataRow("任務","5 個站點 · 約 3 分鐘遊玩")}${dataRow("計算","瀏覽器本機 · 無 API token")}`;
  $("scenarioSelect").addEventListener("change",(event)=>{selectedScenario=event.target.value;$("scenarioDescription").textContent=SHIFT_SCENARIOS[selectedScenario].description;});
  $("stationActions").innerHTML="<button id='startButton' type='button' class='primary'>開始值班 →</button>";
  $("startButton").addEventListener("click",()=>{state=startShift(createShift(selectedScenario));imagePromise=null;imageSet=null;inspectionResult=null;world?.resetAvatar();world?.setActive(0);persist();render();prepareImages().catch(()=>{});toast("值班開始：前往載具交接站");});
}
function renderStation() {
  const phase=state.phase,index=currentStationIndex(state),station=SHIFT_STATIONS[index];
  $("stationCode").textContent=station.code;$("stationTitle").textContent=phaseCopy[phase][0];$("stationDescription").textContent=phaseCopy[phase][1];
  let body="",actions="";
  if(phase==="carrier"){
    body=`<p><strong>掃描前核對</strong>　請確認載具與待檢批次一致。</p>${dataRow("批次條碼","LOT-2041")}${dataRow("晶圓型態","虛構展示晶圓")}${dataRow("載具狀態","待交接")}`;
    actions="<button class='primary' data-action='scan' type='button'>核對並掃描條碼</button>";
  }else if(phase==="tool"){
    body=`<p><strong>設備紀錄摘要</strong>　此情境的資料為教學用合成值。</p>${dataRow("上一站","模擬蝕刻設備 EQ-07")}${dataRow("事件紀錄","已附上運轉與交接紀錄")}${dataRow("待辦","送 AOI 影像檢查")}`;
    actions="<button class='primary' data-action='check' type='button'>查核並轉送檢查</button>";
  }else if(phase==="aoi"){
    body=`<p><strong>影像證據</strong>　參考與待檢圖均為合成影像。</p><div class="aoi-images"><div><canvas id="referenceMini" width="480" height="480"></canvas><small>合格參考圖</small></div><div><canvas id="sampleMini" width="480" height="480"></canvas><small>待檢影像</small></div></div><div id="aoiSummary">正在準備影像…</div>`;
    actions="<button class='primary' data-action='inspect' type='button'>執行本機影像比對</button>";
  }else if(phase==="review"){
    const result=state.inspection;
    body=`<p><strong>AOI 差異提示</strong>　請依局部差異及情境選擇處置。</p><div class="aoi-images"><div><canvas id="reviewReference" width="480" height="480"></canvas><small>合格參考</small></div><div><canvas id="reviewSample" width="480" height="480"></canvas><small>待檢與差異框</small></div></div>${dataRow("判讀",result.verdict==="review"?"疑似差異 · 待人工覆核":"目前門檻下未見局部異常")}${dataRow("疑似區域",`${result.regions} 處`)}${dataRow("異常像素占比",`${result.anomalyPercent.toFixed(2)}%`)}${dataRow("全域亮度補償",`${result.brightnessShift.toFixed(1)} 灰階值`)}<p style="margin-top:10px;color:#ffdcab">暫停會增加覆核與交期成本；放行疑似異常則可能造成漏檢風險。</p>`;
    actions="<button class='option danger' data-action='hold' type='button'>暫停批次 · 人工覆核</button><button class='option' data-action='release' type='button'>在目前門檻下放行</button>";
  }else{
    body=`<p><strong>交班摘要</strong>　將檢查與處置留在可追溯紀錄中。</p>${dataRow("AOI 結果",state.inspection.verdict==="review"?"疑似差異":"未見局部異常")}${dataRow("品質處置",state.decision==="hold"?"暫停並覆核":"放行")}${dataRow("值班分數",String(state.score))}`;
    actions="<button class='primary' data-action='report' type='button'>完成交班報告</button>";
  }
  $("stationBody").innerHTML=body;$("stationActions").innerHTML=actions;
  $("stationActions").querySelectorAll("[data-action]").forEach((button)=>button.addEventListener("click",()=>perform(button.dataset.action)));
  if(phase==="aoi")prepareImages().then(()=>{if(state.phase==="aoi")renderAoiImages();}).catch((error)=>{if(state.phase==="aoi")$("aoiSummary").textContent="影像載入失敗："+error.message;});
  if(phase==="review")prepareImages().then(()=>{if(state.phase==="review")renderReviewImages();}).catch(()=>{});
}
function renderDone() {
  const outcome=shiftOutcome(state);$("stationCode").textContent="SHIFT COMPLETED";$("stationTitle").textContent=outcome.title;
  $("stationDescription").textContent=outcome.detail;
  $("stationBody").innerHTML=`${dataRow("情境",SHIFT_SCENARIOS[state.scenario].name)}${dataRow("模擬用時",`${state.minutes} 分鐘`)}${dataRow("AOI 結果",state.inspection.verdict==="review"?"需人工覆核":"未見局部異常")}${dataRow("處置",state.decision==="hold"?"暫停批次":"放行批次")}${dataRow("分數",`${state.score} / 100`)}<p style="margin-top:12px">${outcome.safe?"可向面試官說明：先分辨光照等全域變化，再確認局部差異，最後將處置與風險交給跨部門。":"可重新值班，討論此次處置造成的漏檢或誤報成本。"}</p>`;
  $("stationActions").innerHTML="<button id='downloadReport' type='button' class='primary'>下載交班 JSON</button><button id='playAgain' type='button' class='option'>再玩一次</button>";
  $("downloadReport").addEventListener("click",downloadReport);
  $("playAgain").addEventListener("click",reset);
}
function render() {
  const index=currentStationIndex(state);
  $("clockValue").textContent=clock();$("progressValue").textContent=`${state.phase==="done"?5:state.phase==="intro"?0:index} / 5`;
  $("scoreValue").textContent=String(state.score);
  $("phaseBadge").textContent=state.phase==="intro"?"待開始":state.phase==="done"?"已結案":`站點 ${index+1} / 5`;
  $("eventList").innerHTML=state.events.map((event)=>`<li><span>${String(8+Math.floor(event.minute/60)).padStart(2,"0")}:${String(event.minute%60).padStart(2,"0")}</span>${esc(event.text)}</li>`).join("");
  renderMap();if(state.phase==="intro")renderIntro();else if(state.phase==="done")renderDone();else renderStation();
  world?.setActive(state.phase==="done"||state.phase==="intro"?-1:index);refreshReach();
}
function refreshReach() {
  const inMission=phaseOrder.includes(state.phase),atStation=!world||world.getNearIndex()===currentStationIndex(state);
  $("goButton").disabled=!inMission||!world;$("interactButton").disabled=!inMission||!atStation;
  const buttons=$("stationActions").querySelectorAll("[data-action]");buttons.forEach((button)=>{button.disabled=!atStation;button.title=atStation?"":"請先靠近目前任務站點";});
  $("missionNote").textContent=state.phase==="done"?"JSON 只含合成事件與影像比對摘要，不含真實產線資料。":inMission&&world&&!atStation?"走到發光任務站點，或按「帶我去任務站點」；靠近後按 E 互動。":"結果為教學用合成資料，實際批次放行需授權與現場驗證。";
}
function next(action,payload) {try{state=advanceShift(state,action,payload);persist();render();toast(state.phase==="done"?"值班完成，可下載交班紀錄":"已完成本站；請前往下一站");}catch(error){toast(error.message);}}
async function perform(action) {
  if(!phaseOrder.includes(state.phase))return;
  if(world&&world.getNearIndex()!==currentStationIndex(state)){toast("請先靠近目前任務站點");return;}
  if(state.phase==="review"){
    if(action==="hold"||action==="release")next("decide",{choice:action});
    else toast("請選擇暫停或放行，並說明風險");
    return;
  }
  if(action!==actionIds[state.phase])return;
  if(action==="inspect"){
    const button=$("stationActions").querySelector("button");button.disabled=true;button.textContent="影像分析中…";
    try{const set=await prepareImages();inspectionResult=inspectImages(set.reference.data,set.sample.data,set.width,set.height,{threshold:42,minArea:30,maxShift:8,circleMask:true});
      renderAoiImages();next("inspect",inspectionResult);
    }catch(error){button.disabled=false;button.textContent="重試影像比對";toast("分析失敗："+error.message);}
  }else next(action);
}
function loadImage(path){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error("無法讀取 "+path));image.src=new URL(path,import.meta.url).href;});}
function imageDataFrom(image){const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext("2d",{willReadFrequently:true});context.drawImage(image,0,0);return context.getImageData(0,0,canvas.width,canvas.height);}
function prepareImages(){
  if(imagePromise)return imagePromise;
  const scenario=state.scenario;
  imagePromise=(async()=>{
    const reference=imageDataFrom(await loadImage("sample_images/wafer_reference.png"));
    let sample;
    if(scenario==="lighting"){
      sample=new ImageData(new Uint8ClampedArray(reference.data),reference.width,reference.height);
      for(let i=0;i<sample.data.length;i+=4){for(let channel=0;channel<3;channel++)sample.data[i+channel]=Math.min(255,sample.data[i+channel]+22);}
    }else if(scenario==="clear")sample=new ImageData(new Uint8ClampedArray(reference.data),reference.width,reference.height);
    else sample=imageDataFrom(await loadImage(SHIFT_SCENARIOS[scenario].sample));
    if(reference.width!==sample.width||reference.height!==sample.height)throw new Error("合成影像尺寸不符");
    imageSet={reference,sample,width:reference.width,height:reference.height};return imageSet;
  })();
  imagePromise.catch(()=>{imagePromise=null;});return imagePromise;
}
function renderAoiImages(){
  if(!imageSet||state.phase!=="aoi")return;
  for(const [id,data] of [["referenceMini",imageSet.reference],["sampleMini",imageSet.sample]]){
    const canvas=$(id);if(!canvas)continue;canvas.width=data.width;canvas.height=data.height;
    const context=canvas.getContext("2d");context.putImageData(data,0,0);
    if(id==="sampleMini"&&inspectionResult){context.lineWidth=4;context.strokeStyle="#ff5450";
      for(const box of inspectionResult.boxes)context.strokeRect(box.x,box.y,box.w,box.h);}
  }
  const summary=$("aoiSummary");if(summary)summary.textContent=inspectionResult?`${inspectionResult.regions} 處疑似區域 · 異常像素 ${inspectionResult.anomalyPercent.toFixed(2)}% · 亮度補償 ${inspectionResult.brightnessShift.toFixed(1)}`:"影像已載入。按下比對以產生局部差異提示。";
}
function renderReviewImages(){
  if(!imageSet||state.phase!=="review")return;
  for(const [id,data] of [["reviewReference",imageSet.reference],["reviewSample",imageSet.sample]]){
    const canvas=$(id);if(!canvas)continue;canvas.width=data.width;canvas.height=data.height;
    const context=canvas.getContext("2d");context.putImageData(data,0,0);
    if(id==="reviewSample"){
      context.lineWidth=5;context.strokeStyle="#ff5651";
      for(const box of state.inspection.boxes)context.strokeRect(box.x,box.y,box.w,box.h);
    }
  }
}
function downloadReport(){
  const report={title:"FlowTwin fictional optical quality shift",createdAt:new Date().toISOString(),disclosure:"All lots, images, stations and procedures are synthetic. Not a real fab release record.",lot:"LOT-2041",scenario:state.scenario,simulatedMinutes:state.minutes,inspection:state.inspection,decision:state.decision,score:state.score,outcome:shiftOutcome(state),events:state.events};
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:"application/json"}));
  const link=document.createElement("a");link.href=url;link.download=`flowtwin-${state.scenario}-shift-report.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function reset(){selectedScenario=state.scenario;state=createShift(selectedScenario);imagePromise=null;imageSet=null;inspectionResult=null;world?.resetAvatar();persist();render();toast("已重設，可選擇新情境");}

try{
  world=createShiftWorld($("shiftCanvas"),{
    onSelect(index){toast(index===currentStationIndex(state)&&phaseOrder.includes(state.phase)?"靠近後按 E 操作「"+SHIFT_STATIONS[index].name+"」":"已選擇「"+SHIFT_STATIONS[index].name+"」");},
    onArrival(index){refreshReach();if(index===currentStationIndex(state)&&phaseOrder.includes(state.phase))toast("已到達「"+SHIFT_STATIONS[index].name+"」，按 E 互動");}
  });
}catch(error){$("sceneFallback").hidden=false;$("shiftCanvas").hidden=true;console.warn("3D unavailable",error);}
$("resetButton").addEventListener("click",reset);
$("goButton").addEventListener("click",()=>{if(world&&phaseOrder.includes(state.phase))world.goTo(currentStationIndex(state));});
$("interactButton").addEventListener("click",()=>{const phase=state.phase;if(phase==="review")toast("請在右側選擇暫停或放行");else perform(actionIds[phase]);});
const pressed=new Set();const directions={w:[0,-1],ArrowUp:[0,-1],s:[0,1],ArrowDown:[0,1],a:[-1,0],ArrowLeft:[-1,0],d:[1,0],ArrowRight:[1,0]};
function updateInput(){let x=0,z=0;for(const key of pressed){const direction=directions[key];if(direction){x+=direction[0];z+=direction[1];}}world?.setInput(x,z);}
window.addEventListener("keydown",(event)=>{if(["INPUT","SELECT","TEXTAREA"].includes(document.activeElement?.tagName))return;
  if(directions[event.key]){event.preventDefault();pressed.add(event.key);updateInput();}else if(event.key.toLowerCase()==="e"&&!event.repeat){event.preventDefault();$("interactButton").click();}});
window.addEventListener("keyup",(event)=>{pressed.delete(event.key);updateInput();});
window.addEventListener("blur",()=>{pressed.clear();updateInput();});
document.querySelectorAll("[data-move]").forEach((button)=>{
  const keys={up:"w",down:"s",left:"a",right:"d"};const key=keys[button.dataset.move];
  button.addEventListener("pointerdown",(event)=>{event.preventDefault();button.setPointerCapture(event.pointerId);pressed.add(key);updateInput();});
  for(const type of ["pointerup","pointercancel","lostpointercapture"])button.addEventListener(type,()=>{pressed.delete(key);updateInput();});
});
setInterval(refreshReach,180);render();if(state.phase!=="intro")prepareImages().catch(()=>{});
