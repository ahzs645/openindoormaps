import { create } from "zustand";

interface SessionStore {
  token: string | null;
  setToken: (token: string | null) => void;
}

const useSessionStore = create<SessionStore>((set) => ({
  token: null,
  setToken: (token) => set({ token }),
}));

export default useSessionStore;
