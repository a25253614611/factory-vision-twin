import { STAGES, SCENARIOS, createEnterpriseState, advanceEnterprise, resolveEnterpriseIncident, enterpriseMetrics } from "./enterprise-core.js";

const $ = (id) => document.getElementById(id);
const glyphs = ["◈", "▧", "▤", "▣", "◎", "◇", "⇢"];
const storageKey = "flowtwin:enterprise-state-v1";
let state = createEnterpriseState();
let selected = 0;
try {
  const stored = JSON.parse(sessionStorage.getItem(storageKey) || "null");
  if (stored && SCENARIOS.some((item) => item.id === stored.state?.scenario) &&
      Number.isInteger(stored.state.hour) && stored.state.hour >= 0 && stored.state.hour <= 500 &&
      Array.isArray(stored.state.lots) && stored.state.lots.length === 4 &&
      Number.isInteger(stored.selected) && stored.selected >= 0 && stored.selected < STAGES.length) {
    state = stored.state;
    selected = stored.selected;
    $("scenarioSelect").value = state.scenario;
  }
} catch { /* Missing or invalid session state starts a new demonstration. */ }

function clock(hour) {
  const total = 8 + hour;
  return `D${Math.floor(total / 24) + 1} ${String(total % 24).padStart(2, "0")}:00`;
}

function selectStage(index) {
  selected = Math.max(0, Math.min(STAGES.length - 1, index));
  render();
}

function render() {
  const stats = enterpriseMetrics(state);
  $("clockValue").textContent = clock(state.hour);
  $("activeValue").textContent = stats.active;
  $("deliveredValue").textContent = stats.delivered;
  $("onTimeValue").textContent = `準時交付 ${stats.onTime} 批`;
  $("alertValue").textContent = state.lots.filter((lot) => lot.held ||
    (lot.shippedAt === null && state.hour > lot.due)).length;
  $("alertCaption").textContent = state.incident ? state.incident.title :
    stats.overdue ? `${stats.overdue} 批超過模擬交期` : "目前沒有批次暫停";
  $("scenarioDescription").textContent = SCENARIOS.find((item) => item.id === state.scenario).description;
  $("supportBusiness").textContent = stats.overdue ? `${stats.overdue} 批交期需溝通` :
    state.scenario === "urgent" ? "急單交期追蹤中" : `${state.lots.length} 批需求追蹤中`;
  $("supportEngineering").textContent = `${state.lots.filter((lot) => lot.reworked).length} 批返工`;
  $("supportFacility").textContent = state.incident?.kind === "tool" ? "設備停機待維修" : "設備模擬正常";
  $("supportQuality").textContent = `${state.lots.filter((lot) => lot.held && lot.stage === 4).length} 批待覆核`;
  const finished = stats.delivered === state.lots.length;
  $("stepButton").disabled = finished;
  $("fastButton").disabled = finished;

  const incident = $("incidentBar");
  incident.hidden = !state.incident;
  if (state.incident) {
    $("incidentTitle").textContent = state.incident.title;
    $("incidentText").textContent = state.incident.kind === "particle" ?
      "請先進入晶圓檢查工作台觀察合成微粒，再以人工覆核與返工處置此虛構批次。" :
      "點選完成處置，模擬維修復機；此操作不控制任何真實設備。";
    $("resolveButton").textContent = state.incident.kind === "particle" ? "覆核後返工" : "完成維修";
  }

  const flow = $("stageFlow");
  flow.replaceChildren();
  STAGES.forEach((stage, index) => {
    const count = state.lots.filter((lot) => lot.stage === index).length;
    const problem = state.lots.some((lot) => lot.stage === index && lot.held);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `stage-card${index === selected ? " selected" : ""}${problem ? " problem" : ""}`;
    button.setAttribute("aria-pressed", String(index === selected));
    button.innerHTML = `<span class="stage-num">${String(index + 1).padStart(2, "0")} / ${stage.en}</span><strong>${stage.name}</strong><small>${count} 批在站${problem ? " · 待處置" : ""}</small><span class="stage-bar"><i style="width:${Math.max(8, Math.min(100, count * 25))}%"></i></span>`;
    button.addEventListener("click", () => selectStage(index));
    flow.appendChild(button);
  });

  const stage = STAGES[selected];
  const stationLots = state.lots.filter((lot) => lot.stage === selected);
  $("detailNumber").textContent = `${String(selected + 1).padStart(2, "0")} / 07`;
  $("detailGlyph").textContent = glyphs[selected];
  $("detailEnglish").textContent = stage.en;
  $("detailName").textContent = stage.name;
  $("detailDescription").textContent = stage.detail;
  $("detailLots").textContent = `${stationLots.length} 批`;
  $("detailStatus").textContent = stationLots.some((lot) => lot.held) ? "暫停，等待人工處置" : "模擬運行中";
  $("detailNext").textContent = STAGES[selected + 1]?.name || "客戶收貨";
  $("detailLink").hidden = selected !== 4;

  const tbody = $("lotRows");
  tbody.replaceChildren();
  for (const lot of state.lots) {
    const row = document.createElement("tr");
    const status = lot.shippedAt !== null ? (lot.shippedAt <= lot.due ? "已交付" : "延遲交付") :
      lot.held ? "暫停覆核" : state.hour > lot.due ? "交期已過" : "流轉中";
    const css = lot.held ? "held" : lot.shippedAt !== null ? (lot.shippedAt <= lot.due ? "delivered" : "late") :
      state.hour > lot.due ? "late" : "";
    const cells = [lot.id, lot.customer, lot.stage < STAGES.length ? STAGES[lot.stage].name : "已交付", `第 ${lot.due} 小時`];
    cells.forEach((value, index) => {
      const cell = document.createElement("td");
      if (index === 0) {
        const strong = document.createElement("strong");
        strong.textContent = value;
        const small = document.createElement("small");
        small.textContent = lot.product;
        cell.append(strong, small);
      } else cell.textContent = value;
      row.appendChild(cell);
    });
    const last = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `state-pill ${css}`;
    badge.textContent = status;
    last.appendChild(badge);
    row.appendChild(last);
    tbody.appendChild(row);
  }

  const list = $("eventList");
  list.replaceChildren();
  state.events.slice(0, 7).forEach((event) => {
    const item = document.createElement("li");
    item.className = event.kind;
    const time = document.createElement("time");
    time.textContent = clock(event.hour);
    const span = document.createElement("span");
    span.textContent = event.text;
    item.append(time, span);
    list.appendChild(item);
  });
  window.dispatchEvent(new CustomEvent("enterprise:update", { detail: { state, selected } }));
  try { sessionStorage.setItem(storageKey, JSON.stringify({ state, selected })); } catch { /* Private browsing may reject storage. */ }
}

$("scenarioSelect").addEventListener("change", (event) => {
  state = createEnterpriseState(event.target.value);
  selected = 0;
  render();
});
$("stepButton").addEventListener("click", () => { state = advanceEnterprise(state); render(); });
$("fastButton").addEventListener("click", () => {
  const hadIncident = Boolean(state.incident);
  for (let i = 0; i < 8; i++) {
    state = advanceEnterprise(state);
    if (!hadIncident && state.incident) break;
  }
  render();
});
$("resetButton").addEventListener("click", () => { state = createEnterpriseState($("scenarioSelect").value); selected = 0; render(); });
$("resolveButton").addEventListener("click", () => { state = resolveEnterpriseIncident(state); render(); });
window.addEventListener("enterprise:select", (event) => selectStage(event.detail.index));
render();
