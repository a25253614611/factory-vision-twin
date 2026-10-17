// Fictional quality-engineer shift. No company procedures or real fab parameters.
export const SHIFT_SCENARIOS = {
  particle: { name: "疑似微粒", description: "同一製程層的晶圓影像出現局部差異，需決定如何處置。", sample: "sample_images/wafer_particle.png" },
  lighting: { name: "照明波動", description: "整張影像亮度改變；檢查補償後是否仍有局部差異。", sample: "generated" },
  clear: { name: "正常批次", description: "影像與合格參考圖相同，練習紀錄與放行。", sample: "sample_images/wafer_reference.png" }
};

export const SHIFT_STATIONS = [
  { id: "carrier", name: "載具交接", code: "LOAD PORT", action: "掃描批次條碼", minutes: 3, x: -8, z: -1.3 },
  { id: "tool", name: "製程履歷", code: "ETCH HISTORY", action: "查核設備紀錄", minutes: 5, x: -4, z: -1.3 },
  { id: "aoi", name: "光學檢查", code: "AOI STATION", action: "執行影像比對", minutes: 4, x: 0, z: -1.3 },
  { id: "review", name: "品質處置", code: "QUALITY DESK", action: "決定暫停或放行", minutes: 3, x: 4, z: -1.3 },
  { id: "handoff", name: "交班報告", code: "SHIFT HANDOFF", action: "完成可追溯紀錄", minutes: 2, x: 8, z: -1.3 }
];

export function createShift(scenario = "particle") {
  if (!SHIFT_SCENARIOS[scenario]) throw new Error("未知值班情境");
  return { scenario, phase: "intro", minutes: 0, inspection: null, decision: null,
    score: 100, events: [{ minute: 0, text: `${SHIFT_SCENARIOS[scenario].name}情境已準備` }] };
}

export function startShift(state) {
  if (state.phase !== "intro") throw new Error("值班已開始");
  return { ...state, phase: "carrier" };
}

export function currentStationIndex(state) {
  return Math.max(0, SHIFT_STATIONS.findIndex((station) => station.id === state.phase));
}

export function advanceShift(state, action, payload = {}) {
  const required = { carrier: "scan", tool: "check", aoi: "inspect", review: "decide", handoff: "report" };
  if (required[state.phase] !== action) throw new Error("請先完成目前站點");
  const next = structuredClone(state);
  const index = currentStationIndex(state);
  next.minutes += SHIFT_STATIONS[index].minutes;
  if (action === "inspect") {
    if (!Number.isInteger(payload.regions) || payload.regions < 0 || !["review", "clear"].includes(payload.verdict)) {
      throw new Error("檢查結果無效");
    }
    next.inspection = { verdict: payload.verdict, regions: payload.regions,
      anomalyPercent: Number(payload.anomalyPercent || 0), brightnessShift: Number(payload.brightnessShift || 0),
      boxes: payload.boxes || [] };
  }
  if (action === "decide") {
    if (!next.inspection || !["hold", "release"].includes(payload.choice)) throw new Error("處置選項無效");
    next.decision = payload.choice;
    const expected = next.inspection.verdict === "review" ? "hold" : "release";
    if (payload.choice !== expected) next.score -= expected === "hold" ? 45 : 15;
  }
  const eventText = {
    scan: "已核對虛構批次 LOT-2041 與載具標籤",
    check: "已查核製程履歷，轉交光學檢查",
    inspect: next.inspection?.verdict === "review" ? "AOI 提示局部差異，需人工覆核" : "AOI 在目前門檻下未見局部異常",
    decide: next.decision === "hold" ? "批次已暫停，轉人工覆核" : "批次已放行至後續流程",
    report: "值班報告已完成"
  }[action];
  next.events.push({ minute: next.minutes, text: eventText });
  next.phase = index === SHIFT_STATIONS.length - 1 ? "done" : SHIFT_STATIONS[index + 1].id;
  return next;
}

export function shiftOutcome(state) {
  if (state.phase !== "done") return null;
  const expected = state.inspection.verdict === "review" ? "hold" : "release";
  return {
    safe: state.decision === expected,
    title: state.decision === expected ? "風險處置與紀錄完成" : "處置需要重新檢討",
    detail: state.decision === expected ?
      "這是合成情境的合理處置；實際批次放行必須遵守業主流程與授權。" :
      state.decision === "release" ? "疑似差異仍被放行；現場需查核漏檢與客訴風險。" :
        "未見局部差異仍暫停批次；現場需評估誤報與交期成本。"
  };
}
