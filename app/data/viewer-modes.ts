export type ViewerModeKind = "native" | "embedded" | "reskin";

export interface ViewerMode {
  id: string;
  name: string;
  kind: ViewerModeKind;
  description: string;
  source: string;
  embedUrl?: string;
  nativePath?: string;
  status: "working" | "partial" | "blocked";
}

const viewerModes: ViewerMode[] = [
  {
    id: "openindoormaps",
    name: "OpenIndoorMaps (native)",
    kind: "native",
    nativePath: "/unbc",
    description: "Native MapLibre indoor viewer (UNBC campus demo)",
    source: "this repository",
    status: "working",
  },
  {
    id: "pointr",
    name: "Pointr Express",
    kind: "embedded",
    embedUrl: "http://127.0.0.1:8711/",
    description: "Pointr Web SDK v9.9.0 - Harrods v9 demo",
    source: "jsmap recovery (preserved-runtime), port 8711",
    status: "working",
  },
  {
    id: "mappedin",
    name: "Mappedin",
    kind: "embedded",
    embedUrl: "http://127.0.0.1:8713/",
    description: "Mappedin demos page + mall map",
    source: "jsmap recovery (preserved-runtime), port 8713",
    status: "working",
  },
  {
    id: "situm",
    name: "Situm Map Viewer",
    kind: "embedded",
    embedUrl: "http://127.0.0.1:8716/",
    description: "Situm Map Viewer 1.213.8",
    source: "jsmap recovery (preserved-runtime), port 8716",
    status: "partial",
  },
  {
    id: "native-mappedin",
    name: "Mappedin-style (native)",
    kind: "reskin",
    nativePath: "/modes/native/mappedin?location=galleria",
    description: "Left overlay discovery panel + pill floor stack, blue accent",
    source: "native re-skin on OpenIndoorMaps engine - galleria test bench",
    status: "working",
  },
  {
    id: "native-pointr",
    name: "Pointr-style (native)",
    kind: "reskin",
    nativePath: "/modes/native/pointr?location=galleria",
    description: "Welcome modal + EXPLORE list + language pill",
    source: "native re-skin on OpenIndoorMaps engine - galleria test bench",
    status: "working",
  },
  {
    id: "native-situm",
    name: "Situm-style (native)",
    kind: "reskin",
    nativePath: "/modes/native/situm?location=galleria",
    description: "Floating search card + building chip + navy control stack",
    source: "native re-skin on OpenIndoorMaps engine - galleria test bench",
    status: "working",
  },
];

export default viewerModes;
