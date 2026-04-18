import { useEffect } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import MapComponent from "~/components/map-component";
import locations from "~/data/locations";
import useSessionStore from "~/stores/session-store";

export default function LocationPage() {
  const { locationId } = useParams<{ locationId: string }>();
  const [searchParams] = useSearchParams();
  const setToken = useSessionStore((state) => state.setToken);

  const location = locationId ? locations[locationId] : undefined;

  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      setToken(token);
    }
  }, [searchParams, setToken]);

  if (!location) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex h-svh items-center justify-center">
      <MapComponent location={location} />
    </div>
  );
}
