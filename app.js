"use strict";

const byId = (id) => document.getElementById(id);
let demo;
let elapsed = 0;
let frame = 0;
let lastFrame = 0;
let playing = false;
const duration = 49;

function textCell(row, value, className) {
  const cell = document.createElement("td");
  cell.textContent = String(value);
  if (className) cell.className = className;
  row.appendChild(cell);
}

function current() {
  return demo.scenarios[byId("scenario").value];
}

function selectedMode() {
  return byId("mode").value;
}

function metricsLine(label, baseline, adaptive, unit) {
  const row = document.createElement("div");
  row.className = "compare-row";
  [label, String(baseline) + unit, String(adaptive) + unit].forEach((value) => {
    const span = document.createElement("span");
    span.textContent = value;
    row.appendChild(span);
  });
  return row;
}

function renderComparison(state) {
  const baseline = state.modes.baseline.metrics;
  const adaptive = state.modes.adaptive.metrics;
  const container = byId("comparison-rows");
  container.replaceChildren(
    metricsLine("正確關聯率", baseline.traceability_percent, adaptive.traceability_percent, "%"),
    metricsLine("覆核估計", baseline.manual_checks, adaptive.manual_checks, " 件"),
    metricsLine("誤報佇列", baseline.false_queue, adaptive.false_queue, " 件"),
    metricsLine("P95 延遲*", baseline.p95_latency_ms, adaptive.p95_latency_ms, " ms")
  );
  const scenario = byId("scenario").value;
  const insights = {
    normal: "標準情境下兩者都能關聯 12 件；較高信心門檻阻擋 2 件合成雜訊，但估計延遲增加 13 ms。",
    lighting: "亮度縮放使原始歐氏距離失效。正規化外觀恢復 11/12 件；1 件低信心真實觀測被門檻擋下。",
    occlusion: "2 件出站觀測被遮擋而缺失。沒有影像就無法憑空確認身分，應送人工覆核。",
    combined: "光線與遮擋同時發生時仍有 9/12 件可關聯，剩餘 3 件進入覆核；需用真實影片重估門檻。"
  };
  byId("insight").textContent = insights[scenario];
}

function renderMatches(state, mode) {
  const matches = state.modes[mode].matches;
  const first = new Map(state.observations.camera_a.map((row) => [row.local_id, row]));
  const second = new Map(state.observations.camera_b.map((row) => [row.local_id, row]));
  const body = byId("match-rows");
  body.replaceChildren();
  matches.forEach((match) => {
    const row = document.createElement("tr");
    const correct = first.get(match.camera_a).truth_id === second.get(match.camera_b).truth_id;
    textCell(row, match.global_id);
    textCell(row, match.camera_a);
    textCell(row, match.camera_b);
    textCell(row, mode === "adaptive" ? match.score.toFixed(3) + " cosine" : match.score.toFixed(3) + " distance");
    textCell(row, correct ? "✓ 正確" : "! 錯誤", correct ? "ok" : "bad");
    body.appendChild(row);
  });
  if (!matches.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "此條件下沒有達到關聯門檻的觀測；需調查光線、特徵與相機配置。";
    row.appendChild(cell);
    body.appendChild(row);
  }
  byId("match-count").textContent = matches.length + " 筆關聯";
}

function renderEvents(state) {
  const cameraB = state.observations.camera_b;
  byId("cam-b-count").textContent = cameraB.filter((row) => !row.is_false_positive).length;
  const container = byId("event-list");
  container.replaceChildren();
  const eventLines = [
    ["T+04.0", "CAM 01 開始觀測首件工件"],
    ["T+11.7", "首件工件進入 CAM 02 視野"],
    ["T+18.2", "注入低信心背景雜訊 #1"],
    ["T+33.2", "注入低信心背景雜訊 #2"]
  ];
  if (byId("scenario").value !== "normal") eventLines.push(["SCENARIO", byId("scenario").selectedOptions[0].textContent + " 已啟用"]);
  eventLines.forEach(([time, label]) => {
    const row = document.createElement("div");
    row.className = "event-item";
    const stamp = document.createElement("span");
    stamp.className = "event-time";
    stamp.textContent = time;
    const message = document.createElement("span");
    message.textContent = label;
    row.append(stamp, message);
    container.appendChild(row);
  });
}

