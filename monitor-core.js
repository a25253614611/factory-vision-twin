// Deterministic, fictional fab telemetry. Nothing here reads or controls real equipment.
export const ZONES = [
  { id: "facility", name: "公用系統", code: "FACILITY", x: -10, z: -5 },
  { id: "litho", name: "光刻區", code: "LITHOGRAPHY", x: 0, z: -5 },
  { id: "deposition", name: "薄膜沉積區", code: "DEPOSITION", x: 10, z: -5 },
  { id: "etch", name: "蝕刻區", code: "ETCH", x: -10, z: 5 },
  { id: "cmp", name: "平坦化區", code: "CMP", x: 0, z: 5 },
  { id: "inspection", name: "光學檢查區", code: "INSPECTION", x: 10, z: 5 }
];

const SPECS = [
  ["CH-01", "冷卻機 A", "facility", "chiller", 22, .32, 88, 0],
  ["CH-02", "冷卻機 B", "facility", "chiller", 22, .34, 84, 0],
  ["AHU-01", "空調箱", "facility", "air", 21, .45, 48, 0],
  ["UPS-01", "備援電源", "facility", "power", 28, .15, 24, 0],
  ["LTH-01", "光刻機 1", "litho", "litho", 23, .19, 73, 45],
  ["LTH-02", "光刻機 2", "litho", "litho", 23, .20, 74, 45],
  ["LTH-03", "光刻機 3", "litho", "litho", 23, .20, 71, 45],
  ["LTH-04", "光刻機 4", "litho", "litho", 23, .18, 72, 45],
  ["CVD-01", "沉積腔體 1", "deposition", "deposition", 82, .62, 112, 56],
  ["CVD-02", "沉積腔體 2", "deposition", "deposition", 81, .60, 109, 56],
  ["CVD-03", "沉積腔體 3", "deposition", "deposition", 83, .64, 113, 56],
  ["CVD-04", "沉積腔體 4", "deposition", "deposition", 82, .61, 110, 56],
  ["ETC-01", "蝕刻腔體 1", "etch", "etch", 67, .74, 96, 52],
  ["ETC-02", "蝕刻腔體 2", "etch", "etch", 67, .73, 95, 52],
  ["ETC-03", "蝕刻腔體 3", "etch", "etch", 66, .72, 94, 52],
  ["ETC-04", "蝕刻腔體 4", "etch", "etch", 67, .75, 97, 52],
  ["CMP-01", "研磨機 1", "cmp", "cmp", 28, .92, 64, 60],
  ["CMP-02", "研磨機 2", "cmp", "cmp", 28, .90, 66, 60],
  ["CMP-03", "研磨機 3", "cmp", "cmp", 28, .94, 63, 60],
  ["CMP-04", "研磨機 4", "cmp", "cmp", 28, .93, 65, 60],
  ["AOI-01", "晶圓檢查 1", "inspection", "aoi", 24, .20, 38, 68],
  ["AOI-02", "晶圓檢查 2", "inspection", "aoi", 24, .19, 39, 68],
  ["MET-01", "量測台 1", "inspection", "metrology", 24, .22, 32, 44],
  ["MET-02", "量測台 2", "inspection", "metrology", 24, .21, 31, 44]
];

export const EQUIPMENT = SPECS.map(([id, name, zone, type, baseTemp, baseVibration, basePower, capacity], index) =>
  ({ id, name, zone, type, baseTemp, baseVibration, basePower, capacity, index }));

export const SIGNAL_UNITS = Object.freeze({ temp: "°C", vibration: "mm/s", power: "kW", throughput: "片/時", lux: "lux" });

