import type { RevitImportFixture } from "~/types/revit-import";

const ahszRevitImport: RevitImportFixture = {
  id: "ahsz",
  name: "AHSZ Revit Import",
  sourceFileName: "ahsz_3d model_17.04_finished.rvt",
  status: "metadata-only",
  preview: {
    src: `${import.meta.env.BASE_URL}revit/ahsz-preview.png`,
    width: 128,
    height: 128,
    sizeBytes: 1707,
  },
  sourceFile: {
    sizeBytes: 48_304_128,
    sha256: "97ee5ac97cadee02f97a3a79e03a9bac448be61421db8fb993aad940e5c4d3c1",
  },
  nativeRvt: {
    parser: "@phi-ag/rvt",
    fileVersion: 14,
    version: "2025",
    build: "20240516_1515(x64)",
    locale: "RUS",
    appName: "Autodesk Revit",
    documentId: "d2752a46-362b-4c30-bb38-e0b6a1a864cb",
    identityId: "00000000-0000-0000-0000-000000000000",
    worksharing: "Not enabled",
  },
  container: {
    type: "Autodesk Revit RVT OLE compound document",
    entryCount: 56,
    folderCount: 3,
    partitionCount: 44,
    largestPartition: {
      name: "Partitions/75",
      sizeBytes: 26_943_743,
    },
  },
  streamDiagnostics: {
    elemTable: {
      recordCount: 40_880,
      decompressedSizeBytes: 1_643_495,
      firstRecordIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    },
    largestPartition: {
      name: "Partitions/75",
      gzipMemberCount: 1548,
      gzipCountSource: "binwalk",
      gzipSignatureCount: 1574,
    },
  },
  openIndoorMapsImport: {
    canExtractGeometry: false,
    targetCollections: ["indoorMap", "indoorRoutes", "pois"],
    nextConversion:
      "Export RVT to IFC with rooms, spaces, and building storeys enabled.",
  },
  modelArtifacts: {
    ifc: {
      label: "IFC export",
      status: "blocked",
      path: "ahsz.ifc",
      detail:
        "Requires Revit desktop export, Autodesk Design Automation, or another RVT-capable converter.",
    },
    glb: {
      label: "3D GLB model",
      status: "missing",
      path: "public/revit/ahsz.glb",
      detail:
        "Generate after IFC export with IfcConvert, Blender, or an IfcOpenShell geometry step.",
    },
    openIndoorMapsGeoJson: {
      label: "OpenIndoorMaps GeoJSON",
      status: "missing",
      path: "app/data/ahsz/*.geojson",
      detail:
        "Generate indoorMap, indoorRoutes, and pois once IFC spaces/storeys are available.",
    },
  },
  taskList: [
    {
      id: "rvt-preflight",
      label: "RVT metadata preflight",
      status: "done",
      detail:
        "Parsed BasicFileInfo, file hash, Revit build, document IDs, container counts, and stream diagnostics.",
      output: "manifest.json",
    },
    {
      id: "preview-extract",
      label: "Native preview extraction",
      status: "done",
      detail: "Extracted the embedded 128x128 RevitPreview4.0 PNG.",
      output: "public/revit/ahsz-preview.png",
    },
    {
      id: "native-geometry",
      label: "Native RVT geometry decode",
      status: "blocked",
      detail:
        "The local open-source parser exposes metadata and preview data, but not Revit categories, room boundaries, or mesh geometry.",
    },
    {
      id: "ifc-export",
      label: "Export RVT to IFC",
      status: "current",
      detail:
        "Use Revit desktop or Autodesk Design Automation with rooms, spaces, and building storeys enabled.",
      output: "ahsz.ifc",
    },
    {
      id: "glb-conversion",
      label: "Convert IFC to 3D model",
      status: "next",
      detail:
        "Convert the IFC into a web-ready GLB and attach it to this import fixture.",
      output: "public/revit/ahsz.glb",
    },
    {
      id: "geojson-conversion",
      label: "Convert IFC spaces to OpenIndoorMaps",
      status: "next",
      detail:
        "Create indoorMap polygons, POIs, and snapped indoorRoutes from spaces, storeys, doors, and circulation areas.",
      output: "app/data/ahsz/*.geojson",
    },
    {
      id: "app-3d-render",
      label: "Render imported 3D model",
      status: "next",
      detail:
        "Show the GLB alongside the Revit import diagnostics once a real model artifact exists.",
    },
  ],
};

export default ahszRevitImport;
