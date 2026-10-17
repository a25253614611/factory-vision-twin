import { inspectImages, normalizeRoi } from "./inspection-core.js";
import { publishDemoInspection } from "./inspection-bridge.js";

const $ = (id) => document.getElementById(id);
const MAX_SIDE = 640;
const MAX_BATCH = 25;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const isWafer = document.body.dataset.mode === "wafer";
let reference = null;
let samples = [];
let records = [];
let roi = null;
let currentRecord = null;
let cameraStream = null;
let dragging = null;
let busy = false;
let demoLoading = false;

function status(message, error = false) {
  $("statusLine").textContent = message;
  $("statusLine").style.borderColor = error ? "#a85c58" : "#315875";
}

function imageDataFromCanvas(canvas) {
  return canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
}

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function readImageFile(file, width, height) {
  if (!IMAGE_TYPES.has(file.type) || file.size > MAX_FILE_BYTES) {
    throw new Error(file.name + "：只接受 20 MB 以下的 JPG、PNG 或 WebP。 ");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const sourceRatio = bitmap.width / bitmap.height;
    const targetRatio = width / height;
    if (Math.abs(sourceRatio / targetRatio - 1) > 0.03) {
      throw new Error(file.name + "：長寬比與參考圖差距超過 3%，請用同一相機與裁切範圍。");
    }
    const canvas = makeCanvas(width, height);
    canvas.getContext("2d", { willReadFrequently: true }).drawImage(bitmap, 0, 0, width, height);
    return imageDataFromCanvas(canvas);
  } finally {
    bitmap.close();
  }
}

async function setReference(file) {
  if (!file) return;
  if (busy) throw new Error("目前正在檢查，請完成後再更換參考圖。");
  if (!IMAGE_TYPES.has(file.type) || file.size > MAX_FILE_BYTES) {
    throw new Error("參考圖只接受 20 MB 以下的 JPG、PNG 或 WebP。");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const factor = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(20, Math.round(bitmap.width * factor));
    const height = Math.max(20, Math.round(bitmap.height * factor));
    const canvas = makeCanvas(width, height);
    canvas.getContext("2d", { willReadFrequently: true }).drawImage(bitmap, 0, 0, width, height);
    reference = { name: file.name, data: imageDataFromCanvas(canvas), width, height };
    samples = [];
    records = [];
    renderLog();
    $("sampleInput").value = "";
    $("sampleName").textContent = "尚未選擇照片";
    $("sampleEmpty").hidden = false;
    $("verdict").textContent = "等待影像";
    $("defectCount").textContent = "—";
    $("anomalyPct").textContent = "—";
    $("alignment").textContent = "位置校正：—";
    $("brightness").textContent = "亮度補償：—";
    roi = normalizeRoi(null, width, height);
    currentRecord = null;
    window.dispatchEvent(new Event("flowtwin:reset"));
    $("referenceName").textContent = file.name + " · " + bitmap.width + "×" + bitmap.height;
    $("referenceEmpty").hidden = true;
    renderReference();
    updateReady();
    $("imageDimensions").textContent = "檢查解析度：" + width + "×" + height;
    status("合格品參考圖已載入；請選待檢照片，或使用本機相機。");
  } finally {
    bitmap.close();
  }
}

