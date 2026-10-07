import { createLocationLoader } from "./location-loader";

// Lightweight workspace listing. Physical maps load only after venue selection.
export const locationCatalog = [
  { slug: "bc-hospital", name: "BC Children’s and Women’s Hospital Campus" },
  { slug: "bebetei-vitan", name: "BebeTei Vitan" },
  { slug: "galleria", name: "Galleria (synthetic demo)" },
  { slug: "campus", name: "Campus (synthetic multi-building demo)" },
  { slug: "bowie-state", name: "Bowie State University (Mappedin campus)" },
  { slug: "eaton-centre", name: "CF Toronto Eaton Centre (Mappedin)" },
  { slug: "unbc", name: "UNBC IFC Import" },
  { slug: "city-mall", name: "City Mall (Situm demo venue)" },
  { slug: "harrods", name: "Harrods (Pointr demo venue)" },
  { slug: "mappedin-mall", name: "Demo Mall (Mappedin demo venue)" },
];
export const loadLocation = createLocationLoader({
  "bc-hospital": () => import("./bc-hospital"),
  "bebetei-vitan": () => import("./bebetei-vitan"),
  galleria: () => import("./galleria"),
  campus: () => import("./campus"),
  "bowie-state": () => import("./bowie-state"),
  "eaton-centre": () => import("./eaton-centre"),
  unbc: () => import("./unbc"),
  "city-mall": () => import("./city-mall"),
  harrods: () => import("./harrods"),
  "mappedin-mall": () => import("./mappedin-mall"),
});
