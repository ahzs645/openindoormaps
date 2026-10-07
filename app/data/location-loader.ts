import type { LocationConfig } from "../types/location";

/** Load only the selected venue; share in-flight loads and allow retries after
 * network/chunk failures. The catalog must not import physical venue datasets. */
export function createLocationLoader(
  loaders: Record<string, () => Promise<{ default: LocationConfig }>>,
) {
  const cache = new Map<string, Promise<LocationConfig>>();
  return (id: string): Promise<LocationConfig | undefined> => {
    const loader = Object.hasOwn(loaders, id) ? loaders[id] : undefined;
    if (!loader) return Promise.resolve(undefined);
    let result = cache.get(id);
    if (!result) {
      result = Promise.resolve()
        .then(loader)
        .then((module) => module.default);
      cache.set(id, result);
      void result.catch(() => {
        if (cache.get(id) === result) cache.delete(id);
      });
    }
    return result;
  };
}