function drawDemoBoard(ctx, missing) {
  const width = ctx.canvas.width, height = ctx.canvas.height;
  ctx.fillStyle = "#101b2d";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#304457";
  ctx.fillRect(63, 48, 514, 304);
  ctx.fillStyle = "#245b64";
  ctx.fillRect(80, 64, 480, 272);
  ctx.strokeStyle = "#438f91";
  ctx.lineWidth = 5;
  for (let i = 0; i < 7; i++) {
    const y = 97 + i * 33;
    ctx.beginPath();
    ctx.moveTo(130, y);
    ctx.lineTo(498, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#152d3e";
  ctx.fillRect(192, 130, 250, 128);
  ctx.fillStyle = "#9bb7c0";
  ctx.fillRect(207, 145, 220, 98);
  ctx.fillStyle = "#3b5368";
  ctx.fillRect(218, 156, 198, 76);
  const screws = [[110, 94], [530, 94], [110, 308], [530, 308]];
  screws.forEach(([x, y], index) => {
    if (missing && index === 3) return;
    ctx.fillStyle = "#e2e8e5";
    ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#617b8b";
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#d2dedf";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.stroke();
  });
}

function loadDemo(missing) {
  if (busy) return;
  $("referenceInput").value = "";
  $("sampleInput").value = "";
  records = [];
  renderLog();
  window.dispatchEvent(new Event("flowtwin:reset"));
  const first = makeCanvas(640, 400);
  const second = makeCanvas(640, 400);
  drawDemoBoard(first.getContext("2d"), false);
  drawDemoBoard(second.getContext("2d"), missing);
  reference = { name: "示範_合格電路板.png", data: imageDataFromCanvas(first), width: 640, height: 400 };
  samples = [{ name: missing ? "示範_缺少固定螺絲.png" : "示範_合格品.png", data: imageDataFromCanvas(second), demo: true }];
  roi = normalizeRoi(null, 640, 400);
  currentRecord = null;
  $("referenceName").textContent = reference.name + " · 合成示範";
  $("sampleName").textContent = samples[0].name + " · 合成示範";
  $("referenceEmpty").hidden = true;
  $("sampleEmpty").hidden = true;
  $("imageDimensions").textContent = "檢查解析度：640×400";
  renderReference();
  updateReady();
  runInspection();
}

async function loadWaferDemo(kind) {
  if (busy || demoLoading) return;
  demoLoading = true;
  const files = {
    particle: ["wafer_particle.png", "合成晶圓_微粒.png"],
    scratch: ["wafer_scratch.png", "合成晶圓_刮痕.png"],
    clear: ["wafer_reference.png", "合成晶圓_良品.png"]
  };
  try {
    status("載入合成晶圓影像中……");
    const [referenceResponse, sampleResponse] = await Promise.all([
      fetch("sample_images/wafer_reference.png"), fetch("sample_images/" + files[kind][0])
    ]);
    if (!referenceResponse.ok || !sampleResponse.ok) throw new Error("示範影像未載入；請確認已用本機伺服器啟動網站。");
    const referenceFile = new File([await referenceResponse.blob()], "合成晶圓_參考.png", { type: "image/png" });
    const sampleFile = new File([await sampleResponse.blob()], files[kind][1], { type: "image/png" });
    await setReference(referenceFile);
    const data = await readImageFile(sampleFile, reference.width, reference.height);
    samples = [{ name: sampleFile.name, data, demo: true, kind }];
    $("referenceName").textContent = referenceFile.name + " · 合成示範";
    $("sampleName").textContent = sampleFile.name + " · 合成示範";
    $("sampleEmpty").hidden = true;
    updateReady();
    await runInspection();
  } catch (error) {
    status(error.message || String(error), true);
  } finally {
    demoLoading = false;
  }
}

function renderReference() {
  if (!reference) return;
  const canvas = $("referenceCanvas");
  canvas.width = reference.width;
  canvas.height = reference.height;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(reference.data, 0, 0);
  if (roi) {
    ctx.save();
    ctx.strokeStyle = "#69edc8";
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 5]);
    if (isWafer) {
      ctx.beginPath();
      ctx.arc(roi.x + roi.w / 2, roi.y + roi.h / 2, Math.min(roi.w, roi.h) / 2 - 1, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(roi.x + 1, roi.y + 1, roi.w - 2, roi.h - 2);
    }
    ctx.restore();
    $("roiInfo").textContent = (isWafer ? "圓形 ROI 外接框：" : "ROI：") + roi.x + "," + roi.y + " · " + roi.w + "×" + roi.h;
  }
}

function renderSample(record) {
  if (!reference || !record) return;
  const canvas = $("sampleCanvas");
  canvas.width = reference.width;
  canvas.height = reference.height;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(record.data, 0, 0);
  const result = record.result;
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ff755f";
  ctx.fillStyle = "#ff755f";
  ctx.font = "bold 14px system-ui";
  result.boxes.slice(0, 25).forEach((box, index) => {
    const x = box.x + result.offset.x, y = box.y + result.offset.y;
    ctx.strokeRect(x - 4, y - 4, box.w + 8, box.h + 8);
    ctx.fillRect(x - 4, Math.max(0, y - 25), 80, 18);
    ctx.fillStyle = "#fff";
    ctx.fillText("DIFF " + (index + 1), x + 1, Math.max(14, y - 11));
    ctx.fillStyle = "#ff755f";
  });
  ctx.restore();
  $("sampleEmpty").hidden = true;
  $("verdict").textContent = result.verdict === "review" ? "需人工覆核" : "未見異常";
  $("verdict").style.color = result.verdict === "review" ? "#ffad9b" : "#73e4b4";
  $("defectCount").textContent = result.regions;
  $("anomalyPct").textContent = result.anomalyPercent.toFixed(2);
  $("alignment").textContent = "位置校正：x " + result.offset.x + " / y " + result.offset.y + " px";
  $("brightness").textContent = "亮度補償：" + (result.brightnessShift >= 0 ? "+" : "") + result.brightnessShift;
  $("sampleName").textContent = record.name + (record.demo ? " · 合成示範" : "");
}

function updateReady() {
  $("inspectButton").disabled = busy || !reference || samples.length === 0;
}

function settings() {
  return {
    threshold: Number($("thresholdInput").value),
    minArea: Number($("minAreaInput").value),
    maxShift: Number($("maxShiftInput").value),
    circleMask: isWafer,
    roi
  };
}

function renderLog() {
  const body = $("batchRows");
  body.replaceChildren();
  if (!records.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.className = "table-empty";
    cell.textContent = isWafer ? "尚無檢查紀錄。先試試「微粒示範」。" : "尚無檢查紀錄。先試試「載入缺件示範」。";
    row.appendChild(cell);
    body.appendChild(row);
  }
  records.forEach((record, index) => {
    const row = document.createElement("tr");
    const values = [String(index + 1).padStart(2, "0"), record.name,
      record.result.verdict === "review" ? "需人工覆核" : "未見異常",
      record.result.regions + " 處", record.result.anomalyPercent.toFixed(2) + "%",
      record.result.offset.x + ", " + record.result.offset.y];
    values.forEach((value, column) => {
      const cell = document.createElement("td");
      if (column === 2) {
        const badge = document.createElement("span");
        badge.className = "badge " + (record.result.verdict === "review" ? "review" : "good");
        badge.textContent = value;
        cell.appendChild(badge);
      } else cell.textContent = value;
      row.appendChild(cell);
    });
    row.addEventListener("click", () => {
      currentRecord = record;
      renderSample(record);
      status("顯示第 " + (index + 1) + " 張：" + record.name + "。紅框是與參考圖的差異，需由人員確認原因。");
    });
    body.appendChild(row);
  });
  $("inspectedCount").textContent = records.length;
  $("exportCsv").disabled = !records.length;
  $("exportJson").disabled = !records.length;
}

async function runInspection() {
  if (busy || !reference || !samples.length) return;
  busy = true;
  updateReady();
  const opts = settings();
  let completed = 0, failures = 0, synced = 0, lastError = "";
  try {
    for (const sample of samples) {
      try {
        status("檢查中：" + sample.name);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const data = sample.data || await readImageFile(sample.file, reference.width, reference.height);
        const result = inspectImages(reference.data.data, data.data, reference.width, reference.height, opts);
        const record = { name: sample.name, referenceName: reference.name, data, result, demo: !!sample.demo, at: new Date().toISOString() };
        records.push(record);
        currentRecord = record;
        renderSample(record);
        renderLog();
        window.dispatchEvent(new CustomEvent("flowtwin:inspection", { detail: {
          verdict: result.verdict, name: sample.name, boxes: result.boxes,
          width: reference.width, height: reference.height
        } }));
        if (isWafer && sample.demo && sample.kind) {
          try {
            publishDemoInspection({ kind: sample.kind, verdict: result.verdict, defectCount: result.regions });
            $("monitorSync").hidden = false;
            synced++;
          } catch { /* Image inspection remains usable when browser storage is unavailable. */ }
        }
        completed++;
      } catch (error) {
        failures++;
        lastError = error.message || String(error);
        status(lastError, true);
      }
    }
  } finally {
    busy = false;
    updateReady();
  }
  status("完成 " + completed + " 張；" + failures + " 張未處理。" + (synced ? ` ${synced} 筆合成結果已同步至整廠監控。` : "") +
    (lastError ? "最後錯誤：" + lastError + "。" : "紅框標示疑似差異，請人工核對。"), failures > 0);
}

function download(name, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

function exportRows() {
  return records.map((record, index) => ({
    sequence: index + 1, reference_filename: record.referenceName, filename: record.name, checked_at: record.at,
    verdict: record.result.verdict, regions: record.result.regions,
    anomaly_percent: record.result.anomalyPercent, offset_x: record.result.offset.x,
    offset_y: record.result.offset.y, brightness_shift: record.result.brightnessShift,
    threshold: record.result.threshold, min_area: record.result.minArea,
    mask_mode: record.result.maskMode,
    roi: record.result.roi, boxes: record.result.boxes
  }));
}

function pointOnReference(event) {
  const canvas = $("referenceCanvas");
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
  const drawnWidth = canvas.width * scale;
  const drawnHeight = canvas.height * scale;
  const left = rect.left + (rect.width - drawnWidth) / 2;
  const top = rect.top + (rect.height - drawnHeight) / 2;
  return {
    x: Math.max(0, Math.min(canvas.width - 1, Math.round((event.clientX - left) / scale))),
    y: Math.max(0, Math.min(canvas.height - 1, Math.round((event.clientY - top) / scale)))
  };
}

function setupRoiDrawing() {
  const canvas = $("referenceCanvas");
  canvas.addEventListener("pointerdown", (event) => {
    if (!reference) return;
    dragging = pointOnReference(event);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!dragging || !reference) return;
    const end = pointOnReference(event);
    const x = Math.min(dragging.x, end.x), y = Math.min(dragging.y, end.y);
    const w = Math.abs(end.x - dragging.x), h = Math.abs(end.y - dragging.y);
    dragging = null;
    if (w < 20 || h < 20) return;
    roi = normalizeRoi({ x, y, w, h }, reference.width, reference.height);
    renderReference();
    status("ROI 已更新。按「開始檢查」重新計算，僅比較框內區域。");
  });
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    status("這個瀏覽器未提供相機介面；請使用 HTTPS 線上頁或 localhost。", true);
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "environment" } });
    $("cameraVideo").srcObject = cameraStream;
    $("cameraVideo").hidden = false;
    $("captureButton").disabled = false;
    $("stopCamera").disabled = false;
    $("cameraButton").disabled = true;
    status("相機已開啟。請將產品固定在與參考圖相同的位置，再按「擷取並檢查」。");
  } catch (error) {
    status("無法開啟相機：" + (error.message || error.name), true);
  }
}

