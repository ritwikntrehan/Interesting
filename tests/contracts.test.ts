import { describe, expect, it } from "vitest";
import { QuerySchema, stableRecordId } from "../packages/contracts/src/index.ts";

describe("canonical query contract", () => {
  it("coerces bounded URL parameters and deduplicates sources", () => {
    const value = QuerySchema.parse({ lat: "34.0522", lon: "-118.2437", radius_km: "100", sources: "mrds,mrds,osm" });
    expect(value).toMatchObject({ lat: 34.0522, lon: -118.2437, radius_km: 100, sources: ["mrds", "osm"], days: 30, limit: 250 });
  });
  it.each([{ lat: 91, lon: 0 }, { lat: 0, lon: 181 }, { lat: 0, lon: 0, radius_km: 251 }, { lat: 0, lon: 0, radius_km: 0 }])("rejects unsafe bounds %#", (input) => expect(QuerySchema.safeParse(input).success).toBe(false));
  it("creates stable source-scoped IDs", () => expect(stableRecordId("osm", "way/1")).toBe("osm:way%2F1"));
});
