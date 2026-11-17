import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../apps/worker/src/index.ts";
import macro from "./fixtures/macrostrat.json";
import mrds from "./fixtures/mrds-page.json";
import quakes from "./fixtures/earthquakes.json";
import osm from "./fixtures/overpass.json";

afterEach(() => vi.unstubAllGlobals());
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
describe("HTTP API", () => {
  it("publishes health, catalog and OpenAPI", async () => { expect((await app.request("/api/v1/health")).status).toBe(200); expect((await app.request("/api/v1/sources")).status).toBe(200); expect((await app.request("/api/v1/openapi.json")).status).toBe(200); });
  it("validates unsafe query input", async () => expect((await app.request("/api/v1/context?lat=99&lon=0")).status).toBe(400));
  it("returns real-shaped normalized multi-source GeoJSON with partial isolation", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => { const value = String(url); if (value.includes("macrostrat")) return response(macro); if (value.includes("FeatureServer")) return response(mrds); if (value.includes("earthquake")) return response(quakes); if (value.includes("overpass")) return new Response("busy", { status: 503 }); throw new Error(value); }));
    const result = await app.request("/api/v1/context?lat=34.0522&lon=-118.2437&radius_km=100"); const body = await result.json() as any;
    expect(result.status).toBe(200); expect(body.counts.total).toBe(3); expect(body.geojson.features.map((f: any) => f.properties.sourceId)).toEqual(["macrostrat", "mrds", "earthquakes"]); expect(body.statuses.find((s: any) => s.sourceId === "osm").state).toBe("unavailable");
  });
});
