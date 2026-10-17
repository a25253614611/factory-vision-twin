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

export const INCIDENTS = {
  cooling: { name: "冷卻迴路漂移", description: "公用系統與部分製程區同時升溫。找出最早異常的源頭機台。", root: "CH-01" },
  vibration: { name: "蝕刻區振動", description: "蝕刻區產能下降，部分機台振動升高。比對訊號找出源頭。", root: "ETC-02" },
  illumination: { name: "檢查照明波動", description: "檢查區告警增加，觀察影像站照度與鄰近機台的佇列。", root: "AOI-01" }
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
      } else if (["LTH-01", "LTH-02", "ETC-01", "CVD-01"].includes(spec.id)) {
        temp += Math.min(8, 2.2 + elapsed * .15); throughput *= .57; status = "warning";
        reason = "受冷卻迴路波動影響，溫度偏離模擬基準"; dependency = "CH-01";
      }
    } else if (incident.type === "vibration") {
      if (spec.id === "ETC-02") {
        vibration += 2.1 + elapsed * .035; throughput *= .35; status = elapsed >= 15 ? "down" : "alarm";
        reason = "振動高於模擬基準，伴隨產能下降";
      } else if (["ETC-01", "ETC-03", "AOI-01"].includes(spec.id)) {
        throughput *= .65; status = "warning";
        reason = "上游節拍失衡，待處理佇列正在增加"; dependency = "ETC-02";
      }
    } else if (incident.type === "illumination") {
      if (spec.id === "AOI-01") {
        lux += 150 + elapsed * 2; throughput *= .41; status = elapsed >= 20 ? "down" : "alarm";
        reason = "照度漂移，影像差異候選與人工覆核量可能增加";
      } else if (["AOI-02", "MET-01"].includes(spec.id)) {
        throughput *= .61; status = "warning";
        reason = "AOI 轉送的人工覆核佇列增加"; dependency = "AOI-01";
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
    const point = { minute: state.minute, temp: current.temp, vibration: current.vibration,
      power: current.power, throughput: current.throughput, lux: current.lux };
    return { ...machine, ...current, history: [...machine.history, point].slice(-30) };
  });
}

function addEvent(state, text, severity = "info") {
  state.events.unshift({ minute: state.minute, text, severity });
  state.events = state.events.slice(0, 40);
}

export function createPlant() {
  const state = { minute: 0, incident: null, score: null, attempts: 0,
    machines: EQUIPMENT.map((spec) => ({ index: spec.index, id: spec.id, manualStop: false, history: [] })),
    events: [{ minute: 0, text: "24 台合成設備已開始監看；可選情境注入故障", severity: "info" }] };
  applyReadings(state);
  return state;
}

export function advancePlant(state, steps = 1) {
  if (!Number.isInteger(steps) || steps < 1 || steps > 72) throw new Error("推進步數必須介於 1 至 72");
  const next = structuredClone(state);
  for (let i = 0; i < steps; i++) {
    next.minute += 5;
    if (next.incident?.repairing && next.minute >= next.incident.repairUntil) {
      const root = INCIDENTS[next.incident.type].root;
      next.incident = null;
      addEvent(next, `${root} 模擬維修完成；跨區域訊號回到基準`, "success");
    }
    const before = new Map(next.machines.map((machine) => [machine.id, machine.status]));
    applyReadings(next);
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
  if (state.machines.find((machine) => machine.id === INCIDENTS[type].root)?.manualStop)
    throw new Error("情境源頭機台已手動暫停，請先恢復運轉");
  const next = structuredClone(state);
  next.incident = { type, started: next.minute, repairing: false, repairUntil: null };
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
    addEvent(next, `${machineId} 為受影響設備；請比對最早異常訊號與相依關係`, "warning");
    return next;
  }
  next.incident.repairing = true;
  next.incident.repairUntil = next.minute + 10;
  next.score = Math.max(0, 100 - Math.floor((next.minute - next.incident.started) / 5) * 5 - next.attempts * 15);
  addEvent(next, `找出源頭 ${machineId}；已派模擬維修，約 10 分鐘後完成`, "success");
  applyReadings(next);
  return next;
}

export function setMachineStopped(state, machineId, stopped) {
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

export function plantSummary(state) {
  const counts = { running: 0, warning: 0, alarm: 0, down: 0, maintenance: 0, idle: 0 };
  for (const machine of state.machines) counts[machine.status]++;
  const zoneRates = ZONES.filter((zone) => zone.id !== "facility").map((zone) =>
    state.machines.filter((machine) => EQUIPMENT[machine.index].zone === zone.id)
      .reduce((total, machine) => total + machine.throughput, 0));
  return { ...counts, alertCount: counts.warning + counts.alarm + counts.down,
    energyKw: Math.round(state.machines.reduce((total, machine) => total + machine.power, 0)),
    capacityWph: Math.round(Math.min(...zoneRates)),
    time: clock(state.minute) };
}

export function zoneStatus(state, zoneId) {
  const machines = state.machines.filter((machine) => EQUIPMENT[machine.index].zone === zoneId);
  const priority = { down: 5, alarm: 4, warning: 3, maintenance: 2, idle: 1, running: 0 };
  return machines.reduce((best, machine) => priority[machine.status] > priority[best] ? machine.status : best, "running");
}
