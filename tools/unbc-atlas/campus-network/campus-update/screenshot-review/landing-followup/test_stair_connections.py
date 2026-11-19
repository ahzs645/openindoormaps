"""Regression checks for directional field evidence and rebuilds from changed native geometry."""
import json
import csv
import sys
import tempfile
import unittest
from pathlib import Path
from copy import deepcopy
sys.path.insert(0,str(Path(__file__).resolve().parents[3]))
from stair_connections import stair_report, add_approach_examples, write_report

class StairRebuild(unittest.TestCase):
    def setUp(self):
        ends = [dict(node=k, room=k, b="A",logical=i,l=i, **{"in":1,"out":1}) for i,k in enumerate(("A","B"))]
        self.transfer = dict(type="Stair",native=15,key="flight",ends=ends,pairs=[["A","B"]],status="Public",b=["A"],reason="")
        runs = [{"runElementId":55,"bottomElevationFeet":0,"topElevationFeet":10}]
        self.data = dict(source={"modelSha256":"source"},nativeLevels=[dict(id=0,elevationFeet=0),dict(id=1,elevationFeet=10)],
                         stairDisplay={"sourceFlights":[dict(stairElementId=15,runs=runs)]},
                         rooms=[],records=[],nodes=[dict(id=k,roomKey=k) for k in ("A","B")],edges=[],doors=[])
        self.observation = dict(modelSha256="source",nativeStair=15,nativeRuns=[55],description="walked up",
                                **{"from":{"building":"A","room":"A","level":0},"to":{"building":"A","room":"B","level":1}})
        self.arc = {"f":json.dumps(["A"]),"t":json.dumps(["B"])}
    def report(self):
        return stair_report(self.data, {"flight":self.transfer}, {"flight":[self.arc]},
                            {"runtimeSha256":"test","datasetSha256":"test"}, [self.observation],{})
    def test_directionality(self):
        a,b=self.report()["stairs"][0]["directions"]
        self.assertEqual((a["fieldNotes"],b["fieldNotes"]),(["walked up"],[]))
        self.assertEqual((a["connectedToRooms"],b["connectedToRooms"]),(True,False))
        self.transfer["ends"][0]["in"]=0
        self.assertFalse(self.report()["stairs"][0]["directions"][0]["connectedToRooms"])
    def test_changed_model_run_or_floor(self):
        for target, key, value in ((self.data["source"],"modelSha256","replacement"),(self.observation,"nativeRuns",[99]),
                                   (self.observation["to"],"level",2)):
            old=target[key]; target[key]=value
            self.assertEqual(self.report()["unappliedObservations"],[self.observation])
            target[key]=old
    def test_new_native_flight_without_observation(self):
        source = deepcopy(self.data["stairDisplay"]["sourceFlights"][0])
        source["stairElementId"]=16
        self.data["stairDisplay"]["sourceFlights"].append(source)
        drawing=dict(type="Stair",native=16,key="drawing-16",ends=[],pairs=[],status="Drawing only",b=["A"],reason="")
        report=stair_report(self.data,{"flight":self.transfer,"new":drawing},{},
                            {"runtimeSha256":"test","datasetSha256":"test"},[self.observation],{})
        self.assertEqual(report["nativeStairs"],2)
        self.assertEqual(next(r for r in report["stairs"] if r["nativeStair"]==16)["directions"],[])
        self.assertFalse(next(r for r in report["stairs"] if r["nativeStair"]==15)["directions"][0]["graphAllowsFlight"])
    def test_approach_example_follows_admitted_flat_arcs(self):
        report=self.report()
        def arc(dst,kind,z=0):
            return dict(f='start',t=json.dumps([dst]),p=[[0,0,0],[2,0,z]],e='source-'+dst,k=kind)
        arcs=[arc("A","walk"),arc("B","stairs",10),arc("B","walk",10)]
        add_approach_examples(report,{"flight":self.transfer},arcs,{"key":{"number":"123"}},{"key":{}},
                              {"key":{"departVertex":"start"}})
        examples=self.transfer["stairCheck"]["examples"]
        self.assertEqual([(e["room"],e["landing"],e["graphMetres"]) for e in examples],[("123","A",0.61)])
    def test_level_height_must_match(self):
        self.data["nativeLevels"][1]["elevationFeet"] += .02
        self.assertEqual(self.report()["stairs"][0]["terminals"][-1]["levels"],[])
    def test_csv_distinguishes_a_walk_to_the_foot_from_a_walk_up_the_flight(self):
        self.transfer["key"] = "closed"
        report = self.report()
        report["stairs"][0]["approaches"][0]["directoryExample"] = dict(room="123",target="stair foot",graphMetres=7.5)
        with tempfile.TemporaryDirectory() as directory:
            write_report(Path(directory), report, {0:"Lower",1:"Upper"})
            with (Path(directory)/"stair-connections.csv").open() as stream:
                lower, upper = csv.DictReader(stream)
        self.assertEqual(lower["flight_in_public_graph"], "False")
        self.assertEqual(lower["same_floor_example_origin"], "123")
        self.assertEqual(lower["same_floor_example_target_at_start"], "stair foot")
        self.assertEqual(lower["same_floor_example_metres"], "7.5")
        self.assertEqual(upper["same_floor_example_target_at_start"], "")
if __name__=="__main__":
    unittest.main()
