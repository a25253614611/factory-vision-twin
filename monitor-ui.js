import { EQUIPMENT, ZONES, INCIDENTS, createPlant, advancePlant, injectIncident,
  diagnosePlant, setMachineStopped, receiveInspection, decideInspection, startReplay,
  plantSummary, plantClock, zoneStatus } from "./monitor-core.js";
import { createMonitorWorld } from "./monitor-3d.js";
import { MODEL_PARTS } from "./machine-catalog.js";
import { readDemoInspections, clearDemoInspections, INSPECTION_BRIDGE_KEY } from "./inspection-bridge.js";
import { validateReplayDocument, SIGNAL_UNITS } from "./telemetry-replay.js";
import { buildAcceptanceReport } from "./acceptance-report.js";

const $ = (id) => document.getElementById(id);
const statusNames = { running: "正常運轉", warning: "預警", alarm: "異常告警", down: "停機", maintenance: "維修中", idle: "手動暫停" };
const severity = { down: 5, alarm: 4, warning: 3, maintenance: 2, idle: 1, running: 0 };
const storageKey = "flowtwin-equipment-monitor-v2";
let state = restore() || createPlant();
let selectedId = "AOI-01", zoneFilter = "all", statusFilter = "all", search = "", signal = "temp", viewMode = "overview";
let world = null, autoTimer = null;

function restore() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    if (!saved || !Array.isArray(saved.machines) || saved.machines.length !== EQUIPMENT.length ||
      !Array.isArray(saved.inspections) || !Array.isArray(saved.caseLog) ||
      saved.machines.some((machine, index) => machine.id !== EQUIPMENT[index].id) || !Array.isArray(saved.events)) return null;
    return saved;
  } catch { return null; }
}
function persist() { try { sessionStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* private mode */ } }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]); }
function current() { const machine = state.machines.find((item) => item.id === selectedId); return { machine, spec: EQUIPMENT[machine.index] }; }
function commit(next) {
  if (state.incident && !next.incident && statusFilter === "problem") {
    statusFilter = "all";
    $("statusFilter").value = "all";
  }
  state = next; persist(); render();
}
function reportError(error) { window.alert(error.message); }
function renderViewControls() {
  $("overviewButton").classList.toggle("active", viewMode === "overview");
  $("focusButton").classList.toggle("active", viewMode === "machine");
  $("viewStatus").textContent = viewMode === "machine" ? `${selectedId} 外觀近看 · 拖曳可 360° 旋轉` :
    viewMode === "zone" ? "區域聚焦 · 點全廠俯瞰返回" : "可 360° 旋轉並查看設備外觀";
}
function focusZone(id) {
  viewMode = id ? "zone" : "overview";
  world?.focusZone(id);
  renderViewControls();
}

function renderKpis() {
  const summary = plantSummary(state);
  $("timeValue").textContent = summary.time;
  $("runningValue").textContent = summary.running;
  $("alertsValue").textContent = summary.alertCount;
  $("alertCaption").textContent = summary.alertCount ? `${summary.down} 台停機 · ${summary.alarm} 台告警 · ${summary.warning} 台預警` : "目前未偵測到異常";
  $("capacityValue").textContent = summary.capacityWph ?? "—";
  $("energyValue").textContent = summary.powerKw ?? "—";
  $("injectButton").disabled = Boolean(state.incident || state.replay);
  $("incidentSelect").disabled = Boolean(state.replay);
  $("modeStatus").textContent = state.replay ? `資料來源：${state.replay.source}（合成 JSON 回放）` : "資料來源：瀏覽器合成模擬";
  $("qualityStatus").textContent = state.replay ?
    `${summary.replayCoverage}/24 台有回放資料；${summary.dataGap ? "部分訊號缺值／過期，總功率與線速暫不顯示" : "目前資料可用"}` :
    `AOI 待覆核 ${summary.pendingReview} 批 · 已暫停 ${summary.heldLots} 批`;
  $("stepButton").disabled = $("fastButton").disabled = Boolean(state.replay && state.minute >= state.replay.endMinute);
  $("incidentBanner").hidden = !state.incident;
  if (state.incident) {
    const incident = INCIDENTS[state.incident.type];
    $("incidentTitle").textContent = state.incident.repairing ? `${incident.name} · 模擬維修中` : incident.name;
    $("incidentDescription").textContent = state.incident.repairing ?
      `已派工，推進至 ${plantClock(state.incident.repairUntil)} 觀察各區回復。` : incident.description;
    $("challengeScore").textContent = state.score === null ? `誤判 ${state.attempts} 次` : `診斷 ${state.score} 分`;
    $("hintButton").disabled = state.incident.repairing;
  }
}