export const INCIDENTS = {
  cooling: { name: "冷卻迴路漂移", description: "公用系統先升溫，影響會在後續時間傳到製程區。比較首次異常時間找源頭。", root: "CH-01", impacts: { "LTH-01": 5, "LTH-02": 5, "ETC-01": 10, "CVD-01": 10 } },
  vibration: { name: "蝕刻區振動", description: "源頭振動先升高；下游節拍與待處理量隨後變化。", root: "ETC-02", impacts: { "ETC-01": 5, "ETC-03": 5, "AOI-01": 10 } },
  illumination: { name: "檢查照明波動", description: "AOI 光源先偏移；後續可能影響鄰近檢查站的待覆核量。", root: "AOI-01", impacts: { "AOI-02": 5, "MET-01": 10 } }
};

const round = (value, digits = 1) => Number(value.toFixed(digits));
const clock = (minute) => `${String((8 + Math.floor(minute / 60)) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export const plantClock = clock;

function reading(spec, minute, incident, manualStop = false) {
  const phase = spec.index * 1.7 + minute / 11;
  const elapsed = incident ? Math.max(0, minute - incident.started) : 0;
  let temp = spec.baseTemp + .5 * Math.sin(phase);
  let vibration = spec.baseVibration + .04 * Math.sin(phase * 1.4);
  let power = spec.basePower * (.89 + .07 * Math.sin(phase * .7));
  let throughput = spec.capacity * (.82 + .10 * Math.sin(phase * .61));
  let lux = spec.type === "aoi" ? 480 + 7 * Math.sin(phase) : null;
  let status = "running";
  let reason = "數值在本情境的模擬基準內";
  let dependency = null;

  if (incident) {
    if (incident.type === "cooling") {
      if (spec.id === "CH-01") {
        temp += 9 + elapsed * .23; power *= 1.23; status = elapsed >= 20 ? "down" : "alarm";
        reason = "出水溫度與耗電同步上升；跨區域溫度異常的可能源頭";
      } else if (elapsed >= (INCIDENTS.cooling.impacts[spec.id] ?? Infinity)) {
        temp += Math.min(8, 2.2 + elapsed * .15); throughput *= .57; status = "warning";
        reason = "受冷卻迴路波動影響，溫度偏離模擬基準"; dependency = "CH-01";
      }
    } else if (incident.type === "vibration") {
      if (spec.id === "ETC-02") {
        vibration += 2.1 + elapsed * .035; throughput *= .35; status = elapsed >= 15 ? "down" : "alarm";
        reason = "振動高於模擬基準，伴隨產能下降";
      } else if (elapsed >= (INCIDENTS.vibration.impacts[spec.id] ?? Infinity)) {
        throughput *= .65; status = "warning";
        reason = "上游節拍失衡，待處理佇列正在增加"; dependency = "ETC-02";
      }
    } else if (incident.type === "illumination") {
      if (spec.id === "AOI-01") {
        lux += 150 + elapsed * 2; throughput *= .41; status = elapsed >= 20 ? "down" : "alarm";
        reason = "照度漂移，影像差異候選與人工覆核量可能增加";
      } else if (elapsed >= (INCIDENTS.illumination.impacts[spec.id] ?? Infinity)) {
        throughput *= .61; status = "warning";
        reason = "受到 AOI-01 照明異常影響，估計處理量下降"; dependency = "AOI-01";
      }
    }
  }
  if (incident?.repairing && spec.id === INCIDENTS[incident.type].root) {
    status = "maintenance"; reason = "已判定源頭，模擬維修作業中";
    throughput = 0; power *= .25;
  }
  if (manualStop) {
    status = "idle"; reason = "工程師手動暫停的模擬狀態";
    throughput = 0; power *= .18;
  }
  if (status === "down") { throughput = 0; power *= .30; }
  return { temp: round(temp), vibration: round(vibration, 2), power: round(power),
    throughput: round(Math.max(0, throughput)), lux: lux === null ? null : round(lux),
    status, reason, dependency };
}

function applyReadings(state) {
  const activeIncident = state.incident;
  state.machines = state.machines.map((machine) => {
    const spec = EQUIPMENT[machine.index];
    const current = reading(spec, state.minute, activeIncident, machine.manualStop);
    const metrics = ["temp", "vibration", "power", "throughput", ...(spec.type === "aoi" ? ["lux"] : [])];
    current.telemetry = Object.fromEntries(metrics.map((metric) => [metric,
      { equipmentId: spec.id, metric, value: current[metric], unit: SIGNAL_UNITS[metric],
        source: "BROWSER_SIMULATION", observedMinute: state.minute, simulatedTimestamp: clock(state.minute), quality: "good" }]));
    if (state.replay) {
      const sample = state.replay.records.filter((item) => item.equipmentId === spec.id && item.minute <= state.minute).at(-1);
      if (sample) {
        const age = state.minute - sample.minute;
        current.status = sample.status;
        current.reason = `${state.replay.source} JSON 回放；最近一筆在 ${clock(sample.minute)}`;
        for (const metric of metrics) {
          const value = sample.signals[metric];
          current.telemetry[metric] = { equipmentId: spec.id, metric, value: value.value, unit: value.unit,
            source: state.replay.source, observedMinute: sample.minute, simulatedTimestamp: clock(sample.minute),
            quality: value.quality === "missing" ? "missing" : age > 10 ? "stale" : "good" };
          if (value.quality === "good") current[metric] = value.value;
        }
      }
    }
    const pending = state.inspections.filter((item) => item.decision === "pending").length;
    const held = state.inspections.filter((item) => item.decision === "held").length;
    if (!state.replay && spec.id === "AOI-01" && (pending || held) && current.status === "running") {
      current.status = "warning";
      current.reason = `${pending} 批待人工覆核、${held} 批已暫停；均為合成晶圓示範`;
      current.throughput = round(current.throughput * (held ? .5 : .7));
    }
    const abnormal = ["warning", "alarm", "down"].includes(current.status);
    const caseAffected = activeIncident && (spec.id === INCIDENTS[activeIncident.type].root ||
      state.minute - activeIncident.started >= (INCIDENTS[activeIncident.type].impacts[spec.id] ?? Infinity));
    const firstAnomalyAt = caseAffected && abnormal ? (machine.firstAnomalyAt ?? state.minute) : machine.firstAnomalyAt;
    if (caseAffected && abnormal && machine.firstAnomalyAt == null) {
      state.caseLog.at(-1).firstSeen[spec.id] = state.minute;
      addEvent(state, `${spec.id} 首次異常；${current.reason}`, current.status === "down" ? "critical" : "warning");
    }
    const point = { minute: state.minute, temp: current.temp, vibration: current.vibration,
      power: current.power, throughput: current.throughput, lux: current.lux, status: current.status,
      telemetry: current.telemetry,
      quality: Object.fromEntries(Object.entries(current.telemetry).map(([metric, meta]) => [metric, meta.quality])) };
    const history = machine.history.at(-1)?.minute === state.minute ? [...machine.history.slice(0, -1), point] : [...machine.history, point];
    return { ...machine, ...current, firstAnomalyAt, history: history.slice(-30) };
  });
}

function addEvent(state, text, severity = "info") {
  state.events.unshift({ minute: state.minute, text, severity });
  state.events = state.events.slice(0, 40);
}

export function createPlant() {
  const state = { minute: 0, incident: null, score: null, attempts: 0,
    inspections: [], caseLog: [], replay: null,
    machines: EQUIPMENT.map((spec) => ({ index: spec.index, id: spec.id, manualStop: false, firstAnomalyAt: null, history: [] })),
    events: [{ minute: 0, text: "24 台合成設備已開始監看；可選情境注入故障", severity: "info" }] };
  applyReadings(state);
  return state;
}

export function advancePlant(state, steps = 1) {
  if (!Number.isInteger(steps) || steps < 1 || steps > 72) throw new Error("推進步數必須介於 1 至 72");
  const next = structuredClone(state);
  for (let i = 0; i < steps; i++) {
    if (next.replay && next.minute >= next.replay.endMinute) break;
    next.minute += 5;
    if (next.incident?.repairing && next.minute >= next.incident.repairUntil) {
      const root = INCIDENTS[next.incident.type].root;
      next.caseLog.at(-1).repairedAt = next.minute;
      next.incident = null;
      addEvent(next, `${root} 模擬維修完成；跨區域訊號回到基準`, "success");
    }
    const before = new Map(next.machines.map((machine) => [machine.id, machine.status]));
    applyReadings(next);
    if (!next.incident && next.caseLog.at(-1)?.repairedAt === next.minute)
      next.caseLog.at(-1).recovered = plantSummary(next);
    for (const machine of next.machines) {
      if (before.get(machine.id) === "alarm" && machine.status === "down")
        addEvent(next, `${machine.id} 停機；請查閱訊號與影響範圍`, "critical");
    }
  }
  return next;
}

export function injectIncident(state, type) {
  if (!INCIDENTS[type]) throw new Error("未知異常情境");
  if (state.incident) throw new Error("請先處理目前的異常");
  if (state.replay) throw new Error("資料回放模式請先重設，才能注入模擬異常");
  if (state.machines.find((machine) => machine.id === INCIDENTS[type].root)?.manualStop)
    throw new Error("情境源頭機台已手動暫停，請先恢復運轉");
  const next = structuredClone(state);
  next.incident = { type, started: next.minute, repairing: false, repairUntil: null };
  next.machines.forEach((machine) => { machine.firstAnomalyAt = null; });
  next.caseLog.push({ type, started: next.minute, root: INCIDENTS[type].root,
    baseline: plantSummary(state), firstSeen: {}, attempts: 0, diagnosis: null, repairedAt: null, recovered: null });
  next.score = null; next.attempts = 0;
  addEvent(next, `${INCIDENTS[type].name}：${INCIDENTS[type].description}`, "warning");
  applyReadings(next);
  return next;
}

export function diagnosePlant(state, machineId) {
  if (!state.incident || state.incident.repairing) throw new Error("目前沒有待判定的源頭");
  const machine = state.machines.find((item) => item.id === machineId);
  if (!machine) throw new Error("未知機台");
  const next = structuredClone(state);
  const root = INCIDENTS[next.incident.type].root;
  if (machineId !== root) {
    next.attempts++;
    next.caseLog.at(-1).attempts = next.attempts;
    addEvent(next, `${machineId} 為受影響設備；請比對最早異常訊號與相依關係`, "warning");
    return next;
  }
  next.incident.repairing = true;
  next.incident.repairUntil = next.minute + 10;
  next.score = Math.max(0, 100 - Math.floor((next.minute - next.incident.started) / 5) * 5 - next.attempts * 15);
  next.caseLog.at(-1).diagnosis = { machineId, minute: next.minute, score: next.score };
  addEvent(next, `找出源頭 ${machineId}；已派模擬維修，約 10 分鐘後完成`, "success");
  applyReadings(next);
  return next;
}

export function setMachineStopped(state, machineId, stopped) {
  if (state.replay) throw new Error("資料回放模式不可修改機台狀態；請先重設");
  const next = structuredClone(state);
  const machine = next.machines.find((item) => item.id === machineId);
  if (!machine) throw new Error("未知機台");
  if (next.incident && INCIDENTS[next.incident.type].root === machineId)
    throw new Error("異常源頭需完成診斷與維修，才能手動操作");
  if (stopped && machine.status !== "running")
    throw new Error("機台已有異常或已暫停，請先查看訊號與處置狀態");
  machine.manualStop = Boolean(stopped);
  addEvent(next, `${machineId} 已${stopped ? "手動暫停" : "恢復運轉"}（僅限本模擬）`, stopped ? "warning" : "success");
  applyReadings(next);
  return next;
}

export function receiveInspection(state, report) {
  if (state.replay) throw new Error("資料回放模式不可匯入新的 AOI 示範結果；請先重設");
  if (!report || !/^SIM-[A-Z0-9-]{1,30}$/.test(report.lotId) ||
      !["review", "clear"].includes(report.verdict) ||
      !Number.isInteger(report.defectCount) || report.defectCount < 0 || report.defectCount > 5000 ||
      !["particle", "scratch", "clear"].includes(report.kind)) throw new Error("AOI 示範結果格式不正確");
  if (state.inspections.some((item) => item.lotId === report.lotId)) return state;
  const next = structuredClone(state);
  const item = { lotId: report.lotId, machineId: "AOI-01", kind: report.kind,
    defectCount: report.defectCount, verdict: report.verdict, checkedAt: report.checkedAt,
    receivedAt: next.minute, decision: report.verdict === "review" ? "pending" : "released",
    decidedAt: report.verdict === "review" ? null : next.minute };
  next.inspections.unshift(item);
  next.inspections = next.inspections.slice(0, 30);
  addEvent(next, `${item.lotId} / AOI-01：${item.defectCount} 處疑似差異；${item.decision === "pending" ? "待人工覆核" : "未見異常"}`, item.decision === "pending" ? "warning" : "info");
  applyReadings(next);
  return next;
}

export function decideInspection(state, lotId, decision) {
  if (state.replay) throw new Error("資料回放模式不可處置批次；請先重設");
  if (!["released", "held"].includes(decision)) throw new Error("未知的人工處置");
  const next = structuredClone(state);
  const item = next.inspections.find((entry) => entry.lotId === lotId);
  if (!item || !["pending", "held"].includes(item.decision) || (item.decision === "held" && decision === "held"))
    throw new Error("此批次沒有待處置的模擬檢查結果");
  item.decision = decision;
  item.decidedAt = next.minute;
  addEvent(next, `${lotId} 已人工${decision === "held" ? "暫停批次" : "覆核放行"}（僅限合成示範）`, decision === "held" ? "warning" : "success");
  applyReadings(next);
  return next;
}

export function startReplay(document) {
  if (!document?.records?.length || !Number.isInteger(document.endMinute)) throw new Error("尚未驗證的回放資料");
  const next = createPlant();
  next.replay = structuredClone(document);
  addEvent(next, `載入 ${document.source} 合成 JSON 回放；未連線真實設備`, "info");
  applyReadings(next);
  return next;
}

export function plantSummary(state) {
  const counts = { running: 0, warning: 0, alarm: 0, down: 0, maintenance: 0, idle: 0 };
  for (const machine of state.machines) counts[machine.status]++;
  const zoneRates = ZONES.filter((zone) => zone.id !== "facility").map((zone) =>
    state.machines.filter((machine) => EQUIPMENT[machine.index].zone === zone.id)
      .reduce((total, machine) => total + machine.throughput, 0));
  const dataGap = state.machines.some((machine) => ["missing", "stale"].includes(machine.telemetry?.power?.quality) ||
    ["missing", "stale"].includes(machine.telemetry?.throughput?.quality));
  return { ...counts, alertCount: counts.warning + counts.alarm + counts.down,
    pendingReview: state.inspections.filter((item) => item.decision === "pending").length,
    heldLots: state.inspections.filter((item) => item.decision === "held").length,
    dataGap, replayCoverage: state.machines.filter((machine) => machine.telemetry?.temp?.source === state.replay?.source).length,
    powerKw: dataGap ? null : Math.round(state.machines.reduce((total, machine) => total + machine.power, 0)),
    capacityWph: dataGap ? null : Math.round(Math.min(...zoneRates)),
    time: clock(state.minute) };
}

export function zoneStatus(state, zoneId) {
  const machines = state.machines.filter((machine) => EQUIPMENT[machine.index].zone === zoneId);
  const priority = { down: 5, alarm: 4, warning: 3, maintenance: 2, idle: 1, running: 0 };
  return machines.reduce((best, machine) => priority[machine.status] > priority[best] ? machine.status : best, "running");
}
