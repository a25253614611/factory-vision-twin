// All customers, lots, durations and incidents are fictional teaching data.
export const STAGES = [
  { id: "orders", name: "客戶與訂單", en: "CUSTOMER", detail: "需求、交期與設計規格確認", duration: 2 },
  { id: "design", name: "設計協作", en: "DESIGN", detail: "設計規則、光罩與試產準備示意", duration: 3 },
  { id: "supply", name: "材料供應", en: "SUPPLY", detail: "晶圓、化學品與供應風險追蹤示意", duration: 3 },
  { id: "fab", name: "晶圓製造", en: "WAFER FAB", detail: "沉積、微影、蝕刻與設備狀態示意", duration: 8 },
  { id: "inspection", name: "光學檢查", en: "INSPECTION", detail: "可進入影像工作台檢查疑似差異", duration: 2 },
  { id: "packaging", name: "封裝與測試", en: "PACK & TEST", detail: "晶粒分選、封裝與測試流程示意", duration: 5 },
  { id: "delivery", name: "交付與物流", en: "DELIVERY", detail: "出貨追蹤與交期回報示意", duration: 3 }
];

export const SCENARIOS = [
  { id: "normal", name: "正常運行", description: "觀察批次依序流轉，檢查端沒有預設異常。" },
  { id: "particle", name: "疑似微粒", description: "一批晶圓在光學檢查站暫停，人工覆核後返工。" },
  { id: "tool", name: "設備停機", description: "製造站暫停，維修復機後才繼續流轉。" },
  { id: "urgent", name: "急單插入", description: "第一批交期縮短；觀察是否準時交付。" }
];

const seedLots = [
  { id: "LOT-2041", customer: "北辰運算", product: "AI 加速器", stage: 3, remaining: 4, due: 16, color: "#68e5f0" },
  { id: "LOT-2042", customer: "遠山車電", product: "車用控制晶片", stage: 2, remaining: 2, due: 30, color: "#a4a0ff" },
  { id: "LOT-2043", customer: "晨光影像", product: "影像處理晶片", stage: 1, remaining: 2, due: 34, color: "#f6c376" },
  { id: "LOT-2044", customer: "雲海網通", product: "網通晶片", stage: 0, remaining: 1, due: 40, color: "#7de3ad" }
];

export function createEnterpriseState(scenario = "normal") {
  if (!SCENARIOS.some((item) => item.id === scenario)) throw new Error("未知情境");
  const lots = seedLots.map((lot) => ({ ...lot, due: scenario === "urgent" && lot.id === "LOT-2041" ? 11 : lot.due,
    held: false, reworked: false, shippedAt: null }));
  return { scenario, hour: 0, lots, incident: null, incidentResolved: false,
    events: [{ hour: 0, kind: "info", text: `${SCENARIOS.find((item) => item.id === scenario).name}情境已載入` }] };
}

function log(state, kind, text) {
  state.events.unshift({ hour: state.hour, kind, text });
  state.events = state.events.slice(0, 18);
}

export function advanceEnterprise(state) {
  const next = structuredClone(state);
  next.hour += 1;
  if (next.scenario === "tool" && next.hour === 3 && !next.incidentResolved) {
    next.incident = { kind: "tool", lotId: "LOT-2041", title: "晶圓製造設備停機" };
    const lot = next.lots.find((item) => item.id === "LOT-2041");
    lot.held = true;
    log(next, "alert", `${lot.id} 製造暫停，等待維修復機`);
  }
  for (const lot of next.lots) {
    if (lot.held || lot.stage >= STAGES.length) continue;
    lot.remaining -= 1;
    if (lot.remaining > 0) continue;
    lot.stage += 1;
    if (lot.stage >= STAGES.length) {
      lot.shippedAt = next.hour;
      log(next, lot.shippedAt <= lot.due ? "success" : "alert",
        `${lot.id} 已交付${lot.shippedAt <= lot.due ? "，符合模擬交期" : "，超過模擬交期"}`);
      continue;
    }
    lot.remaining = STAGES[lot.stage].duration;
    log(next, "info", `${lot.id} 進入${STAGES[lot.stage].name}`);
    if (next.scenario === "particle" && lot.id === "LOT-2041" && lot.stage === 4 && !lot.reworked) {
      lot.held = true;
      next.incident = { kind: "particle", lotId: lot.id, title: "疑似微粒，等待人工覆核" };
      log(next, "alert", `${lot.id} 光學檢查發現疑似差異，批次暫停`);
    }
    if (next.scenario === "urgent" && lot.id === "LOT-2041" && lot.stage >= 5) {
      lot.remaining = Math.max(1, lot.remaining - 1);
    }
  }
  return next;
}

export function resolveEnterpriseIncident(state) {
  if (!state.incident) return state;
  const next = structuredClone(state);
  const { kind, lotId } = next.incident;
  const lot = next.lots.find((item) => item.id === lotId);
  if (kind === "particle") {
    lot.stage = 3;
    lot.remaining = 3;
    lot.reworked = true;
    log(next, "success", `${lot.id} 人工覆核完成，退回製造站返工`);
  } else {
    log(next, "success", `${lot.id} 維修復機，恢復製造`);
  }
  lot.held = false;
  next.incident = null;
  next.incidentResolved = true;
  return next;
}

export function enterpriseMetrics(state) {
  const delivered = state.lots.filter((lot) => lot.shippedAt !== null);
  return {
    active: state.lots.length - delivered.length,
    delivered: delivered.length,
    onTime: delivered.filter((lot) => lot.shippedAt <= lot.due).length,
    held: state.lots.filter((lot) => lot.held).length,
    overdue: state.lots.filter((lot) => lot.shippedAt === null && state.hour > lot.due).length
  };
}