function renderZones() {
  $("zoneGrid").innerHTML = ZONES.map((zone) => {
    const machines = state.machines.filter((item) => EQUIPMENT[item.index].zone === zone.id);
    const status = zoneStatus(state, zone.id);
    const problems = machines.filter((item) => ["warning", "alarm", "down"].includes(item.status)).length;
    const paused = machines.filter((item) => ["idle", "maintenance"].includes(item.status)).length;
    const label = problems ? `${problems} 台待處理` : paused ? `${paused} 台暫停／維修` : `${machines.length} 台設備 · 運轉中`;
    return `<button type="button" class="zone-card ${zoneFilter === zone.id ? "active" : ""}" data-zone="${zone.id}"><span>${zone.code}</span><strong>${zone.name}</strong><small><i class="${status}"></i>${label}</small></button>`;
  }).join("");
  $("zoneGrid").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    zoneFilter = zoneFilter === button.dataset.zone ? "all" : button.dataset.zone;
    $("zoneFilter").value = zoneFilter;
    focusZone(zoneFilter === "all" ? null : zoneFilter);
    renderZones(); renderRows();
  }));
}

function metricText(machine, metric, digits = 1) {
  return machine.telemetry?.[metric]?.quality === "good" ? machine[metric].toFixed(digits) : "—";
}

function renderRows() {
  const query = search.trim().toLowerCase();
  const visible = state.machines.filter((machine) => {
    const spec = EQUIPMENT[machine.index];
    return (zoneFilter === "all" || spec.zone === zoneFilter) &&
      (statusFilter === "all" || (statusFilter === "problem" ? ["warning", "alarm", "down", "maintenance"].includes(machine.status) : machine.status === statusFilter)) &&
      (!query || `${machine.id} ${spec.name} ${ZONES.find((zone) => zone.id === spec.zone).name}`.toLowerCase().includes(query));
  }).sort((a, b) => severity[b.status] - severity[a.status] || a.index - b.index);
  $("machineRows").innerHTML = visible.length ? visible.map((machine) => {
    const spec = EQUIPMENT[machine.index], zone = ZONES.find((item) => item.id === spec.zone);
    const gap = Object.values(machine.telemetry || {}).some((item) => item.quality !== "good");
    return `<tr data-id="${machine.id}" class="${machine.id === selectedId ? "selected" : ""}" tabindex="0"><td><strong>${machine.id}</strong><br><small>${spec.name}</small></td><td>${zone.name}</td><td><span class="table-status ${machine.status}">${statusNames[machine.status]}</span>${gap ? '<small class="quality-gap">資料缺值／過期</small>' : ""}</td><td>${metricText(machine, "temp")}°</td><td>${metricText(machine, "vibration", 2)}</td><td>${metricText(machine, "power")}</td><td>${spec.capacity ? metricText(machine, "throughput") : "—"}</td></tr>`;
  }).join("") : `<tr><td class="empty-row" colspan="7">此條件下沒有機台。請清除搜尋或篩選。</td></tr>`;
  $("machineRows").querySelectorAll("tr[data-id]").forEach((row) => {
    const choose = () => selectMachine(row.dataset.id);
    row.addEventListener("click", choose);
    row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(); } });
  });
}

