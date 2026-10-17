import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(fileURLToPath(import.meta.url));
const contentTypes = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const path = resolve(root, pathname.replace(/^\/+/, "") || "index.html");
    if (path !== root && !path.startsWith(root + sep)) throw new Error("outside project");
    const data = await readFile(path);
    response.writeHead(200, { "Content-Type": contentTypes[extname(path)] || "application/octet-stream" });
    response.end(data);
  } catch { response.writeHead(404); response.end("Not found"); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  try { browser = await chromium.launch({ channel: "chrome", headless: true }); }
  catch { browser = await chromium.launch({ headless: true }); }
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${base}/monitor.html`);
  assert.equal(await page.locator("#runningValue").innerText(), "24");
  const scenarios = [
    { type: "cooling", root: "CH-01", minute5: "LTH-01", minute10: "CVD-01" },
    { type: "vibration", root: "ETC-02", minute5: "ETC-01", minute10: "AOI-01" },
    { type: "illumination", root: "AOI-01", minute5: "AOI-02", minute10: "MET-01" }
  ];
  for (const scenario of scenarios) {
    await page.locator("#incidentSelect").selectOption(scenario.type);
    await page.locator("#injectButton").click();
    assert.equal(await page.locator("#alertsValue").innerText(), "1");
    assert.match(await page.locator(`#evidenceList [data-machine="${scenario.root}"]`).innerText(), /\+0 分/);
    await page.locator("#stepButton").click();
    assert.match(await page.locator(`#evidenceList [data-machine="${scenario.minute5}"]`).innerText(), /\+5 分/);
    await page.locator("#stepButton").click();
    assert.match(await page.locator(`#evidenceList [data-machine="${scenario.minute10}"]`).innerText(), /\+10 分/);
    await page.locator(`#evidenceList [data-machine="${scenario.root}"]`).click();
    assert.equal(await page.locator("#machineId").innerText(), scenario.root);
    await page.locator("#diagnoseButton").click();
    await page.locator("#stepButton").click();
    await page.locator("#stepButton").click();
    assert.equal(await page.locator("#alertsValue").innerText(), "0");
  }
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#exportReportButton").click();
  const report = JSON.parse(await readFile(await (await downloadPromise).path(), "utf8"));
  assert.equal(report.cases.length, 3);
  assert.ok(report.cases.every((item) => item.after.alerts === 0));

  await page.locator("#resetButton").click();
  const wafer = await context.newPage();
  wafer.on("pageerror", (error) => pageErrors.push(error.message));
  await wafer.goto(`${base}/wafer.html`);
  await wafer.locator("#demoDefect").click();
  await wafer.locator("#monitorSync").waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector("#aoiCount")?.textContent.includes("待覆核 1 批"));
  await page.locator('#aoiRows [data-decision="held"]').click();
  assert.match(await page.locator("#aoiCount").innerText(), /暫停 1 批/);
  await page.locator('#aoiRows [data-decision="released"]').click();
  assert.match(await page.locator("#aoiCount").innerText(), /待覆核 0 批 · 暫停 0 批/);

  await page.locator("#replayDemoButton").click();
  await page.waitForFunction(() => document.querySelector("#modeStatus")?.textContent.includes("SYNTHETIC_JSON_DEMO"));
  assert.match(await page.locator("#modeStatus").innerText(), /SYNTHETIC_JSON_DEMO/);
  await page.locator("#fastButton").click();
  assert.match(await page.locator("#qualityStatus").innerText(), /缺值／過期/);
  assert.equal(await page.locator("#energyValue").innerText(), "—");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), "mobile horizontal overflow");
  assert.equal(await page.locator(".jump-monitor").isVisible(), true);
  assert.deepEqual(pageErrors, []);
  console.log("Browser smoke: 3 incidents, AOI handoff, replay, report, mobile layout passed.");
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
