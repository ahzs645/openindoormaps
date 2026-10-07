"""Run with the same task-local Shapely environment as the read-only scanner."""
import importlib.util
from pathlib import Path
import unittest
from shapely.geometry import box
from shapely.affinity import rotate

script = Path(__file__).resolve().parents[2] / 'scripts/indoor/audit-curtain-fallbacks.py'
spec = importlib.util.spec_from_file_location('curtain_fallback_audit', script)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class CurtainFallbackEvidence(unittest.TestCase):
    def test_requires_actual_approximate_export_matching_host_bounds(self):
        native = {'boundsFeet': {'min': {'x': 0, 'y': 0}, 'max': {'x': 10, 'y': 6}}}
        wall = {'approximate': True, 'ringsFeet': [[[0, 0], [10, 0], [10, 6], [0, 6]]]}
        self.assertTrue(audit.is_native_bounds_rectangle(wall, native))
        self.assertFalse(audit.is_native_bounds_rectangle({**wall, 'approximate': False}, native))
        self.assertFalse(audit.is_native_bounds_rectangle({**wall, 'ringsFeet': [[[0, 0], [10, 0], [9, 6], [0, 6]]]}, native))

    def test_does_not_treat_member_aabb_as_precise_native_geometry(self):
        g, source = audit.precise_member_geometry({'boundsFeet': {'min': {'x': 0, 'y': 0}, 'max': {'x': 10, 'y': 6}}})
        self.assertIsNone(g)
        self.assertIsNone(source)

    def test_diagonal_native_window_is_distinct_from_aligned_frame_thickness(self):
        thin = box(0, 0, 10, .2)
        diagonal = rotate(thin, 30)
        corners = list(diagonal.exterior.coords)[:4]
        member = {'orientedBox': [[x, y, z] for z in [0, 8] for x, y in corners]}
        g, source = audit.precise_member_geometry(member)
        self.assertEqual(source, 'persisted-oriented-box')
        self.assertAlmostEqual(g.area, 2)
        mnx, mny, mxx, mxy = g.bounds
        dimensions = [mxx - mnx, mxy - mny]
        self.assertEqual(audit.geometry_classification(audit.oriented_measurement(g), dimensions, dimensions[0] * dimensions[1]), 'broad-skewed-host-AABB-candidate')
        self.assertEqual(audit.geometry_classification(audit.oriented_measurement(thin), [10, 1.5], 15), 'aligned-host-thickness-versus-member-width')

    def test_bent_or_broad_members_do_not_receive_thin_diagonal_classification(self):
        geometry = box(0, 0, 5, 5)
        self.assertEqual(audit.geometry_classification(audit.oriented_measurement(geometry), [5, 5], 25), 'mixed-or-bent-member-assembly-bounds-candidate')


if __name__ == '__main__':
    unittest.main()
