import test from "node:test";
import assert from "node:assert/strict";
import { advanceEnterprise, createEnterpriseState, enterpriseMetrics, resolveEnterpriseIncident, STAGES } from "./enterprise-core.js";

function runUntil(state, predicate, limit = 60) {
  for (let i = 0; i < limit && !predicate(state); i++) state = advanceEnterprise(state);
  return state;
}

test("normal orders move through the whole company and deliver", () => {
  const initial = createEnterpriseState();
  const done = runUntil(initial, (state) => enterpriseMetrics(state).delivered === 4);
  assert.equal(initial.hour, 0);
  assert.equal(enterpriseMetrics(done).delivered, 4);
  assert.ok(done.lots.every((lot) => lot.stage === STAGES.length));
});

test("particle hold requires review and sends lot back for rework", () => {
  const held = runUntil(createEnterpriseState("particle"), (state) => state.incident?.kind === "particle");
  assert.equal(held.lots[0].held, true);
  assert.equal(advanceEnterprise(held).lots[0].stage, 4);
  const reviewed = resolveEnterpriseIncident(held);
  assert.equal(reviewed.lots[0].stage, 3);
  assert.equal(reviewed.lots[0].held, false);
  assert.equal(enterpriseMetrics(runUntil(reviewed, (state) => enterpriseMetrics(state).delivered === 4)).delivered, 4);
});

test("tool outage pauses and maintenance resumes production", () => {
  const held = runUntil(createEnterpriseState("tool"), (state) => state.incident?.kind === "tool");
  assert.equal(held.hour, 3);
  assert.equal(held.lots[0].held, true);
  const recovered = resolveEnterpriseIncident(held);
  assert.equal(recovered.lots[0].held, false);
  assert.equal(recovered.incident, null);
});

test("urgent order uses a shorter fictional due time", () => {
  const urgent = createEnterpriseState("urgent");
  assert.equal(urgent.lots[0].due, 11);
  assert.equal(createEnterpriseState().lots[0].due, 16);
});
