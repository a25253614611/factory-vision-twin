"""Reproducible, synthetic two-camera WIP tracking experiment.

No camera, detector, model service, or factory system is connected. Ground truth
is stored only to evaluate associations; match_observations never reads it.
"""

from __future__ import annotations

import argparse
import json
import math
import random
from pathlib import Path


SCENARIOS = ("normal", "lighting", "occlusion", "combined")
MODES = ("baseline", "adaptive")
ITEM_COUNT = 12
VECTOR_SIZE = 8


def norm(values):
    length = math.sqrt(sum(value * value for value in values))
    return [value / length for value in values]


def cosine(left, right):
    return sum(a * b for a, b in zip(left, right)) / (
        math.sqrt(sum(a * a for a in left)) * math.sqrt(sum(b * b for b in right))
    )


def distance(left, right):
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(left, right)))


def make_observations(scenario, seed=71):
    """Make synthetic camera events with known identities for offline scoring."""
    if scenario not in SCENARIOS:
        raise ValueError("unknown scenario: " + scenario)
    rng = random.Random(seed)
    lighting = scenario in ("lighting", "combined")
    occlusion = scenario in ("occlusion", "combined")
    camera_a, camera_b, items = [], [], []
    for index in range(ITEM_COUNT):
        item_id = "WIP-%02d" % (index + 1)
        vector = norm([rng.uniform(-1, 1) for _ in range(VECTOR_SIZE)])
        start = 4.0 + index * 3.0
        arrival = start + 8.0 + (index % 3 - 1) * 0.35
        items.append({"id": item_id, "start": start, "arrival": arrival,
                      "lane": index % 3, "color": ("#67e8f9", "#a78bfa", "#fbbf24")[index % 3]})
        camera_a.append({"camera": "A", "local_id": "A-%02d" % (index + 1),
                         "global_id": item_id, "time": start, "confidence": 0.95,
                         "embedding": [round(value + rng.uniform(-0.003, 0.003), 6) for value in vector],
                         "truth_id": item_id, "is_false_positive": False})
        if occlusion and index in (3, 8):
            continue
        scale = 0.55 if lighting else 1.0
        confidence = 0.59 if lighting and index == 5 else (0.78 if lighting else 0.91)
        camera_b.append({"camera": "B", "local_id": "B-%02d" % (index + 21),
                         "time": arrival, "confidence": confidence,
                         "embedding": [round(scale * value + rng.uniform(-0.003, 0.003), 6) for value in vector],
                         "truth_id": item_id, "is_false_positive": False})
    for index, moment in enumerate((18.2, 33.2)):
        camera_b.append({"camera": "B", "local_id": "B-FP%d" % (index + 1),
                         "time": moment, "confidence": 0.43,
                         "embedding": norm([rng.uniform(-1, 1) for _ in range(VECTOR_SIZE)]),
                         "truth_id": None, "is_false_positive": True})
    camera_b.sort(key=lambda observation: observation["time"])
    return {"items": items, "camera_a": camera_a, "camera_b": camera_b}


def match_observations(camera_a, camera_b, mode):
    """Associate local tracks using only timestamps, confidence and embeddings."""
    if mode not in MODES:
        raise ValueError("unknown mode: " + mode)
    threshold = 0.30 if mode == "baseline" else 0.65
    candidates = []
    for first in camera_a:
        for second in camera_b:
            if second["confidence"] < threshold:
                continue
            travel = second["time"] - first["time"]
            if not 6.0 <= travel <= 10.0:
                continue
            if mode == "baseline":
                score = distance(first["embedding"], second["embedding"])
                if score <= 0.18:
                    candidates.append((-score, first, second))
            else:
                score = cosine(first["embedding"], second["embedding"])
                if score >= 0.985:
                    candidates.append((score, first, second))
    candidates.sort(key=lambda row: row[0], reverse=True)
    used_a, used_b, matches = set(), set(), []
    for score, first, second in candidates:
        if first["local_id"] in used_a or second["local_id"] in used_b:
            continue
        used_a.add(first["local_id"])
        used_b.add(second["local_id"])
        matches.append({"camera_a": first["local_id"], "camera_b": second["local_id"],
                        "global_id": first["global_id"], "score": round(-score if mode == "baseline" else score, 3)})
    return sorted(matches, key=lambda row: row["global_id"])


def p95(values):
    ordered = sorted(values)
    return ordered[math.ceil(0.95 * len(ordered)) - 1]


def evaluate(observations, matches, mode):
    """Use held-out synthetic truth after matching, never during matching."""
    first_by_id = {row["local_id"]: row for row in observations["camera_a"]}
    second_by_id = {row["local_id"]: row for row in observations["camera_b"]}
    correct = sum(first_by_id[row["camera_a"]]["truth_id"] ==
                  second_by_id[row["camera_b"]]["truth_id"] for row in matches)
    wrong = len(matches) - correct
    confidence_cutoff = 0.30 if mode == "baseline" else 0.65
    false_queue = sum(row["is_false_positive"] and row["confidence"] >= confidence_cutoff
                      for row in observations["camera_b"])
    # Deliberately simple scenario assumptions, not benchmark measurements.
    latency_samples = [((35 if mode == "baseline" else 48) + (index * 7) % 17)
                       for index in range(ITEM_COUNT)]
    return {"correct": correct, "wrong_links": wrong,
            "traceability_percent": round(100 * correct / ITEM_COUNT, 1),
            "false_queue": false_queue,
            "manual_checks": ITEM_COUNT - correct + false_queue,
            "p95_latency_ms": p95(latency_samples)}


def build_demo(seed=71):
    result = {"metadata": {"title": "FlowTwin | 跨鏡頭在製品追蹤", "seed": seed,
                           "source": "合成事件；不含真實相機推論或工廠資料",
                           "item_count": ITEM_COUNT,
                           "latency_note": "延遲為情境假設值，非硬體量測"}, "scenarios": {}}
    for scenario in SCENARIOS:
        observations = make_observations(scenario, seed)
        modes = {}
        for mode in MODES:
            matches = match_observations(observations["camera_a"], observations["camera_b"], mode)
            modes[mode] = {"matches": matches, "metrics": evaluate(observations, matches, mode)}
        result["scenarios"][scenario] = {"observations": observations, "modes": modes}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("demo_data.json"))
    parser.add_argument("--seed", type=int, default=71)
    args = parser.parse_args()
    demo = build_demo(args.seed)
    args.output.write_text(json.dumps(demo, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Generated %s (seed=%d, %d workpieces, %d scenarios)" %
          (args.output, args.seed, ITEM_COUNT, len(SCENARIOS)))


if __name__ == "__main__":
    main()
