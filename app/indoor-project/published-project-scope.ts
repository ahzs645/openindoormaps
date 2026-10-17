import { preparedDisplayOptions } from "./prepared-display-registry";
import type { ProjectMapLayers } from "./map-layers";
import type {
  ProgressiveManifest,
  ProgressiveScope,
} from "./progressive-delivery";
type MapProps = Parameters<typeof ProjectMapLayers>[0];
export function publishedScopeFor(
  manifest: ProgressiveManifest,
  props: Pick<
    MapProps,
    | "data"
    | "levelIds"
    | "building"
    | "relativeHeights"
    | "showPillars"
    | "showPassThroughPlaces"
    | "showVestibuleDoors"
    | "showStructures"
    | "showDoorwayRecesses"
    | "review"
    | "simplifyGeometry"
  >,
): ProgressiveScope | undefined {
  if (
    props.data.source.modelSha256 !== manifest.provenance.source.modelSha256 ||
    props.data.source.roomsSha256 !== manifest.provenance.source.roomsSha256 ||
    props.data.source.modelFileName !== manifest.provenance.source.modelFileName
  )
    return;
  const expected = preparedDisplayOptions(props.data, {
    relativeHeights: props.relativeHeights,
    showPillars: props.showPillars,
    showPassThroughPlaces: props.showPassThroughPlaces,
    showVestibuleDoors: props.showVestibuleDoors,
    showStructures: props.showStructures,
    showDoorwayRecesses: props.showDoorwayRecesses,
    review: props.review,
    simplifyGeometry: props.simplifyGeometry,
  });
  return manifest.scopes.find(
    (scope) =>
      scope.building === props.building &&
      scope.levelIds.length === props.levelIds.length &&
      scope.levelIds.every((id) => props.levelIds.includes(id)) &&
      scope.display.descriptor.binding.windowMode ===
        (props.data.windowDisplay?.mode ?? "none") &&
      Object.keys(expected).length ===
        Object.keys(scope.display.descriptor.binding.options).length &&
      Object.keys(expected).every(
        (key) =>
          expected[key] === scope.display.descriptor.binding.options[key],
      ),
  );
}