function drawTrend() {
  const canvas = $("trendCanvas"), ctx = canvas.getContext("2d");
  const { machine, spec } = current();
  const points = machine.history.map((point) => point.quality?.[signal] === "good" ? point[signal] : null);
  const validPoints = points.filter((value) => value !== null);
  const width = canvas.width, height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0b202b"; ctx.fillRect(0, 0, width, height);
  const min = Math.min(...validPoints, signal === "temp" ? spec.baseTemp - 2 : signal === "vibration" ? Math.max(0, spec.baseVibration - .2) : spec.basePower * .5);
  const max = Math.max(...validPoints, signal === "temp" ? spec.baseTemp + 3 : signal === "vibration" ? spec.baseVibration + .4 : spec.basePower * 1.2);
  const low = min - Math.max(.5, (max - min) * .15), high = max + Math.max(.5, (max - min) * .15);
  const left = 45, right = width - 14, top = 17, bottom = height - 28;
  ctx.strokeStyle = "#2f4b59"; ctx.lineWidth = 1;
  ctx.fillStyle = "#86a8b0"; ctx.font = "16px sans-serif";
  for (let row = 0; row < 3; row++) {
    const y = top + (bottom - top) * row / 2;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    ctx.fillText((high - (high - low) * row / 2).toFixed(signal === "vibration" ? 2 : 0), 4, y + 5);
  }
  if (points.length < 2 || !validPoints.length) { ctx.fillStyle = "#88afb5"; ctx.fillText("推進模擬時間，觀察趨勢", left + 15, top + 60); return; }
  const xy = points.map((value, index) => value === null ? null :
    [left + (right - left) * index / Math.max(1, points.length - 1), bottom - (value - low) / (high - low) * (bottom - top)]);
  ctx.beginPath(); xy.forEach((point, index) => {
    if (!point) return;
    if (index && xy[index - 1]) ctx.lineTo(...point); else ctx.moveTo(...point);
  });
  ctx.strokeStyle = machine.status === "running" ? "#5fe6c7" : "#ffc780"; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle;
  for (const point of xy) { if (!point) continue; ctx.beginPath(); ctx.arc(point[0], point[1], 3.1, 0, Math.PI * 2); ctx.fill(); }
  const anomalyIndex = machine.history.findIndex((point) => point.minute === machine.firstAnomalyAt);
  if (anomalyIndex >= 0) {
    const x = left + (right - left) * anomalyIndex / Math.max(1, points.length - 1);
    ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = "#ffae70"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); ctx.restore();
    ctx.fillStyle = "#ffbd85"; ctx.font = "13px sans-serif";
    ctx.fillText("首次異常", Math.min(x + 5, right - 66), top + 13);
  }
  ctx.fillStyle = "#83a8b0"; ctx.font = "14px sans-serif";
  ctx.fillText(plantClock(machine.history[0].minute), left, height - 6);
  ctx.fillText(plantClock(machine.history.at(-1).minute), right - 46, height - 6);
}

