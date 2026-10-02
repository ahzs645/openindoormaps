import type { LocationConfig } from "~/types/location";
import bcHospital from "./bc-hospital";
import bebeteiVitan from "./bebetei-vitan";
import bowieState from "./bowie-state";
import campus from "./campus";
import eatonCentre from "./eaton-centre";
import cityMall from "./city-mall";
import galleria from "./galleria";
import harrods from "./harrods";
import mappedinMall from "./mappedin-mall";
import unbc from "./unbc";

const locations: Record<string, LocationConfig> = {
  "bc-hospital": bcHospital,
  "bebetei-vitan": bebeteiVitan,
  galleria,
  campus,
  "bowie-state": bowieState,
  "eaton-centre": eatonCentre,
  unbc,
  "city-mall": cityMall,
  harrods,
  "mappedin-mall": mappedinMall,
};

export default locations;
