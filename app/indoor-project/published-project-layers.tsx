import { useEffect, useMemo, useRef, useState } from "react";
import { useMap, useMapRecreate } from "~/components/map/map";
import { mapReady } from "~/components/map/map-ready";
import { LngLatBounds } from "maplibre-gl";
import { ProjectMapLayers, PreparedProjectMapLayers } from "./map-layers";
import { ProgressiveOverviewLayer } from "./progressive-overview-layer";
import {
  ProgressiveVisitorClient,
  type VisitorScopeView,
} from "./progressive-visitor-client";
import { publishedScopeFor } from "./published-project-scope";
import { emptyPreparedFloorSources } from "./prepared-layer-lifetime";
import { registerVerifiedPreparedDisplay } from "./floor-display-worker-bridge";
import {
  heavyWorkerSchedule,
  heavyWorkerName,
  trackedHeavyWorker,
  floorPreparationReady,
  largeIndoorProject,
  shouldRecreateMapForScope,
} from "./heavy-worker-schedule";
import type { PublishedProjectReceipt } from "./published-project";
import { applyPublishedOverviewCirculationPaint } from "./published-circulation-paint";
import { RampPlanLayer } from "./ramp-plan-layer";

type MapProps = Parameters<typeof ProjectMapLayers>[0];
type Props = MapProps & {
  publication?: PublishedProjectReceipt;
  manifestUrl?: string;
};

/** The full UI consumes the same checked floor payloads as the progressive
 * viewer. Source edits or unsupported options retain ordinary preparation. */
export function PublishedProjectMapLayers(props: Props) {
  const ramps =
    !props.review && !props.nativeModel && !props.roomThree ? (
      <RampPlanLayer
        data={props.data}
        levelIds={props.levelIds}
        building={props.building}
      />
    ) : null;
  if (!props.publication || !props.manifestUrl) {
    const { publication: _, manifestUrl: __, ...ordinary } = props;
    return (
      <>
        <ProjectMapLayers {...ordinary} />
        {ramps}
      </>
    );
  }
  return (
    <>
      <PublishedLayers
        {...props}
        publication={props.publication}
        manifestUrl={props.manifestUrl}
      />
      {ramps}
    </>
  );
}

