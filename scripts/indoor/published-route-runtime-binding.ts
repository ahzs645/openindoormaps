import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";

const generated = "app/indoor-project/published-route-runtime-binding.ts";
/** Bind the actual route consumers, physical validators and dependency lock.
 * Only generated literals/allowlists are excluded to avoid circular hashes. */
export function publishedRouteRuntimeBinding(root: string) {
  return preparedDisplayEngineBinding(
    root,
    [
      "app/indoor-project/published-route-calculation.worker.ts",
      "app/indoor-project/progressive-route.worker.ts",
    ],
    {
      namespace: "published-route-runtime-v1",
      exclude: [
        generated,
        "app/indoor-project/published-route-cell-receipts.ts",
        "app/indoor-project/published-project-receipts.ts",
      ],
    },
  );
}
export function writePublishedRouteRuntimeBinding(root: string) {
  const binding = publishedRouteRuntimeBinding(root);
  const target = path.join(root, generated);
  const source = `// Generated from the actual route worker/validator module closure and lock.\nexport const PUBLISHED_ROUTE_RUNTIME_SHA256 =\n  ${JSON.stringify(binding.sha256)};\n`;
  if (!existsSync(target) || readFileSync(target, "utf8") !== source)
    writeFileSync(target, source);
  return binding;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(
    JSON.stringify(
      writePublishedRouteRuntimeBinding(path.resolve(process.argv[2] ?? ".")),
    ),
  );
