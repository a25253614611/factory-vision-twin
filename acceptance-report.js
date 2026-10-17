import { INCIDENTS, EQUIPMENT, plantClock, plantSummary } from "./monitor-core.js";

export function buildAcceptanceReport(state, generatedAt = new Date().toISOString()) {
  const summary = plantSummary(state);
  return {
    schemaVersion: 1,
    title: "FlowTwin 合成工廠驗收報告",
    generatedAt,
    dataNotice: "所有設備、批次、訊號與處置均為教學用合成資料；未連線或控制真實機台。",
    source: state.replay?.source ?? "BROWSER_SIMULATION",
    simulatedAt: plantClock(state.minute),
    summary: { running: summary.running, alerts: summary.alertCount, pendingReview: summary.pendingReview,
      heldLots: summary.heldLots, capacityWph: summary.capacityWph, powerKw: summary.powerKw, dataGap: summary.dataGap },
    cases: state.caseLog.map((entry) => ({
      scenario: INCIDENTS[entry.type].name, rootMachine: entry.root,
      injectedAt: plantClock(entry.started),
      firstSeen: Object.entries(entry.firstSeen).map(([machineId, minute]) => ({ machineId, at: plantClock(minute),
        delayMinutes: minute - entry.started })).sort((a, b) => a.delayMinutes - b.delayMinutes || a.machineId.localeCompare(b.machineId)),
      wrongAttempts: entry.attempts,
      diagnosis: entry.diagnosis && { machineId: entry.diagnosis.machineId,
        at: plantClock(entry.diagnosis.minute), score: entry.diagnosis.score },
      repairedAt: entry.repairedAt === null ? null : plantClock(entry.repairedAt),
      before: { alerts: entry.baseline.alertCount, capacityWph: entry.baseline.capacityWph },
      after: entry.recovered && { alerts: entry.recovered.alertCount, capacityWph: entry.recovered.capacityWph }
    })),
    aoiLots: state.inspections.map((item) => ({ lotId: item.lotId, machineId: item.machineId,
      syntheticDefectKind: item.kind, defectCount: item.defectCount, verdict: item.verdict,
      decision: item.decision, receivedAt: plantClock(item.receivedAt),
      decidedAt: item.decidedAt === null ? null : plantClock(item.decidedAt) })),
    telemetryQuality: state.machines.filter((item) => Object.values(item.telemetry || {}).some((value) => value.quality !== "good"))
      .map((item) => ({ machineId: item.id, signals: item.telemetry })),
    events: state.events.map((item) => ({ at: plantClock(item.minute), severity: item.severity, text: item.text })),
    equipmentCount: EQUIPMENT.length
  };
}
