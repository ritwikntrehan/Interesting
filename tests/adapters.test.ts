import { afterEach, describe, expect, it, vi } from "vitest";
import macro from "./fixtures/macrostrat.json";
import mrds from "./fixtures/mrds-page.json";
import quakes from "./fixtures/earthquakes.json";
import osm from "./fixtures/overpass.json";
import { EarthquakeAdapter, MacrostratAdapter, MrdsAdapter, OsmAdapter } from "../packages/adapters/src/index.ts";
import type { QueryDefinition } from "../packages/contracts/src/index.ts";

const input: QueryDefinition = { lat: 34.0522, lon: -118.2437, radius_km: 100, sources: ["macrostrat", "mrds", "osm", "earthquakes"], min_magnitude: 2.5, days: 30, limit: 250 };
afterEach(() => vi.unstubAllGlobals());
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });

describe("provider adapters", () => {
  it("normalizes Macrostrat references and uses lng parameter", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => json(macro)); vi.stubGlobal("fetch", fetchMock); const result = await new MacrostratAdapter().query(input);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("lng=-118.2437"); expect(result.records[0]?.properties.originalMapReference).toContain("Alvarez"); expect(result.records[0]?.geometry).toEqual({ type: "Point", coordinates: [-118.2437, 34.0522] });
  });
  it("constructs MRDS kilometer distance query and preserves upstream fields", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => json(mrds)); vi.stubGlobal("fetch", fetchMock); const result = await new MrdsAdapter().query(input); const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.searchParams.get("geometry")).toBe("-118.2437,34.0522"); expect(url.searchParams.get("units")).toBe("esriSRUnit_Kilometer"); expect(url.searchParams.get("resultOffset")).toBe("0"); expect(result.records[0]?.upstreamAttributes.dep_id).toBe("10008312");
  });
  it("paginates MRDS when transfer limit is exceeded", async () => {
    const first = structuredClone(mrds); first.properties.exceededTransferLimit = true; const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => json(mrds)).mockResolvedValueOnce(json(first)).mockResolvedValueOnce(json(mrds)); vi.stubGlobal("fetch", fetchMock);
    const result = await new MrdsAdapter().query({ ...input, limit: 2 }); expect(fetchMock).toHaveBeenCalledTimes(2); expect(new URL(String(fetchMock.mock.calls[1]![0])).searchParams.get("resultOffset")).toBe("1"); expect(result.records).toHaveLength(2);
  });
  it("uses bounded FDSN circle and time parameters", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => json(quakes)); vi.stubGlobal("fetch", fetchMock); const result = await new EarthquakeAdapter().query(input); const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.searchParams.get("maxradiuskm")).toBe("100"); expect(url.searchParams.get("minmagnitude")).toBe("2.5"); expect(url.searchParams.get("starttime")).toBeTruthy(); expect(result.records[0]?.observedAt).toBe("2023-11-14T22:13:20.000Z");
  });
  it("posts a conservative Overpass allow-list and handles way centers", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => json(osm)); vi.stubGlobal("fetch", fetchMock); const result = await new OsmAdapter().query(input); const init = fetchMock.mock.calls[0]![1]!;
    expect(init.method).toBe("POST"); expect(String(init.body)).toContain("amenity%3Dferry_terminal"); expect(result.records[1]?.coordinateQuality.flags).toContain("derived-center");
  });
  it("refuses expensive Overpass radii", async () => { const result = await new OsmAdapter().query({ ...input, radius_km: 101 }); expect(result.status.state).toBe("unavailable"); expect(result.status.message).toContain("limited to 100 km"); });
});
