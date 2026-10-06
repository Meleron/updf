"use client";

import { createContext, useContext } from "react";

const BackendUrlContext = createContext("");

/** Passes the backend URL, read from the server's environment at request time, to client components. */
export function BackendUrlProvider({ url, children }: { url: string; children: React.ReactNode }) {
  return <BackendUrlContext value={url}>{children}</BackendUrlContext>;
}

export function useBackendUrl() {
  return useContext(BackendUrlContext);
}
