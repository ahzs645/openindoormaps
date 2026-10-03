/**
 * Deep-link parameters, in the spirit of Situm's `poi_id` /
 * `navigation_from` / `navigation_to` and Pointr's `highlightPoiIdentifier`:
 *
 * - `poi=<id>` opens that POI's location card
 * - `from=<id>&to=<id>` opens directions (`from` optional)
 * - `accessible=1` starts directions in accessible-only mode
 * - `floor=<n>` selects a floor
 *
 * Other query params (`location`, `token`, ...) are preserved.
 */
export interface DeepLinkState {
  poi?: number;
  from?: number;
  to?: number;
  accessible?: boolean;
  floor?: number;
}

const DEEP_LINK_KEYS = ["poi", "from", "to", "accessible", "floor"] as const;

/** Read queries inside Pages hash routes as well as normal browser routes. */
export function routeSearch(url: string = globalThis.location.href): string {
  const parsed = new URL(url);
  if (parsed.hash.startsWith("#/")) {
    const index = parsed.hash.indexOf("?");
    return index === -1 ? "" : parsed.hash.slice(index);
  }
  return parsed.search;
}

function readNumber(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export function readDeepLink(search: string): DeepLinkState {
  const params = new URLSearchParams(search);
  return {
    poi: readNumber(params, "poi"),
    from: readNumber(params, "from"),
    to: readNumber(params, "to"),
    accessible: params.get("accessible") === "1",
    floor: readNumber(params, "floor"),
  };
}

export function buildDeepLinkUrl(
  state: DeepLinkState,
  base: string = globalThis.location.href,
): string {
  const url = new URL(base);
  const hashRoute = url.hash.startsWith("#/");
  const params = hashRoute
    ? new URLSearchParams(routeSearch(base))
    : url.searchParams;
  for (const key of DEEP_LINK_KEYS) params.delete(key);
  if (state.poi !== undefined) params.set("poi", String(state.poi));
  if (state.from !== undefined) params.set("from", String(state.from));
  if (state.to !== undefined) params.set("to", String(state.to));
  if (state.accessible) params.set("accessible", "1");
  if (state.floor !== undefined) params.set("floor", String(state.floor));
  if (hashRoute) {
    const query = params.toString();
    url.hash = url.hash.split("?")[0] + (query ? `?${query}` : "");
  }
  return url.toString();
}

/** Mirrors panel state into the address bar without adding history entries. */
export function syncDeepLink(state: DeepLinkState) {
  const next = buildDeepLinkUrl(state);
  if (next !== globalThis.location.href) {
    globalThis.history.replaceState(globalThis.history.state, "", next);
  }
}