function renderDetail() {
  const { machine, spec } = current();
  const zone = ZONES.find((item) => item.id === spec.zone);
  $("detailIndex").textContent = `${String(spec.index + 1).padStart(2, "0")} / ${EQUIPMENT.length}`;
  $("machineZone").textContent = zone.name;
  $("machineId").textContent = machine.id;
  $("machineName").textContent = spec.name;
  $("machineStatus").textContent = statusNames[machine.status];
  $("machineStatus").className = `status-pill ${machine.status}`;
  $("machineReason").textContent = machine.reason;
  $("modelParts").textContent = MODEL_PARTS[spec.type];
  $("tempValue").textContent = metricText(machine, "temp");
  $("vibrationValue").textContent = metricText(machine, "vibration", 2);
  $("powerValue").textContent = metricText(machine, "power");
  if (spec.zone === "facility") {
    $("fourthLabel").textContent = "相對負載";
    $("fourthValue").textContent = machine.telemetry.power.quality === "good" ? Math.round(machine.power / spec.basePower * 100) : "—";
    $("fourthUnit").textContent = "%";
  } else if (machine.lux !== null) {
    $("fourthLabel").textContent = "照度";
    $("fourthValue").textContent = metricText(machine, "lux", 0);
    $("fourthUnit").textContent = "lux";
  } else {
    $("fourthLabel").textContent = "估計產出";
    $("fourthValue").textContent = metricText(machine, "throughput");
    $("fourthUnit").textContent = "片/時";
  }
  $("dependencyInfo").textContent = machine.dependency ?
    `相依訊號：${machine.dependency}。本機首次異常 ${machine.firstAnomalyAt === null ? "尚未出現" : plantClock(machine.firstAnomalyAt)}；請與上游時間比較。` :
    machine.firstAnomalyAt !== null ? `本機首次異常 ${plantClock(machine.firstAnomalyAt)}；比較其他機台的首次異常時間。` :
    machine.status === "alarm" || machine.status === "down" ? "此台有自身訊號異常；比較時間趨勢與其他區域。" : "目前沒有跨機台相依告警。";
  $("diagnoseButton").disabled = !state.incident || state.incident.repairing || Boolean(state.replay);
  $("stopButton").textContent = machine.manualStop ? "模擬恢復機台" : "模擬暫停機台";
  $("stopButton").disabled = Boolean(state.replay) || (!machine.manualStop && machine.status !== "running");
  drawTrend();
  renderTelemetry();
}

function renderEvents() {
  $("eventCount").textContent = `${state.events.length} 筆`;
  $("eventList").innerHTML = state.events.map((event) => {
    const id = EQUIPMENT.find((spec) => event.text.includes(spec.id))?.id;
    return `<li class="${event.severity}"><time>${plantClock(event.minute)} / ${event.severity.toUpperCase()}</time>${escapeHtml(event.text)}${id ? `<button type="button" data-event-machine="${id}">定位 ${id} →</button>` : ""}</li>`;
  }).join("");
}

function renderEvidence() {
  const currentCase = state.caseLog.at(-1);
  if (!currentCase) {
    $("evidenceList").textContent = "注入異常後顯示源頭與受影響機台的首次異常時間。";
    return;
  }
  const ordered = Object.entries(currentCase.firstSeen).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  const chips = ordered.map(([id, minute]) => `<button type="button" data-machine="${id}" class="time-chip"><b>${id}</b><span>${plantClock(minute)} · +${minute - currentCase.started} 分</span></button>`).join("");
  $("evidenceList").innerHTML = `<p>${escapeHtml(INCIDENTS[currentCase.type].name)} · 注入 ${plantClock(currentCase.started)} · ${currentCase.repairedAt === null ? "觀察中" : `修復 ${plantClock(currentCase.repairedAt)}`} ${currentCase.diagnosis ? `· 診斷 ${currentCase.diagnosis.score} 分` : ""}</p><div class="time-chips">${chips || "等待首次異常資料"}</div>`;
  $("evidenceList").querySelectorAll("[data-machine]").forEach((button) => button.addEventListener("click", () => selectMachine(button.dataset.machine)));
}

