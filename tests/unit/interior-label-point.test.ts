import assert from "node:assert/strict";
import test from "node:test";
import { interiorLabelPoint } from "../../app/indoor-project/interior-label-point";
import { roomLabelPoint } from "../../app/indoor-project/map-edits";
import { pointInNativeArea } from "../../app/indoor-project/native-area-review";
import type { IndoorDataset } from "../../app/indoor-project/contract";

type Point = [number, number];
const coffee: Point[] = [[102.5128,778.0694],[109.4223,773.7518],[111.5268,777.1197],[111.5226,777.1223],[111.7772,777.564],[111.8033,777.6092],[110.0859,778.7288],[111.4297,780.7901],[113.1421,779.6738],[113.5815,780.377],[113.512,780.4204],[115.3671,783.3892],[115.4367,783.3457],[115.4784,783.4125],[108.555,787.7388],[102.5128,778.0694]];
test("a stepped room label stays inside its enclosure after finite cap corners are recovered", () => {
  const mean: Point = [coffee.reduce((s,p)=>s+p[0],0)/coffee.length,coffee.reduce((s,p)=>s+p[1],0)/coffee.length];
  assert.equal(pointInNativeArea(mean,[coffee]),false);
  const point = interiorLabelPoint([coffee]);
  assert.ok(point); assert.equal(pointInNativeArea(point,[coffee]),true);
});
test("polygon labels are invariant under closing vertices, winding and edge subdivision", () => {
  const open = coffee.slice(0,-1), a = open[0], b = open[1];
  const midpoint: Point = [(a[0]+b[0])/2,(a[1]+b[1])/2];
  const variants = [coffee,open,[...open].reverse(),[a,midpoint,...open.slice(1)]];
  const first = interiorLabelPoint([coffee])!;
  for(const ring of variants){const p=interiorLabelPoint([ring])!;assert.ok(Math.hypot(p[0]-first[0],p[1]-first[1])<1e-10);}
});
test("a courtyard hole cannot receive the room identity", () => {
  const rings: Point[][] = [[[0,0],[10,0],[10,10],[0,10]],[[2,2],[8,2],[8,8],[2,8]]];
  const point = interiorLabelPoint(rings); assert.ok(point); assert.equal(pointInNativeArea(point,rings),true);
  assert.equal(pointInNativeArea([5,5],rings),false);
});
test("a concave room uses an interior point when its centroid is outside", () => {
  const rings: Point[][] = [[[0,0],[1,0],[1,9],[9,9],[9,0],[10,0],[10,10],[0,10]]];
  const point = interiorLabelPoint(rings); assert.ok(point); assert.equal(pointInNativeArea(point,rings),true);
});
test("the label correction preserves a real arrival anchor and original room bytes", () => {
  const data = {records:[{key:'room',arrivalNodeId:'arrival',ringsFeet:[coffee]}],nodes:[{id:'arrival',pointFeet:[107,780,14]}]} as IndoorDataset;
  const before=JSON.stringify(data);assert.deepEqual(roomLabelPoint(data,'room'),[107,780]);assert.equal(JSON.stringify(data),before);
  delete data.records[0].arrivalNodeId;
  assert.equal(pointInNativeArea(roomLabelPoint(data,'room'),[coffee]),true);
});
