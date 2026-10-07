import { useEffect } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import MapComponent from "~/components/map-component";
import { useLocation } from "~/hooks/use-location";
import useSessionStore from "~/stores/session-store";

export default function LocationPage() {
  const { locationId } = useParams<{ locationId: string }>();
  const [searchParams] = useSearchParams();
  const setToken = useSessionStore((state) => state.setToken);

  const { location, loading, error, retry } = useLocation(locationId);

  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      setToken(token);
    }
  }, [searchParams, setToken]);

  if (loading) return <div role="status">Loading venue map…</div>;
  if (error)
    return (
      <div role="alert">
        Could not load this venue map.{" "}
        <button onClick={retry}>Retry venue map</button>
      </div>
    );
  if (!location) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex h-svh items-center justify-center">
      <MapComponent location={location} />
    </div>
  );
}
