import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";
const generated =
  "app/indoor-project/published-visitor-plan-runtime-binding.ts";
export function publishedVisitorPlanRuntimeBinding(root: string) {
  return preparedDisplayEngineBinding(
    root,
    [
      "app/indoor-project/published-visitor-plan.ts",
      "app/indoor-project/published-visitor-plan-projection.ts",
      "app/indoor-project/published-visitor-plan-layer.tsx",
    ],
    {
      namespace: "published-visitor-plan-runtime-v1",
      aliases: { "~/": "app/" },
      exclude: [
        generated,
        "app/indoor-project/published-visitor-plan-receipts.ts",
      ],
    },
  );
}
export function writePublishedVisitorPlanRuntimeBinding(root: string) {
  const binding = publishedVisitorPlanRuntimeBinding(root),
    target = path.join(root, generated),
    source = `// Generated from the actual plan projection/loader/renderer closure and lock.\nexport const PUBLISHED_VISITOR_PLAN_RUNTIME_SHA256 =\n  ${JSON.stringify(binding.sha256)};\n`;
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
      writePublishedVisitorPlanRuntimeBinding(
        path.resolve(process.argv[2] ?? "."),
      ),
    ),
  );
