"""CAD review guard regressions; run with the isolated DWG Python environment."""
import importlib.util
import math
from pathlib import Path
import sys
import unittest
import ezdxf

HELPERS = Path(__file__).resolve().parents[2] / 'scripts/dwg-import'
sys.path.insert(0, str(HELPERS))
from registration import recover_registration, transform

spec = importlib.util.spec_from_file_location('viewports', HELPERS/'extract-layout-windows.py')
viewports = importlib.util.module_from_spec(spec)
spec.loader.exec_module(viewports)


class ReviewGuards(unittest.TestCase):
    def viewport(self, status=0, scale=100):
        doc = ezdxf.new()
        viewport = doc.layouts.new('Floor').add_viewport(center=(5,5), size=(10,20),
            view_center_point=(1000,2000), view_height=20*scale, status=status)
        if status == 0:
            viewport.dxf.id = 0
        return viewport

    def test_status_loss_requires_explicit_opt_in(self):
        vp=self.viewport()
        self.assertIsNone(viewports.viewport_window(vp))
        window=viewports.viewport_window(vp, True)
        self.assertTrue(window['statusInferred'])
        self.assertEqual(window['modelCenter'],[1000,2000])

    def test_paper_viewport_is_not_a_floor(self):
        self.assertIsNone(viewports.viewport_window(self.viewport(scale=1), True))

    def test_real_viewport_uses_target_and_preserves_provenance(self):
        vp=self.viewport(status=2)
        vp.dxf.view_target_point=(500,-100,0)
        window=viewports.viewport_window(vp)
        self.assertEqual(window['modelCenter'],[1500,1900])
        self.assertFalse(window['statusInferred'])
        self.assertEqual(window['viewportHandle'],vp.dxf.handle)

    def test_perspective_cannot_be_accepted_as_plan(self):
        vp=self.viewport(status=2)
        vp.dxf.flags=1
        self.assertIsNone(viewports.viewport_window(vp, True))

    def rooms(self):
        return [dict(levelId=311,labelPointFeet=[p[0]*.003+7,p[1]*.003-2],
                     dwg=dict(sha256='a'*64,anchorDwg=list(p)))
                for p in [(0,0),(1000,0),(0,1000),(1000,1000)]]

    def test_exact_saved_registration_roundtrip(self):
        fit=recover_registration(self.rooms(),'a'*64)
        self.assertLess(fit['maxErrorFeet'],1e-10)
        p=[123,456]
        self.assertLess(math.dist(p,transform(transform(p,fit),fit,inverse=True)),1e-8)

    def test_wrong_drawing_and_mixed_native_floor_rejected(self):
        rooms=self.rooms()
        self.assertIsNone(recover_registration(rooms,'b'*64))
        rooms[0]['levelId']=694
        self.assertIsNone(recover_registration(rooms,'a'*64))

    def test_degenerate_anchors_and_inconsistent_registration_rejected(self):
        rooms=self.rooms()
        for r in rooms:r['dwg']['anchorDwg']=[0,0]
        self.assertIsNone(recover_registration(rooms,'a'*64))
        rooms=self.rooms();rooms[0]['labelPointFeet']=[10000,-10000]
        self.assertIsNone(recover_registration(rooms,'a'*64))


if __name__=='__main__': unittest.main()
