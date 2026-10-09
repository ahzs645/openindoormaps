declare module "jsts/org/locationtech/jts/io/GeoJSONReader.js" {
  export default class GeoJSONReader {
    constructor(
      factory?: import("jsts/org/locationtech/jts/geom/GeometryFactory.js").default,
    );
    read(json: unknown): unknown;
  }
}
declare module "jsts/org/locationtech/jts/io/GeoJSONWriter.js" {
  export default class GeoJSONWriter {
    write(geometry: unknown): unknown;
  }
}
declare module "jsts/org/locationtech/jts/operation/overlay/OverlayOp.js" {
  export default class OverlayOp {
    static difference(a: unknown, b: unknown): unknown;
    static intersection(a: unknown, b: unknown): unknown;
    static overlayOp(a: unknown, b: unknown, operation: number): unknown;
    static DIFFERENCE: number;
    static INTERSECTION: number;
  }
}
