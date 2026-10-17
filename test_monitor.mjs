import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPlant, advancePlant, injectIncident, diagnosePlant, setMachineStopped,
  receiveInspection, decideInspection, startReplay, plantSummary, zoneStatus, EQUIPMENT, ZONES } from "./monitor-core.js";
import { MODEL_PARTS } from "./machine-catalog.js";
import { validateReplayDocument } from "./telemetry-replay.js";
import { buildAcceptanceReport } from "./acceptance-report.js";
import { readDemoInspections, publishDemoInspection } from "./inspection-bridge.js";

test("whole fab starts with 24 machines in six zones and repeatable signals", () => {
  const first = createPlant(), second = createPlant();
  assert.equal(EQUIPMENT.length, 24);
  assert.equal(ZONES.length, 6);
  assert.deepEqual(new Set(Object.keys(MODEL_PARTS)), new Set(EQUIPMENT.map((machine) => machine.type)));
  assert.deepEqual(first.machines, second.machines);
  assert.equal(plantSummary(first).alertCount, 0);
  assert.notEqual(advancePlant(first).machines[0].temp, first.machines[0].temp);
});

test("cooling fault propagates across zones, diagnosis and repair recover", () => {
  let state = injectIncident(createPlant(), "cooling");
  assert.equal(state.machines.find((machine) => machine.id === "CH-01").status, "alarm");
  assert.equal(state.machines.find((machine) => machine.id === "LTH-01").status, "running");
  assert.deepEqual(state.caseLog[0].firstSeen, { "CH-01": 0 });
  state = advancePlant(state);
  assert.equal(state.machines.find((machine) => machine.id === "LTH-01").dependency, "CH-01");
  assert.equal(state.machines.find((machine) => machine.id === "CVD-01").status, "running");
  assert.equal(state.caseLog[0].firstSeen["LTH-01"], 5);
  state = advancePlant(state);
  assert.equal(state.caseLog[0].firstSeen["CVD-01"], 10);
  assert.equal(state.caseLog[0].firstSeen["ETC-01"], 10);
  assert.throws(() => setMachineStopped(state, "CH-01", true));
  assert.throws(() => setMachineStopped(state, "LTH-01", true));
  assert.equal(zoneStatus(state, "litho"), "warning");
  state = advancePlant(state, 2);
  assert.equal(state.machines.find((machine) => machine.id === "CH-01").status, "down");
  state = diagnosePlant(state, "LTH-01");
  assert.equal(state.attempts, 1);
  assert.equal(state.incident.repairing, false);
  state = diagnosePlant(state, "CH-01");
  assert.equal(state.score, 65);
  assert.equal(state.machines.find((machine) => machine.id === "CH-01").status, "maintenance");
  assert.equal(state.machines.find((machine) => machine.id === "LTH-01").status, "warning");
  state = advancePlant(state, 2);
  assert.equal(state.incident, null);
  assert.equal(plantSummary(state).alertCount, 0);
  assert.equal(state.caseLog[0].repairedAt, 30);
  const report = buildAcceptanceReport(state, "2026-10-17T00:00:00.000Z");
  assert.equal(report.cases[0].firstSeen[0].machineId, "CH-01");
  assert.equal(report.cases[0].wrongAttempts, 1);
  assert.equal(report.cases[0].after.alerts, 0);
});

test("equipment can be paused, resumed and affects capacity", () => {
  let state = createPlant();
  const before = plantSummary(state).capacityWph;
  state = setMachineStopped(state, "LTH-01", true);
  assert.equal(state.machines.find((machine) => machine.id === "LTH-01").status, "idle");
  assert.ok(plantSummary(state).capacityWph < before);
  state = setMachineStopped(state, "LTH-01", false);
  assert.equal(state.machines.find((machine) => machine.id === "LTH-01").status, "running");
  assert.throws(() => advancePlant(state, 0));
});

test("other incidents affect their own equipment and cannot be stacked", () => {
  for (const [type, root] of [["vibration", "ETC-02"], ["illumination", "AOI-01"]]) {
    const state = injectIncident(createPlant(), type);
    assert.equal(state.machines.find((machine) => machine.id === root).status, "alarm");
    assert.equal(plantSummary(state).alertCount, 1);
    const fiveMinutes = advancePlant(state);
    assert.ok(plantSummary(fiveMinutes).alertCount >= 2);
    assert.throws(() => injectIncident(state, "cooling"));
  }
  assert.throws(() => injectIncident(setMachineStopped(createPlant(), "CH-01", true), "cooling"));
});

test("synthetic wafer result reaches AOI queue and can be held or released", () => {
  const storage = { values: new Map(), getItem(key) { return this.values.get(key) ?? null; },
    setItem(key, value) { this.values.set(key, value); }, removeItem(key) { this.values.delete(key); } };
  const report = publishDemoInspection({ kind: "particle", verdict: "review", defectCount: 2 }, storage);
  assert.equal(readDemoInspections(storage)[0].lotId, report.lotId);
  let state = receiveInspection(createPlant(), report);
  assert.equal(plantSummary(state).pendingReview, 1);
  assert.equal(state.machines.find((item) => item.id === "AOI-01").status, "warning");
  state = decideInspection(state, report.lotId, "held");
  assert.equal(plantSummary(state).heldLots, 1);
  state = decideInspection(state, report.lotId, "released");
  assert.equal(plantSummary(state).pendingReview, 0);
  assert.equal(state.machines.find((item) => item.id === "AOI-01").status, "running");
  assert.equal(receiveInspection(state, report), state);
});

test("validated JSON replay exposes missing and stale signal quality", () => {
  const input = JSON.parse(readFileSync(new URL("./demo_telemetry.json", import.meta.url), "utf8"));
  const document = validateReplayDocument(input);
  let state = startReplay(document);
  assert.equal(state.machines.find((item) => item.id === "CH-01").telemetry.temp.source, "SYNTHETIC_JSON_DEMO");
  state = advancePlant(state, 3);
  assert.equal(state.machines.find((item) => item.id === "LTH-01").telemetry.temp.quality, "missing");
  state = advancePlant(state, 3);
  assert.equal(state.machines.find((item) => item.id === "LTH-01").telemetry.power.quality, "stale");
  assert.equal(plantSummary(state).powerKw, null);
  assert.throws(() => injectIncident(state, "cooling"));
  assert.throws(() => validateReplayDocument({ ...input, source: "REAL_EQUIPMENT" }));
});
