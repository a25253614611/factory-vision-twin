import test from "node:test";
import assert from "node:assert/strict";
import { createShift, startShift, advanceShift, currentStationIndex, shiftOutcome } from "./shift-core.js";

test("quality shift runs from carrier through handoff", () => {
  let state = startShift(createShift());
  assert.equal(currentStationIndex(state), 0);
  state = advanceShift(state, "scan");
  state = advanceShift(state, "check");
  state = advanceShift(state, "inspect", { verdict: "review", regions: 1, anomalyPercent: .21, boxes: [{ x: 1, y: 2, w: 3, h: 4 }] });
  state = advanceShift(state, "decide", { choice: "hold" });
  state = advanceShift(state, "report");
  assert.equal(state.phase, "done");
  assert.equal(state.minutes, 17);
  assert.equal(state.score, 100);
  assert.equal(shiftOutcome(state).safe, true);
});

test("releasing a suspected defect records the risk", () => {
  let state = startShift(createShift());
  state = advanceShift(advanceShift(state, "scan"), "check");
  state = advanceShift(state, "inspect", { verdict: "review", regions: 1 });
  state = advanceShift(state, "decide", { choice: "release" });
  state = advanceShift(state, "report");
  assert.equal(state.score, 55);
  assert.equal(shiftOutcome(state).safe, false);
});

test("normal image can be released and actions cannot skip stations", () => {
  let state = startShift(createShift("clear"));
  assert.throws(() => advanceShift(state, "inspect", { verdict: "clear", regions: 0 }));
  state = advanceShift(advanceShift(state, "scan"), "check");
  state = advanceShift(state, "inspect", { verdict: "clear", regions: 0 });
  state = advanceShift(state, "decide", { choice: "release" });
  state = advanceShift(state, "report");
  assert.equal(shiftOutcome(state).safe, true);
});
