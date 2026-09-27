import type { LocationConfig } from "~/types/location";
import bebeteiVitan from "./bebetei-vitan";
import cityMall from "./city-mall";
import galleria from "./galleria";
import harrods from "./harrods";
import mappedinMall from "./mappedin-mall";
import unbc from "./unbc";

const locations: Record<string, LocationConfig> = {
  "bebetei-vitan": bebeteiVitan,
  galleria,
  unbc,
  "city-mall": cityMall,
  harrods,
  "mappedin-mall": mappedinMall,
};

export default locations;
