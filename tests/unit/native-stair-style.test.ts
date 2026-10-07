import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStyleMin, createPropertyExpression, latest } from '@maplibre/maplibre-gl-style-spec';
import { nativeStairZoomStyle } from '../../app/indoor-project/native-stair-style';

test('native stair color and opacity pass actual MapLibre camera-expression validation', () => {
  for (const review of [false,true]) {
    const color=nativeStairZoomStyle([311],['get','color'],'#d6d7d7','#ffe09d',review);
    const opacity=nativeStairZoomStyle([311],.92,0,.92,review);
    assert.deepEqual(validateStyleMin({version:8,sources:{stairs:{type:'geojson',data:{type:'FeatureCollection',features:[]}}},layers:[{id:'stairs',type:'fill',source:'stairs',paint:{'fill-color':color,'fill-opacity':opacity}},{id:'boxes',type:'fill-extrusion',source:'stairs',paint:{'fill-extrusion-color':color}}]}),[]);
  }
});

test('native treads stay visible through overview zoom while ordinary stairs keep their fade', () => {
  const parsed=createPropertyExpression(nativeStairZoomStyle([311],.92,0,.92,false),latest.paint_fill['fill-opacity']);
  assert.equal(parsed.result,'success'); if(parsed.result!=='success')return;
  for(const zoom of [12,17.5,18,18.5,22]) {
    const feature={type:3 as const,properties:{levelId:311}};
    assert.equal(parsed.value.evaluate({zoom},feature),.92);
  }
  assert.equal(parsed.value.evaluate({zoom:12},{type:3,properties:{levelId:694}}),0);
  assert.equal(parsed.value.evaluate({zoom:22},{type:3,properties:{levelId:694}}),.92);
});

test('the former case wrapped around a zoom interpolation is rejected by MapLibre', () => {
  const invalid=['case',['==',['get','levelId'],311],.92,['interpolate',['linear'],['zoom'],17.5,0,18.5,.92]];
  assert.equal(createPropertyExpression(invalid,latest.paint_fill['fill-opacity']).result,'error');
});
