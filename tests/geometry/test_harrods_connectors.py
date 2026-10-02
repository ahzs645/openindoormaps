"""Escalator pairing regressions, independent of the real venue's layout."""
import importlib.util
import sys
import unittest
from pathlib import Path
from shapely.geometry import box

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("harrods", ROOT / "scripts/port-pointr-harrods.py")
harrods = importlib.util.module_from_spec(spec)
spec.loader.exec_module(harrods)


class EscalatorPairingTest(unittest.TestCase):
    def items(self, levels):
        return [{"building": "harrods", "lvl": level, "fid": str(i)}
                for i, level in enumerate(levels)]

    def test_parallel_lanes_remain_separate(self):
        footprints = [box(0, 0, 1, 5), box(1.2, 0, 2.2, 5)] * 2
        self.assertEqual(harrods.match_escalator_lanes(
            self.items([0, 0, 1, 1]), footprints, []), [(0, 2), (1, 3)])

    def test_missing_floor_is_not_bridged(self):
        self.assertEqual(harrods.match_escalator_lanes(
            self.items([0, 2]), [box(0, 0, 1, 5)] * 2, []), [])

    def test_observed_pair_beats_geometric_overlap(self):
        mx, my = harrods.meters_per_degree(51.5)
        coordinate = lambda x, y: [x / mx - .164, y / my + 51.499]
        references = [{"transitions": [{"type": "escalator",
            "from_level": 0, "to_level": 1,
            "from_coordinate": coordinate(.5, 2),
            "to_coordinate": coordinate(1.7, 2)}]}]
        footprints = [box(0, 0, 1, 5), box(1.2, 0, 2.2, 5)] * 2
        self.assertEqual(harrods.match_escalator_lanes(
            self.items([0, 0, 1, 1]), footprints, references), [(0, 3), (1, 2)])

    def test_unmatched_lane_is_not_reused(self):
        pairs = harrods.match_escalator_lanes(self.items([0, 0, 1]),
            [box(0, 0, 1, 5), box(1.2, 0, 2.2, 5), box(0, 0, 1, 5)], [])
        self.assertEqual(pairs, [(0, 2)])


if __name__ == "__main__":
    unittest.main()
