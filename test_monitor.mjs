import test from "node:test";
import assert from "node:assert/strict";
import { createPlant, advancePlant, injectIncident, diagnosePlant, setMachineStopped,
  plantSummary, zoneStatus, EQUIPMENT, ZONES } from "./monitor-core.js";
import { MODEL_PARTS } from "./machine-catalog.js";

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
  assert.equal(state.machines.find((machine) => machine.id === "LTH-01").dependency, "CH-01");
  assert.throws(() => setMachineStopped(state, "CH-01", true));
  assert.throws(() => setMachineStopped(state, "LTH-01", true));
  assert.equal(zoneStatus(state, "litho"), "warning");
  state = advancePlant(state, 4);
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
    assert.ok(plantSummary(state).alertCount >= 2);
    assert.throws(() => injectIncident(state, "cooling"));
  }
  assert.throws(() => injectIncident(setMachineStopped(createPlant(), "CH-01", true), "cooling"));
});