function renderAoi() {
  const summary = plantSummary(state);
  $("aoiCount").textContent = `待覆核 ${summary.pendingReview} 批 · 暫停 ${summary.heldLots} 批`;
  $("aoiRows").innerHTML = state.inspections.length ? state.inspections.slice(0, 6).map((item) => {
    const decision = { pending: "待人工覆核", held: "批次已暫停", released: "已覆核放行" }[item.decision];
    const action = item.decision === "pending" ? `<button data-lot="${item.lotId}" data-decision="held" type="button">暫停批次</button><button data-lot="${item.lotId}" data-decision="released" type="button">人工放行</button>` :
      item.decision === "held" ? `<button data-lot="${item.lotId}" data-decision="released" type="button">覆核後放行</button>` : "";
    return `<div class="aoi-row"><span><b>${item.lotId}</b> · AOI-01 · ${item.defectCount} 處疑似差異<br><small>${decision} · ${plantClock(item.receivedAt)} · 合成${({particle:"微粒",scratch:"刮痕",clear:"良品"})[item.kind]}</small></span><span class="aoi-actions">${action}</span></div>`;
  }).join("") : "尚無合成示範批次。先到晶圓影像檢查按「微粒示範」。";
}

function renderTelemetry() {
  const { machine } = current();
  const names = { temp: "溫度", vibration: "振動", power: "功率", throughput: "產出", lux: "照度" };
  const qualityNames = { good: "有效", missing: "缺值", stale: "過期" };
  $("telemetryTitle").textContent = `${machine.id} 訊號來源與品質`;
  $("telemetryRows").innerHTML = Object.entries(machine.telemetry || {}).map(([metric, meta]) =>
    `<div class="telemetry-row"><b>${names[metric]}</b><span>${meta.quality === "good" ? machine[metric] : "—"} ${SIGNAL_UNITS[metric]}</span><small>${escapeHtml(meta.source)} · ${plantClock(meta.observedMinute)} · <em class="${meta.quality}">${qualityNames[meta.quality]}</em></small></div>`).join("");
}

function render() {
  renderKpis(); renderZones(); renderRows(); renderDetail(); renderEvents(); renderEvidence(); renderAoi(); renderViewControls();
  world?.setState(state); world?.select(selectedId);
  if (viewMode === "machine") world?.focusMachine(selectedId);
}
function selectMachine(id) {
  if (!state.machines.some((machine) => machine.id === id)) return;
  selectedId = id; world?.select(id);
  if (viewMode === "machine") world?.focusMachine(id);
  renderViewControls(); renderRows(); renderDetail();
}
function stopAuto() { if (autoTimer) clearInterval(autoTimer); autoTimer = null; $("autoButton").textContent = "▶ 自動播放"; $("autoButton").setAttribute("aria-pressed", "false"); }

function syncDemoInspections() {
  if (state.replay) return;
  let next = state;
  for (const report of readDemoInspections()) {
    try { next = receiveInspection(next, report); } catch { /* Ignore malformed browser storage. */ }
  }
  if (next !== state) { selectedId = "AOI-01"; commit(next); }
}

function useReplay(document) {
  stopAuto();
  state = startReplay(validateReplayDocument(document));
  selectedId = "CH-01"; zoneFilter = statusFilter = "all"; search = "";
  $("zoneFilter").value = $("statusFilter").value = "all"; $("machineSearch").value = "";
  focusZone(null); persist(); render();
}

