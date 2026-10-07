import test from 'node:test';
import assert from 'node:assert/strict';
import {createPolygonFeature, pointInsidePolygon} from '../../scripts/dwg-import/lib/geometry.mjs';

test('CAD room export excludes a retained interior opening',()=>{
  const exterior=[[0,0],[10,0],[10,10],[0,10]];
  const hole=[[3,3],[7,3],[7,7],[3,7]];
  const room=createPolygonFeature('room',exterior,{},[hole]);
  assert.equal(pointInsidePolygon([1,1],room),true);
  assert.equal(pointInsidePolygon([5,5],room),false);
  assert.deepEqual(hole,[[3,3],[7,3],[7,7],[3,7]]);
});
