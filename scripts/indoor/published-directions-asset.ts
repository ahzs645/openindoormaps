import assert from "node:assert/strict";
import path from "node:path";
import { publishedRouteAssetUrl } from "../../app/indoor-project/published-route-asset-url";

/** Map the runtime URL back to the supplied deployment artifact. A directory
 * check cannot certify an asset hosted outside that deployment. */
export function publishedDirectionsAsset(
  receiptUrl: string,
  publicRoot: string,
  deploymentUrl = "https://publication.invalid/",
) {
  const deployment = new URL(deploymentUrl);
  assert(
    /^https?:$/.test(deployment.protocol) &&
      deployment.pathname.endsWith("/") &&
      !deployment.search &&
      !deployment.hash,
    "Publication URL must be an HTTP(S) application base ending in /",
  );
  const url = publishedRouteAssetUrl(receiptUrl, deployment.href, {
    applicationBase: deployment.href,
    applicationUrl: deployment.href,
  });
  assert(
    url.origin === deployment.origin &&
      url.pathname.startsWith(deployment.pathname),
    "Directions asset must be inside the declared application deployment",
  );
  const relativePath = decodeURIComponent(
    url.pathname.slice(deployment.pathname.length),
  );
  const base = path.resolve(publicRoot);
  const asset = path.resolve(base, relativePath);
  assert(
    relativePath.startsWith("data/") && asset.startsWith(base + path.sep),
    "Directions asset must be under the declared publication root",
  );
  return { asset, url: url.href, deploymentUrl: deployment.href };
}
