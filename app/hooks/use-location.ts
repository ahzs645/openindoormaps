import { useEffect, useState } from "react";
import { loadLocation } from "../data/locations";
import type { LocationConfig } from "../types/location";

export function useLocation(id: string | undefined) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    id: string;
    location?: LocationConfig;
    error?: string;
  }>();
  useEffect(() => {
    if (!id) return;
    let active = true;
    setState(undefined);
    void loadLocation(id).then(
      (location) => {
        if (active) setState({ id, location });
      },
      (error: unknown) => {
        if (active)
          setState({
            id,
            error: error instanceof Error ? error.message : String(error),
          });
      },
    );
    return () => {
      active = false;
    };
  }, [id, attempt]);
  const current = state?.id === id ? state : undefined;
  return {
    location: current?.location,
    error: current?.error,
    loading: !!id && !current,
    retry: () => setAttempt((n) => n + 1),
  };
}