function downloadReport() {
  const blob = new Blob([JSON.stringify(buildAcceptanceReport(state), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = "flowtwin-acceptance-report.json"; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

try { world = createMonitorWorld($("plantCanvas"), {
  onSelect: selectMachine,
  onFocus: (id) => { selectedId = id; viewMode = "machine"; renderViewControls(); renderDetail(); }
}); }
catch (error) {
  $("plantCanvas").hidden = true; $("sceneFallback").hidden = false;
  $("overviewButton").disabled = $("focusButton").disabled = true;
  console.warn("3D unavailable", error);
}
for (const zone of ZONES) $("zoneFilter").add(new Option(zone.name, zone.id));
$("injectButton").addEventListener("click", () => {
  try {
    const next = injectIncident(state, $("incidentSelect").value);
    selectedId = next.machines.find((machine) => machine.status === "warning")?.id ?? selectedId;
    statusFilter = "problem"; $("statusFilter").value = "problem";
    commit(next);
  }
  catch (error) { reportError(error); }
});
$("stepButton").addEventListener("click", () => commit(advancePlant(state)));
$("fastButton").addEventListener("click", () => commit(advancePlant(state, 6)));
$("autoButton").addEventListener("click", () => {
  if (autoTimer) stopAuto();
  else { autoTimer = setInterval(() => { commit(advancePlant(state)); if (state.replay && state.minute >= state.replay.endMinute) stopAuto(); }, 1100); $("autoButton").textContent = "Ⅱ 暫停播放"; $("autoButton").setAttribute("aria-pressed", "true"); }
});
$("resetButton").addEventListener("click", () => {
  stopAuto(); state = createPlant(); selectedId = "AOI-01"; zoneFilter = statusFilter = "all"; search = "";
  $("zoneFilter").value = $("statusFilter").value = "all"; $("machineSearch").value = "";
  clearDemoInspections(); focusZone(null); persist(); render();
});
$("diagnoseButton").addEventListener("click", () => { try { commit(diagnosePlant(state, selectedId)); } catch (error) { reportError(error); } });
$("stopButton").addEventListener("click", () => { try { const { machine } = current(); commit(setMachineStopped(state, selectedId, !machine.manualStop)); } catch (error) { reportError(error); } });
$("hintButton").addEventListener("click", () => {
  if (!state.incident) return;
  const hints = { cooling: "觀察哪台公用系統機器先升溫，且其他區域標示與它相依。",
    vibration: "比較蝕刻區各腔體的振動，找出振動尖峰與產出下降同時發生的機台。",
    illumination: "比較兩台 AOI 的照度與待覆核佇列；根因通常先出現在照度訊號。" };
  $("incidentDescription").textContent = hints[state.incident.type];
});
$("aoiRows").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-lot]");
  if (!button) return;
  try { commit(decideInspection(state, button.dataset.lot, button.dataset.decision)); }
  catch (error) { reportError(error); }
});
$("eventList").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-event-machine]");
  if (!button) return;
  selectMachine(button.dataset.eventMachine);
  viewMode = "machine"; world?.focusMachine(selectedId); renderViewControls();
});
$("replayDemoButton").addEventListener("click", async () => {
  try {
    const response = await fetch("demo_telemetry.json");
    if (!response.ok) throw new Error("合成回放檔載入失敗");
    useReplay(await response.json());
  } catch (error) { reportError(error); }
});
$("replayInput").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error("JSON 回放檔請小於 1 MB");
    useReplay(JSON.parse(await file.text()));
  } catch (error) { reportError(error); }
  event.target.value = "";
});
$("exportReportButton").addEventListener("click", downloadReport);
window.addEventListener("storage", (event) => { if (event.key === INSPECTION_BRIDGE_KEY) syncDemoInspections(); });
window.addEventListener("focus", syncDemoInspections);
$("machineSearch").addEventListener("input", (event) => { search = event.target.value; renderRows(); });
$("zoneFilter").addEventListener("change", (event) => { zoneFilter = event.target.value; focusZone(zoneFilter === "all" ? null : zoneFilter); renderZones(); renderRows(); });
$("overviewButton").addEventListener("click", () => {
  zoneFilter = "all"; $("zoneFilter").value = "all";
  focusZone(null); renderZones(); renderRows();
});
$("focusButton").addEventListener("click", () => { viewMode = "machine"; world?.focusMachine(selectedId); renderViewControls(); });
$("statusFilter").addEventListener("change", (event) => { statusFilter = event.target.value; renderRows(); });
document.querySelectorAll("[data-signal]").forEach((button) => button.addEventListener("click", () => {
  signal = button.dataset.signal;
  document.querySelectorAll("[data-signal]").forEach((item) => item.classList.toggle("active", item === button));
  drawTrend();
}));
window.addEventListener("pagehide", stopAuto);
render();
syncDemoInspections();
