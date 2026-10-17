import { EQUIPMENT, SIGNAL_UNITS } from "./monitor-core.js";

export { SIGNAL_UNITS };
const statuses = new Set(["running", "warning", "alarm", "down", "maintenance", "idle"]);

/** Strictly validate a local, synthetic demonstration file before it enters the simulator. */
export function validateReplayDocument(input) {
  if (!input || input.schemaVersion !== 1 || typeof input.source !== "string" ||
      !/^SYNTHETIC_[A-Z0-9_]{1,40}$/.test(input.source) ||
      !Array.isArray(input.records) || input.records.length < 1 || input.records.length > 300)
    throw new Error("回放檔需包含 schemaVersion=1、SYNTHETIC_ 來源與 1–300 筆紀錄");
  const known = new Map(EQUIPMENT.map((item) => [item.id, item]));
  const seen = new Set();
  const records = input.records.map((record) => {
    const spec = known.get(record?.equipmentId);
    if (!spec || !Number.isInteger(record.minute) || record.minute < 0 || record.minute > 360 || record.minute % 5 ||
        !statuses.has(record.status) || !record.signals || typeof record.signals !== "object")
      throw new Error("回放紀錄的機台、模擬分鐘、狀態或訊號格式錯誤");
    const key = `${record.equipmentId}:${record.minute}`;
    if (seen.has(key)) throw new Error("同一機台與時間不可有重複紀錄");
    seen.add(key);
    const required = ["temp", "vibration", "power", "throughput", ...(spec.type === "aoi" ? ["lux"] : [])];
    if (Object.keys(record.signals).some((metric) => !required.includes(metric)) ||
        required.some((metric) => !record.signals[metric])) throw new Error("回放訊號欄位不完整");
    const signals = {};
    for (const metric of required) {
      const signal = record.signals[metric];
      if (signal.unit !== SIGNAL_UNITS[metric] || !["good", "missing"].includes(signal.quality) ||
          (signal.quality === "good" && (!Number.isFinite(signal.value) || signal.value < 0)) ||
          (signal.quality === "missing" && signal.value !== null))
        throw new Error(`${record.equipmentId} 的 ${metric} 單位、品質或數值錯誤`);
      signals[metric] = { value: signal.value, unit: signal.unit, quality: signal.quality };
    }
    return { minute: record.minute, equipmentId: record.equipmentId, status: record.status, signals };
  }).sort((a, b) => a.minute - b.minute || a.equipmentId.localeCompare(b.equipmentId));
  return { schemaVersion: 1, source: input.source, records,
    endMinute: Math.min(360, Math.max(...records.map((item) => item.minute)) + 15) };
}
