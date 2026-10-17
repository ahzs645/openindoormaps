import type { IndoorDataset } from "./contract";
import { validateIndoorDataset } from "./routing";
import { createWorkerRouteCalculator } from "./route-calculation";
import { createImmutableRoutingSession } from "./routing-cache";

/** The routing projection is freshly parsed inside one private worker. Run the
 * unchanged complete validator before admitting the calculator; transport
 * hashes and a matching source header alone do not prove a valid dataset.
 * The shared immutable session retains exact validation indexes without
 * repeating their construction for every endpoint or route profile. */
export function createVerifiedProgressiveRouteCalculator(data: IndoorDataset) {
  const run = createImmutableRoutingSession(data);
  run(() => validateIndoorDataset(data));
  const calculate = createWorkerRouteCalculator(data);
  return (...args: Parameters<typeof calculate>) =>
    run(() => calculate(...args));
}
