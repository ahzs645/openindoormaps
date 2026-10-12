/** Camera state carried across a map recreation (see useMapRecreate). */
export type MapCameraSnapshot = {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
};
/** Camera state carried across a map recreation. */
export function mapCameraSnapshot(map: {
  getCenter(): { lng: number; lat: number };
  getZoom(): number;
  getBearing(): number;
  getPitch(): number;
}): MapCameraSnapshot {
  const center = map.getCenter();
  return {
    center: [center.lng, center.lat],
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
}
