import type { LocationConfig } from "~/types/location";
import bebeteiVitan from "./bebetei-vitan";
import unbc from "./unbc";

const locations: Record<string, LocationConfig> = {
  "bebetei-vitan": bebeteiVitan,
  unbc,
};

export default locations;
