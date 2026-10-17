/** The small surface used here also permits source-indexing lifecycle tests. */
export interface VisitorRenderMap {
  on(
    type: string,
    listener: (event?: { sourceId?: string; error?: Error }) => void,
  ): unknown;
  off(
    type: string,
    listener: (event?: { sourceId?: string; error?: Error }) => void,
  ): unknown;
  getStyle(): { sources?: Record<string, unknown> } | undefined;
  getSource(id: string): unknown;
  isSourceLoaded(id: string): boolean;
  getLayer(id: string): unknown;
  triggerRepaint(): void;
}

type ReadinessLayer = { whenReady?: PromiseLike<void> };
const ownedSource = (id: string) =>
  /^(?:project-|native-explore-|visitor-overview-)/.test(id);

/** Wait for this view's actual uploads and a later painted frame. A camera can
 * continue moving: source-ready render, rather than global idle, is the gate.
 * The caller cancels the subscription whenever its view generation changes.
 */
export function watchVisitorRender({
  map,
  sourceFeatureCounts,
  requiredSourceIds = [],
  customLayerIds = [],
  onReady,
  onError,
}: {
  map: VisitorRenderMap;
  sourceFeatureCounts: Record<string, number>;
  requiredSourceIds?: string[];
  customLayerIds?: string[];
  onReady: () => void;
  onError: (error: Error) => void;
}) {
  let active = true;
  const promises = new Map<PromiseLike<void>, boolean>();
  const stop = () => {
    if (!active) return;
    active = false;
    for (const event of ["render", "idle", "sourcedata", "styledata", "error"])
      map.off(event, listeners[event]);
  };
  const fail = (error: Error) => {
    if (!active) return;
    stop();
    onError(error);
  };
  const check = (painted: boolean) => {
    if (!active) return;
    try {
      for (const id of [
        ...requiredSourceIds,
        ...Object.keys(sourceFeatureCounts),
      ]) {
        const source = map.getSource(id);
        if (!source) return;
        if (id in sourceFeatureCounts) {
          // serialize() returns the current inline GeoJSON by reference for
          // these full-setData sources; unlike getData(), it does not request
          // the complete campus back from a worker. Its count distinguishes
          // the initial empty native source from this view's actual upload.
          const data = (
            source as { serialize?: () => { data?: { features?: unknown[] } } }
          ).serialize?.().data;
          if (data?.features?.length !== sourceFeatureCounts[id]) return;
        }
      }
      const ids = Object.keys(map.getStyle()?.sources ?? {}).filter(
        ownedSource,
      );
      if (ids.length === 0 || ids.some((id) => !map.isSourceLoaded(id))) return;
      for (const id of customLayerIds) {
        const styleLayer = map.getLayer(id) as
          | (ReadinessLayer & { implementation?: ReadinessLayer })
          | undefined;
        const layer = styleLayer?.implementation ?? styleLayer;
        if (!layer?.whenReady) return;
        const promise = layer.whenReady;
        if (!promises.has(promise)) {
          promises.set(promise, false);
          void Promise.resolve(promise).then(
            () => {
              if (!active) return;
              promises.set(promise, true);
              map.triggerRepaint();
            },
            (error: unknown) => {
              if (!active) return;
              try {
                const current = map.getLayer(id) as
                  | (ReadinessLayer & { implementation?: ReadinessLayer })
                  | undefined;
                if ((current?.implementation ?? current)?.whenReady !== promise)
                  return;
                fail(error instanceof Error ? error : new Error(String(error)));
              } catch (error_) {
                fail(
                  error_ instanceof Error ? error_ : new Error(String(error_)),
                );
              }
            },
          );
        }
        if (!promises.get(promise)) return;
      }
      if (!painted) {
        map.triggerRepaint();
        return;
      }
      stop();
      onReady();
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  };
  const listeners: Record<
    string,
    (event?: { sourceId?: string; error?: Error }) => void
  > = {
    render: () => check(true),
    idle: () => check(false),
    sourcedata: () => check(false),
    styledata: () => check(false),
    error: (event) => {
      if (event?.sourceId && ownedSource(event.sourceId))
        fail(
          event.error ??
            new Error(`Map source ${event.sourceId} could not be drawn.`),
        );
    },
  };
  for (const event of Object.keys(listeners)) map.on(event, listeners[event]);
  queueMicrotask(() => check(false));
  return stop;
}
