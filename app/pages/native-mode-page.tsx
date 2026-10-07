import { Navigate, useParams, useSearchParams } from "react-router-dom";
import MappedinChrome from "~/components/viewer-modes/mappedin-chrome";
import NativeModeMap from "~/components/viewer-modes/native-mode-map";
import PointrChrome from "~/components/viewer-modes/pointr-chrome";
import SitumChrome from "~/components/viewer-modes/situm-chrome";
import { useLocation } from "~/hooks/use-location";

const skins = {
  mappedin: MappedinChrome,
  pointr: PointrChrome,
  situm: SitumChrome,
} as const;

type SkinId = keyof typeof skins;

export default function NativeModePage() {
  const { skinId } = useParams<{ skinId: string }>();
  const [searchParams] = useSearchParams();
  const locationId = searchParams.get("location") ?? "unbc";
  const { location, loading, error, retry } = useLocation(locationId);
  const Chrome = skins[skinId as SkinId];

  if (!Chrome) return <Navigate to="/modes" replace />;
  if (loading) return <div role="status">Loading venue map…</div>;
  if (error)
    return (
      <div role="alert">
        Could not load this venue map.{" "}
        <button onClick={retry}>Retry venue map</button>
      </div>
    );
  if (!location) {
    return <Navigate to="/modes" replace />;
  }

  return (
    <div className="h-svh">
      <NativeModeMap location={location}>
        {({ availableFloors }) => (
          <Chrome location={location} availableFloors={availableFloors} />
        )}
      </NativeModeMap>
    </div>
  );
}
