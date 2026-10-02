import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { IndoorProject } from "./package";
import { geographicPoint } from "./routing";
import { locationAnnotations } from "./map-edits";
import { editorSymbolSvg } from "./editor-symbols";
export function editorGeoJSON(
  project: IndoorProject,
  levels: number[],
): FeatureCollection {
  const { dataset: data } = project;
  const features: Feature<Geometry>[] = data.records
    .filter((r) => levels.includes(r.levelId))
    .map((r) => ({
      type: "Feature",
      properties: {
        kind: "room",
        roomKey: r.key,
        number: r.number,
        name: data.visitor?.places[r.key]?.displayName ?? r.name,
        levelId: r.levelId,
      },
      geometry: {
        type: "Polygon",
        coordinates: r.ringsFeet.map((ring) =>
          [...ring, ring[0]].map((p) => geographicPoint(data, p)),
        ),
      },
    }));
  for (const item of [
    ...(project.rooms.mapEdits?.annotations ?? []),
    ...locationAnnotations(project),
  ].filter((a) => levels.includes(a.levelId))) {
    let geometry: Geometry = {
      type: "Polygon",
      coordinates: [
        [...item.pointsFeet, item.pointsFeet[0]].map((p) =>
          geographicPoint(data, p),
        ),
      ],
    };
    if (item.kind === "label")
      geometry = {
        type: "Point",
        coordinates: geographicPoint(data, item.pointsFeet[0]),
      };
    if (item.kind === "line")
      geometry = {
        type: "LineString",
        coordinates: item.pointsFeet.map((p) => geographicPoint(data, p)),
      };
    features.push({
      type: "Feature",
      properties: { ...item, pointsFeet: undefined },
      geometry,
    });
  }
  return { type: "FeatureCollection", features };
}
const escape = (s: string) =>
  s.replaceAll(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
/** Source floor outlines + local edits. This is our GeoJSON/SVG, not Mappedin MVF. */
export function editorFloorSvg(project: IndoorProject, levels: number[]) {
  const rooms = project.dataset.records.filter((r) =>
    levels.includes(r.levelId),
  );
  const annotations = [
    ...(project.rooms.mapEdits?.annotations ?? []),
    ...locationAnnotations(project),
  ].filter((a) => levels.includes(a.levelId));
  const points = [
    ...rooms.flatMap((r) => r.ringsFeet.flat()),
    ...annotations.flatMap((a) => a.pointsFeet),
  ];
  if (points.length === 0)
    throw new Error("No geometry on this floor to export.");
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const minX = Math.min(...xs) - 20,
    maxY = Math.max(...ys) + 20,
    width = Math.max(...xs) - minX + 20,
    height = maxY - Math.min(...ys) + 20;
  const path = (rings: number[][][]) =>
    rings
      .map(
        (r) =>
          `M ${r.map((p) => `${p[0] - minX},${maxY - p[1]}`).join(" L ")} Z`,
      )
      .join(" ");
  const source = rooms
    .map(
      (r) =>
        `<path d="${path(r.ringsFeet)}" fill="${project.dataset.visitor?.places[r.key]?.color ?? "#e8eeee"}" stroke="#9aa8aa" stroke-width=".3" fill-rule="evenodd"><title>${escape(r.number + " · " + r.name)}</title></path>`,
    )
    .join("");
  const walls = project.dataset.walls
    .filter((w) => levels.includes(w.levelId))
    .map(
      (w) =>
        `<path d="${path(w.ringsFeet)}" fill="#687173" fill-rule="evenodd"/>`,
    )
    .join("");
  const edits = annotations
    .map((a) => {
      const [x, y] = a.pointsFeet[0],
        label = `<g transform="translate(${x - minX} ${maxY - y}) rotate(${a.rotation ?? 0})">${editorSymbolSvg(a.symbol).replace("<svg ", '<svg x="-5" y="-14" width="10" height="10" ')}<text font-family="Arial,sans-serif" font-size="${a.fontSize * 0.3}" text-anchor="middle" fill="${a.color}">${escape(a.text)}</text></g>`;
      let shape = "";
      if (a.kind === "area")
        shape = `<path d="${path([a.pointsFeet])}" fill="${a.color}" fill-opacity=".25" stroke="${a.color}" stroke-width=".5"/>`;
      if (a.kind === "line")
        shape = `<polyline points="${a.pointsFeet.map((p) => `${p[0] - minX},${maxY - p[1]}`).join(" ")}" fill="none" stroke="${a.color}" stroke-width=".5"/>`;
      return shape + label;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="1600" height="${Math.round((1600 * height) / width)}"><title>${escape(project.manifest.model.fileName)} · floor map</title><rect width="100%" height="100%" fill="white"/>${source}${walls}${edits}</svg>`;
}
export function downloadEditorFile(
  value: string | Uint8Array,
  name: string,
  type: string,
) {
  const bytes =
    typeof value === "string"
      ? value
      : (new Uint8Array(value).buffer as ArrayBuffer);
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