function stopCamera() {
  if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  $("cameraVideo").srcObject = null;
  $("cameraVideo").hidden = true;
  $("captureButton").disabled = true;
  $("stopCamera").disabled = true;
  $("cameraButton").disabled = false;
}

function captureCamera() {
  if (!reference || !cameraStream) {
    status("請先載入合格品參考圖並啟用相機。", true);
    return;
  }
  const video = $("cameraVideo");
  if (!video.videoWidth) return;
  const canvas = makeCanvas(reference.width, reference.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const ratio = reference.width / reference.height;
  let sw = video.videoWidth, sh = video.videoHeight;
  if (sw / sh > ratio) sw = sh * ratio; else sh = sw / ratio;
  const sx = (video.videoWidth - sw) / 2, sy = (video.videoHeight - sh) / 2;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, reference.width, reference.height);
  samples = [{ name: "camera_" + new Date().toISOString().replaceAll(":", "-") + ".png", data: imageDataFromCanvas(canvas) }];
  $("sampleName").textContent = samples[0].name + " · 中央裁切";
  updateReady();
  runInspection();
}

function init() {
  $("referenceInput").addEventListener("change", async (event) => {
    try { await setReference(event.target.files[0]); } catch (error) { status(error.message, true); }
  });
  $("sampleInput").addEventListener("change", (event) => {
    const files = [...event.target.files];
    if (files.length > MAX_BATCH) {
      status("每批最多 " + MAX_BATCH + " 張；請分批處理。", true);
      return;
    }
    samples = files.map((file) => ({ name: file.name, file }));
    $("sampleName").textContent = files.length ? files.length + " 張照片已選擇" : "尚未選擇照片";
    updateReady();
    if (files.length) status("已選 " + files.length + " 張待檢照片。按「開始檢查」。");
  });
  $("demoDefect").addEventListener("click", () => isWafer ? loadWaferDemo("particle") : loadDemo(true));
  $("demoGood").addEventListener("click", () => isWafer ? loadWaferDemo("clear") : loadDemo(false));
  if (isWafer) $("demoScratch").addEventListener("click", () => loadWaferDemo("scratch"));
  $("inspectButton").addEventListener("click", runInspection);
  $("thresholdInput").addEventListener("input", () => { $("thresholdValue").textContent = $("thresholdInput").value; });
  $("exportJson").addEventListener("click", () => download("flowtwin-inspection.json", JSON.stringify(exportRows(), null, 2), "application/json"));
  $("exportCsv").addEventListener("click", () => {
    const columns = ["sequence", "reference_filename", "filename", "checked_at", "verdict", "regions", "anomaly_percent", "offset_x", "offset_y", "brightness_shift", "threshold", "min_area", "mask_mode"];
    const csv = [columns.join(","), ...exportRows().map((record) => columns.map((key) => csvCell(record[key])).join(","))].join("\r\n");
    download("flowtwin-inspection.csv", "\ufeff" + csv, "text/csv;charset=utf-8");
  });
  $("cameraButton").addEventListener("click", startCamera);
  $("stopCamera").addEventListener("click", stopCamera);
  $("captureButton").addEventListener("click", captureCamera);
  window.addEventListener("beforeunload", stopCamera);
  setupRoiDrawing();
}

init();
