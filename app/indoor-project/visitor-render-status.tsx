import { useEffect, useMemo, useState } from "react";
import { useMap } from "~/components/map/map";
import { mapReady } from "~/components/map/map-ready";
import type { VisitorScopeView } from "~/indoor-project/progressive-visitor-client";
import type { PublishedVisitorPlan } from "./published-visitor-plan-types";
import {
  visitorPlanSourceFeatureCounts,
  VISITOR_PLAN_CONNECTORS_LAYER_ID,
} from "./published-visitor-plan-layer";
import {
  watchVisitorRender,
  type VisitorRenderMap,
} from "./visitor-render-readiness";

/** Decode completion and MapLibre's displayed-floor readiness are distinct. */
export function VisitorRenderStatus({
  current,
  plan,
  mode,
  assetLoading,
}: {
  current: VisitorScopeView;
  plan?: PublishedVisitorPlan;
  mode: string;
  assetLoading: boolean;
}) {
  const { map, isLoaded } = useMap();
  const generation = useMemo(
    () => ({
      scope: current.scope.id,
      detail: !!current.display,
      plan,
      mode,
      hasMap: !!map,
      isLoaded,
    }),
    [current, mode, map, isLoaded, plan],
  );
  const [state, setState] = useState<{ generation: object; error?: string }>();
  useEffect(() => {
    if (!mapReady(map, isLoaded)) return;
    const counts: Record<string, number> = {};
    const required: string[] = [];
    const custom: string[] = [];
    if (plan) {
      Object.assign(counts, visitorPlanSourceFeatureCounts(plan));
      if (plan.layers.connectors.features.length > 0)
        custom.push(VISITOR_PLAN_CONNECTORS_LAYER_ID);
    } else if (current.display) {
      counts["project-overview"] =
        current.display.preparedFloor.presentation.overviewGeometry.features.length;
      required.push("project-areas", "project-room-blocks", "project-labels");
      if (mode === "2d" && current.display.nativeFaces.regions.length > 0) {
        for (const [suffix, drawing] of [
          ["fill", current.display.nativeFaces.fills],
          ["outline", current.display.nativeFaces.outlines],
          ["partitions", current.display.nativeFaces.partitions],
          ["overview", current.display.nativeFaces.overview],
          ["material", current.display.nativeFaces.walls],
        ] as const)
          counts[`native-explore-${suffix}`] = drawing?.features.length ?? 0;
      } else if (mode !== "2d") {
        custom.push("project-precision-floors", "project-precision-room-roofs");
      }
    } else {
      counts["visitor-overview-ground"] =
        current.overview.ground.features.length;
      counts["visitor-overview-floor"] = current.overview.floor.features.length;
      counts["visitor-overview-labels"] =
        current.overview.labels.features.length;
    }
    return watchVisitorRender({
      map: map as unknown as VisitorRenderMap,
      sourceFeatureCounts: counts,
      requiredSourceIds: required,
      customLayerIds: custom,
      onReady: () => setState({ generation }),
      onError: (error) => setState({ generation, error: error.message }),
    });
  }, [map, isLoaded, current, mode, generation, plan]);
  const error =
    !assetLoading && state?.generation === generation ? state.error : undefined;
  const ready = !assetLoading && state?.generation === generation && !error;
  return (
    <div
      className={ready || assetLoading ? "sr-only" : "visitor-loading"}
      data-testid="visitor-render-status"
      data-state={error ? "error" : ready ? "ready" : "drawing"}
      role={error ? "alert" : "status"}
    >
      {error
        ? `The selected floor could not be drawn: ${error}`
        : ready
          ? "Map drawn."
          : "Drawing selected floor…"}
    </div>
  );
}
