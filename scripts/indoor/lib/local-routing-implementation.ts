import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { preparedDisplayEngineBinding } from "../prepared-display-engine-binding";

/** CLI evidence only. The display engine does not bind the route resolver.
 * Hash its actual transitive local source graph and both dependency locks;
 * callers compare again at completion to refuse a mid-run implementation edit.
 */
export function localRoutingImplementation() {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const graph = preparedDisplayEngineBinding(root, [
    "app/indoor-project/route-calculation.ts",
    "app/indoor-project/hallway-center-endpoints.ts",
  ]);
  const siblingLockSha256 = createHash("sha256")
    .update(
      readFileSync(
        new URL("../../../../reviter/package-lock.json", import.meta.url),
      ),
    )
    .digest("hex");
  return {
    format: "local-routing-implementation-v1",
    sha256: createHash("sha256")
      .update(
        JSON.stringify([
          "local-routing-implementation-v1",
          graph.modules,
          siblingLockSha256,
        ]),
      )
      .digest("hex"),
    modules: graph.modules,
    siblingLockSha256,
  };
}