function renderDashboard() {
  if (!demo) return;
  const state = current();
  const mode = selectedMode();
  const metrics = state.modes[mode].metrics;
  byId("trace").textContent = metrics.traceability_percent.toFixed(1);
  byId("trace-detail").textContent = metrics.correct + " / " + demo.metadata.item_count + " 件正確關聯 · " + metrics.wrong_links + " 件錯配";
  byId("false").textContent = metrics.false_queue;
  byId("review").textContent = metrics.manual_checks;
  byId("latency").textContent = metrics.p95_latency_ms;
  renderComparison(state);
  renderMatches(state, mode);
  renderEvents(state);
  renderFactory();
}

function renderFactory() {
  if (!demo) return;
  const state = current();
  const matchedIds = new Set(state.modes[selectedMode()].matches.map((row) => row.global_id));
  const container = byId("workpieces");
  container.replaceChildren();
  state.observations.items.forEach((item) => {
    const position = (elapsed - item.start + 3) / 19;
    if (position < 0 || position > 1) return;
    const piece = document.createElement("span");
    piece.className = "workpiece" + (matchedIds.has(item.id) && elapsed >= item.arrival ? " matched" : "");
    piece.style.left = (position * 100).toFixed(2) + "%";
    piece.style.color = item.color;
    piece.style.backgroundColor = item.color;
    piece.title = item.id;
    piece.setAttribute("aria-label", item.id);
    container.appendChild(piece);
  });
  byId("clock").textContent = "T+" + elapsed.toFixed(1).padStart(4, "0") + "s";
  const events = state.observations.camera_b.filter((row) => row.time <= elapsed);
  if (elapsed === 0) byId("event").textContent = "等待播放";
  else if (!events.length) byId("event").textContent = "CAM 01 正在擷取入站軌跡";
  else {
    const latest = events[events.length - 1];
    byId("event").textContent = latest.is_false_positive
      ? latest.local_id + " · 低信心雜訊"
      : latest.local_id + " · " + (state.modes[selectedMode()].matches.some((match) => match.camera_b === latest.local_id) ? "已關聯" : "待人工覆核");
  }
}

function tick(timestamp) {
  if (!playing) return;
  if (lastFrame) elapsed += Math.min((timestamp - lastFrame) / 1000, 0.1) * 2.2;
  lastFrame = timestamp;
  if (elapsed >= duration) {
    elapsed = duration;
    playing = false;
    byId("play").textContent = "▶ 重新播放";
  } else {
    frame = requestAnimationFrame(tick);
  }
  renderFactory();
}

function stop(reset) {
  playing = false;
  cancelAnimationFrame(frame);
  lastFrame = 0;
  if (reset) elapsed = 0;
  byId("play").textContent = "▶ 播放產線";
  renderFactory();
}

async function init() {
  byId("scenario").addEventListener("change", () => { stop(true); renderDashboard(); });
  byId("mode").addEventListener("change", () => { stop(true); renderDashboard(); });
  byId("reset").addEventListener("click", () => stop(true));
  byId("play").addEventListener("click", () => {
    if (playing) { stop(false); return; }
    if (elapsed >= duration) elapsed = 0;
    playing = true;
    lastFrame = 0;
    byId("play").textContent = "Ⅱ 暫停";
    frame = requestAnimationFrame(tick);
  });
  try {
    const response = await fetch("demo_data.json");
    if (!response.ok) throw new Error("HTTP " + response.status);
    demo = await response.json();
    renderDashboard();
  } catch (error) {
    byId("event").textContent = "資料載入失敗：請在專案資料夾執行 python -m http.server 8766";
    console.error(error);
  }
}

init();
