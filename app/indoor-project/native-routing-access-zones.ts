import type { IndoorDataset } from "./contract";
import { nativeAccessZoneBinding } from "./native-access-zones";
import { routingCalculationValue } from "./routing-cache";

/** The complete original zone/member/geometry binding is identical on every
 * physical plane. Reuse it only inside an existing synchronous calculation or
 * private immutable worker session. Outside that context the original binding
 * runs again, so authoring edits never inherit a dataset-identity cache. */
export function nativeRoutingAccessZoneBinding(data: IndoorDataset) {
  return routingCalculationValue(data, "native-route-access-zone-binding", () =>
    nativeAccessZoneBinding(data),
  );
}

export function nativeRoutingAccessZonesAt(
  data: IndoorDataset,
  elevationFeet: number,
) {
  return nativeRoutingAccessZoneBinding(data).zones.filter(
    (z) => Math.abs(z.zone.elevationFeet - elevationFeet) < 0.05,
  );
}
