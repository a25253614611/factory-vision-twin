/** Relative image coordinates only. This is not a calibrated wafer or die map. */
const canvas = document.getElementById("waferMapCanvas");
const context = canvas.getContext("2d");
const summary = document.getElementById("mapSummary");
const size = canvas.width;
const center = size / 2;
const radius = 168;

function drawMap(detail = null) {
  context.clearRect(0, 0, size, size);
  context.fillStyle = "#0b192a";
  context.fillRect(0, 0, size, size);
  const glow = context.createRadialGradient(center, center, 35, center, center, radius + 35);
  glow.addColorStop(0, "#214c63");
  glow.addColorStop(1, "#0b1d31");
  context.fillStyle = glow;
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.fill();
  context.save();
  context.beginPath();
  context.arc(center, center, radius - 3, 0, Math.PI * 2);
  context.clip();
  context.strokeStyle = "#41799070";
  context.lineWidth = 1;
  for (let position = center - radius; position <= center + radius; position += 27) {
    context.beginPath(); context.moveTo(position, center - radius); context.lineTo(position, center + radius); context.stroke();
    context.beginPath(); context.moveTo(center - radius, position); context.lineTo(center + radius, position); context.stroke();
  }
  context.restore();
  context.strokeStyle = "#8bdeea";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = "#5fbacf66";
  context.lineWidth = 1;
  context.setLineDash([5, 7]);
  for (const r of [radius / 3, radius * 2 / 3]) {
    context.beginPath(); context.arc(center, center, r, 0, Math.PI * 2); context.stroke();
  }
  context.setLineDash([]);
  context.fillStyle = "#adcbd6";
  context.font = "11px system-ui";
  context.fillText("IMAGE TOP", center - 33, 24);
  context.fillText("RELATIVE LOCATION ONLY", center - 72, size - 17);
  if (!detail) return;
  for (const [index, box] of detail.boxes.entries()) {
    const imageX = box.x + box.w / 2;
    const imageY = box.y + box.h / 2;
    const relativeRadius = Math.min(detail.width, detail.height) * 0.43;
    const x = center + ((imageX - detail.width / 2) / relativeRadius) * radius;
    const y = center + ((imageY - detail.height / 2) / relativeRadius) * radius;
    if ((x - center) ** 2 + (y - center) ** 2 > radius ** 2) continue;
    context.fillStyle = "#ff7e69";
    context.shadowColor = "#ff7959";
    context.shadowBlur = 17;
    context.beginPath(); context.arc(x, y, 6, 0, Math.PI * 2); context.fill();
    context.shadowBlur = 0;
    context.fillStyle = "#fff4ed";
    context.fillText(String(index + 1), x + 11, y - 10);
  }
}

window.addEventListener("flowtwin:inspection", (event) => {
  const detail = event.detail;
  drawMap(detail);
  summary.textContent = detail.boxes.length
    ? "發現 " + detail.boxes.length + " 處疑似差異；紅點標示影像中的相對位置。"
    : "本張照片在目前門檻下未見足夠差異。";
});
window.addEventListener("flowtwin:reset", () => {
  drawMap();
  summary.textContent = "等待檢查影像";
});
drawMap();