function PublishedLayers({
  publication,
  manifestUrl,
  onNativeDisplay,
  ...props
}: Props & { publication: PublishedProjectReceipt; manifestUrl: string }) {
  const { map, isLoaded } = useMap();
  const [client, setClient] = useState<ProgressiveVisitorClient>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<{ id: string; current: VisitorScopeView }>();
  const basemapVisibility = useRef(new Map<string, string>());
  const recreateMap = useMapRecreate();
  const shownScope = useRef<string>();
  useEffect(() => {
    const controller = new AbortController();
    let opened: ProgressiveVisitorClient | undefined;
    setClient(undefined);
    setError("");
    setView(undefined);
    void ProgressiveVisitorClient.open(
      new URL(manifestUrl, location.href).href,
      {
        signal: controller.signal,
        floorWorkerFactory: () => {
          const name = heavyWorkerName("floor");
          return trackedHeavyWorker(
            heavyWorkerSchedule,
            name,
            new Worker(
              new URL("./progressive-floor.worker.ts", import.meta.url),
              { type: "module", name },
            ),
          );
        },
      },
    )
      .then((next) => {
        opened = next;
        if (controller.signal.aborted) {
          next.close();
          return;
        }
        if (
          next.manifest.revisionSha256 !==
            publication.progressiveRevisionSha256 ||
          next.manifest.provenance.packageSha256 !==
            publication.packageSha256 ||
          next.manifest.provenance.datasetSha256 !== publication.datasetSha256
        )
          throw new Error(
            "Published floor assets do not match this checked map.",
          );
        setClient(next);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(String(error instanceof Error ? error.message : error));
      });
    return () => {
      controller.abort();
      opened?.close();
    };
  }, [publication, manifestUrl, attempt]);
  const optionsKey = JSON.stringify([
    props.levelIds,
    props.building,
    props.relativeHeights,
    props.showPillars,
    props.showPassThroughPlaces,
    props.showVestibuleDoors,
    props.showStructures,
    props.showDoorwayRecesses,
    props.review,
    props.simplifyGeometry,
    props.data.windowDisplay?.mode,
  ]);
  const scope = useMemo(
    () => client && publishedScopeFor(client.manifest, props),
    [client, optionsKey],
  );
  const current = scope && view?.id === scope.id ? view.current : undefined;
  useMemo(() => {
    if (current?.display)
      registerVerifiedPreparedDisplay(
        current.display.preparedFloor,
        current.display.nativeFaces,
        current.overview,
      );
  }, [current]);
  useEffect(() => {
    if (current?.display) {
      shownScope.current = optionsKey;
      return;
    }
    if (
      shouldRecreateMapForScope(
        shownScope.current,
        optionsKey,
        true,
        largeIndoorProject(props.data),
      ) &&
      recreateMap?.()
    )
      shownScope.current = undefined;
  }, [!!current?.display, optionsKey, recreateMap, props.data]);
  useEffect(() => {
    if (!client || !scope) {
      setView(undefined);
      return;
    }
    const controller = new AbortController();
    let release = () => {};
    setError("");
    setView(undefined);
    void (async () => {
      const preview = await client.selectScope(scope.id, {
        signal: controller.signal,
      });
      const overview = applyPublishedOverviewCirculationPaint(
        preview.overview,
        client.manifest,
        scope,
      );
      if (!controller.signal.aborted)
        setView({ id: scope.id, current: { ...preview, overview } });
      await new Promise<void>((resolve, reject) => {
        const stop = heavyWorkerSchedule.when(
          floorPreparationReady(heavyWorkerSchedule, true),
          resolve,
        );
        controller.signal.addEventListener(
          "abort",
          () => {
            stop();
            reject(controller.signal.reason);
          },
          { once: true },
        );
        if (controller.signal.aborted) {
          stop();
          reject(controller.signal.reason);
        }
      });
      controller.signal.throwIfAborted();
      release = heavyWorkerSchedule.begin("floor");
      const next = await client.selectScope(scope.id, {
        detail: true,
        signal: controller.signal,
      });
      if (!controller.signal.aborted)
        setView({ id: scope.id, current: { ...next, overview } });
    })()
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => release());
    return () => controller.abort();
  }, [client, scope?.id]);
  useEffect(() => {
    onNativeDisplay?.({
      data: props.data,
      levelIds: props.levelIds,
      building: props.building,
      result: current?.display?.nativeFaces,
      error: error || undefined,
      retry: () => setAttempt((n) => n + 1),
    });
  }, [current, error, onNativeDisplay, props.data, optionsKey]);
  useEffect(() => {
    if (mapReady(map, isLoaded) && !current?.display)
      emptyPreparedFloorSources(map, {
        type: "FeatureCollection",
        features: [],
      });
  }, [map, isLoaded, !!current?.display, scope?.id]);
  useEffect(() => {
    if (!mapReady(map, isLoaded) || !current || current.display) return;
    props.onFitReady((includeSelection = true) => {
      const chosen =
        includeSelection && props.selected
          ? current.overview.geometry.features.filter((f) =>
              f.properties?.roomKeys?.includes(props.selected),
            )
          : [];
      const bounds = new LngLatBounds();
      const extend = (coordinates: unknown) => {
        if (!Array.isArray(coordinates)) return;
        if (
          typeof coordinates[0] === "number" &&
          typeof coordinates[1] === "number"
        )
          bounds.extend(coordinates as [number, number]);
        else for (const part of coordinates) extend(part);
      };
      for (const feature of chosen.length
        ? chosen
        : current.overview.geometry.features)
        if ("coordinates" in feature.geometry)
          extend(feature.geometry.coordinates);
      if (!bounds.isEmpty())
        map.fitBounds(bounds, {
          padding: 55,
          maxZoom: chosen.length ? 21 : 17.4,
          duration: 300,
        });
    });
  }, [map, isLoaded, current, props.onFitReady, props.selected]);
  if (client && !scope)
    return <ProjectMapLayers {...props} onNativeDisplay={onNativeDisplay} />;
  if (error)
    return (
      <div className="project-published-loading" role="alert">
        {error} <button onClick={() => setAttempt((n) => n + 1)}>Retry</button>
      </div>
    );
  if (!current)
    return (
      <div className="project-published-loading" role="status">
        Loading selected floor…
      </div>
    );
  if (!current.display || !current.context)
    return (
      <>
        <ProgressiveOverviewLayer
          overview={current.overview}
          origin={props.data.alignment.originGeographic}
          shell={client!.shell}
          revealRooms={!props.overviewLocked}
        />
        <div className="project-published-loading" role="status">
          Preparing interactive room details… You can keep zooming.
        </div>
      </>
    );
  return (
    <PreparedProjectMapLayers
      {...props}
      prepared={current.display.preparedFloor}
      basemapVisibility={basemapVisibility}
      visitorContext={{
        ...client!.shell.display,
        ...current.context,
        visitorLabels: props.roomThree
          ? current.display.preparedFloor.presentation.display.labels
          : current.context.visitorLabels,
      }}
    />
  );
}
