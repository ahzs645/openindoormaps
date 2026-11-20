export type PublishedRouteAssetLocation = {
  /** The application mount, normally supplied by Vite for this build. */
  applicationBase?: string;
  /** The page/worker URL; injectable for publication checks and tests. */
  applicationUrl?: string;
};

/** Compiled /data/ receipts name assets shipped with the application. Their
 * leading slash must not discard a Pages deployment's mount. The manifest can
 * live on another origin, so use the page/worker origin for these app assets.
 * Explicit absolute/CDN URLs and other relative receipts keep URL semantics.
 * This changes transport only; receipt bytes and source admission are untouched. */
export function publishedRouteAssetUrl(
  receiptUrl: string,
  fallbackUrl: string,
  options: PublishedRouteAssetLocation = {},
) {
  if (!receiptUrl.startsWith("/data/")) return new URL(receiptUrl, fallbackUrl);

  const base = new URL(
    options.applicationBase ?? import.meta.env?.BASE_URL ?? "/",
    options.applicationUrl ?? globalThis.location?.href ?? fallbackUrl,
  );
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  base.search = "";
  base.hash = "";
  return new URL(receiptUrl.slice(1), base);
}
