// Only synthetic demo metadata crosses pages. Image pixels and user uploads stay in the inspection tab.
export const INSPECTION_BRIDGE_KEY = "flowtwin-synthetic-aoi-v1";

export function readDemoInspections(storage = globalThis.localStorage) {
  try {
    const rows = JSON.parse(storage.getItem(INSPECTION_BRIDGE_KEY) || "[]");
    return Array.isArray(rows) ? rows.filter((item) =>
      /^SIM-[A-Z0-9-]{1,30}$/.test(item?.lotId) && ["review", "clear"].includes(item?.verdict) &&
      Number.isInteger(item?.defectCount) && ["particle", "scratch", "clear"].includes(item?.kind)).slice(-30) : [];
  } catch { return []; }
}

export function publishDemoInspection(input, storage = globalThis.localStorage) {
  if (!["particle", "scratch", "clear"].includes(input?.kind) ||
      !["review", "clear"].includes(input?.verdict) || !Number.isInteger(input?.defectCount))
    throw new Error("僅能同步合成晶圓示範結果");
  const report = { lotId: `SIM-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 65536).toString(16).toUpperCase()}`,
    kind: input.kind, verdict: input.verdict, defectCount: input.defectCount,
    checkedAt: new Date().toISOString(), source: "SYNTHETIC_WAFER_DEMO" };
  const rows = [...readDemoInspections(storage), report].slice(-30);
  storage.setItem(INSPECTION_BRIDGE_KEY, JSON.stringify(rows));
  return report;
}

export function clearDemoInspections(storage = globalThis.localStorage) {
  try { storage.removeItem(INSPECTION_BRIDGE_KEY); } catch { /* Storage can be unavailable in private mode. */ }
}
