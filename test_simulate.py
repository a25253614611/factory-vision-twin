import copy
import unittest

import simulate


class SimulationTests(unittest.TestCase):
    def test_reproducible(self):
        self.assertEqual(simulate.build_demo(), simulate.build_demo())

    def test_lighting_tradeoff(self):
        modes = simulate.build_demo()["scenarios"]["lighting"]["modes"]
        self.assertGreater(modes["adaptive"]["metrics"]["correct"], modes["baseline"]["metrics"]["correct"])
        self.assertEqual(modes["adaptive"]["metrics"]["correct"], 11)
        self.assertGreater(modes["adaptive"]["metrics"]["p95_latency_ms"], modes["baseline"]["metrics"]["p95_latency_ms"])

    def test_missing_camera_events_are_not_fabricated(self):
        state = simulate.build_demo()["scenarios"]["occlusion"]
        self.assertEqual(len([row for row in state["observations"]["camera_b"] if not row["is_false_positive"]]), 10)
        self.assertLessEqual(state["modes"]["adaptive"]["metrics"]["correct"], 10)

    def test_low_confidence_noise_is_filtered(self):
        modes = simulate.build_demo()["scenarios"]["normal"]["modes"]
        self.assertEqual(modes["baseline"]["metrics"]["false_queue"], 2)
        self.assertEqual(modes["adaptive"]["metrics"]["false_queue"], 0)

    def test_matcher_never_uses_ground_truth(self):
        state = simulate.make_observations("normal")
        expected = simulate.match_observations(state["camera_a"], state["camera_b"], "adaptive")
        redacted = copy.deepcopy(state)
        for row in redacted["camera_a"] + redacted["camera_b"]:
            row.pop("truth_id", None)
            row.pop("is_false_positive", None)
        self.assertEqual(expected, simulate.match_observations(redacted["camera_a"], redacted["camera_b"], "adaptive"))

    def test_time_window_and_one_to_one_constraint(self):
        state = simulate.make_observations("normal")
        delayed = copy.deepcopy(state["camera_b"])
        delayed[0]["time"] += 30
        matches = simulate.match_observations(state["camera_a"], delayed, "adaptive")
        self.assertFalse(any(row["camera_b"] == delayed[0]["local_id"] for row in matches))
        self.assertEqual(len({row["camera_a"] for row in matches}), len(matches))
        self.assertEqual(len({row["camera_b"] for row in matches}), len(matches))


if __name__ == "__main__":
    unittest.main()
