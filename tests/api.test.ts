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
  it("serves computed analysis and equivalent-region comparisons", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => { const value = String(url); if (value.includes("macrostrat")) return response(macro); if (value.includes("FeatureServer")) return response(mrds); if (value.includes("earthquake")) return response(quakes); if (value.includes("overpass")) return response(osm); throw new Error(value); }));
    const analysisResponse = await app.request("/api/v1/analysis?lat=33.9&lon=-118.1&radius_km=80");
    const analysis = await analysisResponse.json() as any;
    expect(analysisResponse.status).toBe(200);
    expect(analysis.analysis.analysisVersion).toBe("1.0.0");
    expect(analysis.analysis.findings.every((item: any) => item.classification === "computed_observation")).toBe(true);
    const comparisonResponse = await app.request("/api/v1/compare?lat_a=34.742&lon_a=-120.5724&lat_b=35.6762&lon_b=139.6503&radius_km=100&label_a=Vandenberg&label_b=Tokyo");
    const comparison = await comparisonResponse.json() as any;
    expect(comparisonResponse.status).toBe(200);
    expect(comparison.labels).toEqual({ regionA: "Vandenberg", regionB: "Tokyo" });
    expect(comparison.comparison.dataAvailability).toHaveLength(4);
  });
  it("exposes policy-compliant place search with attribution", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response([{ place_id: 7, osm_type: "relation", osm_id: 9, display_name: "Los Angeles, California, United States", name: "Los Angeles", lat: "34.0522", lon: "-118.2437", type: "city", category: "place" }])));
    const result = await app.request("/api/v1/places?q=Los%20Angeles%20API%20fixture", {}, { GEOCODER_ENDPOINT: "https://geocoder.example.test/search" });
    const body = await result.json() as any;
    expect(result.status).toBe(200);
    expect(body.results[0]).toMatchObject({ name: "Los Angeles", lat: 34.0522, lon: -118.2437 });
    expect(body.limitations.join(" ")).toContain("not an autocomplete");
  });
});
