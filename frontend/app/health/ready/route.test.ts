import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

it("is ready when the backend URL is set", () => {
  vi.stubEnv("BACKEND_URL", "http://backend.example:8080");

  expect(GET().status).toBe(200);
});

it("is not ready without the backend URL, since every page would fail", () => {
  vi.stubEnv("BACKEND_URL", undefined);

  expect(GET().status).toBe(503);
});
