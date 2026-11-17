import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaceSearchError, PlaceSearchService } from "../packages/geocoding/src/index.ts";

afterEach(() => vi.unstubAllGlobals());

describe("place search", () => {
  it("normalizes and caches explicit geocoder results", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ place_id: 1, osm_type: "relation", osm_id: 207359, display_name: "Vandenberg Space Force Base, Santa Barbara County, California, United States", name: "Vandenberg Space Force Base", lat: "34.742", lon: "-120.5724", type: "military", category: "boundary", boundingbox: ["34.5", "34.9", "-120.8", "-120.3"], licence: "© OpenStreetMap contributors" }]), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new PlaceSearchService(undefined, "https://geocoder.example.test/search");
    const first = await service.search("Vandenberg unique fixture");
    const second = await service.search("  vandenberg   unique fixture ");
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(first.results[0]).toMatchObject({ id: "relation/207359", name: "Vandenberg Space Force Base", lat: 34.742, lon: -120.5724 });
    expect(first.results[0]?.boundingBox).toEqual([34.5, -120.8, 34.9, -120.3]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid queries before contacting the provider", async () => {
    await expect(new PlaceSearchService(undefined, "https://geocoder.example.test/search").search("x")).rejects.toEqual(expect.objectContaining<Partial<PlaceSearchError>>({ status: 400 }));
  });
});
