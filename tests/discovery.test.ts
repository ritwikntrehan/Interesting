import { describe, expect, it } from "vitest";
import { analyzeContext, compareRegions } from "../packages/analytics/src/index.ts";
import type { CanonicalRecord, ContextEnvelope, SourceId } from "../packages/contracts/src/index.ts";
import { commodityLabel, discoverComparison, discoverRegion } from "../packages/discovery/src/index.ts";

const sourceIds: SourceId[] = ["macrostrat", "mrds", "osm", "earthquakes"];
function record(id: string, sourceId: SourceId, recordType: CanonicalRecord["recordType"], lon: number, lat: number, properties: Record<string, unknown>): CanonicalRecord { return { id, sourceId, datasetId: sourceId, datasetTitle: `${sourceId} fixture`, upstreamId: id, recordType, geometry: { type: "Point", coordinates: [lon, lat] }, properties, upstreamAttributes: properties, sourceUrl: `https://example.test/${id}`, retrievedAt: "2026-01-01T00:00:00Z", observedAt: null, license: "fixture", attribution: "fixture", coordinateQuality: { precision: "fixture", flags: [] }, transformationVersion: "1.0.0", limitations: [] }; }
function context(lat: number, lon: number, rows: CanonicalRecord[]): ContextEnvelope { const bySource = Object.fromEntries(sourceIds.map((id) => [id, rows.filter((row) => row.sourceId === id).length])) as Record<SourceId, number>; return { apiVersion: "v1", query: { lat, lon, radius_km: 100, sources: sourceIds, min_magnitude: 2.5, days: 30, limit: 250, requestedAt: "2026-01-01T00:00:00Z" }, statuses: sourceIds.map((sourceId) => ({ sourceId, state: "live", recordCount: bySource[sourceId], retrievedAt: "2026-01-01T00:00:00Z", durationMs: 1 })), counts: { total: rows.length, bySource }, geojson: { type: "FeatureCollection", features: rows.map((row) => ({ type: "Feature", id: row.id, geometry: row.geometry, properties: row })) }, provenance: { transformationVersion: "1.0.0", sourceCatalogVersion: "fixture", deterministic: true }, limitations: [] }; }

describe("geographic discovery engine", () => {
  it("turns spatial clusters and relationships into evidence-linked investigation paths", () => {
    const rows = [record("m1", "mrds", "mineral_occurrence", -157.86, 21.31, { name: "One", commodityCodes: ["AU", "CU"] }), record("m2", "mrds", "mineral_occurrence", -157.85, 21.32, { name: "Two", commodityCodes: ["AU"] }), record("m3", "mrds", "mineral_occurrence", -157.84, 21.3, { name: "Three", commodityCodes: ["AU"] }), record("g1", "macrostrat", "geology", -157.8581, 21.3099, { name: "Volcanic rocks", ageInterval: "Cenozoic", lithology: "volcanic" }), record("p1", "osm", "mapped_port", -157.87, 21.3, { name: "Harbor" }), record("q1", "earthquakes", "earthquake", -157.9, 21.34, { name: "M 3.1 event", magnitude: 3.1 })];
    const output = discoverRegion(context(21.3099, -157.8581, rows)); const cluster = output.discoveries.find((item) => item.kind === "concentration");
    expect(commodityLabel("AU")).toBe("Gold (AU)");
    expect(cluster?.headline).toContain("3 historical occurrences");
    expect(cluster?.explanation).toContain("Gold (AU)");
    expect(cluster?.supportingRecordIds).toEqual(expect.arrayContaining(["m1", "m2", "m3"]));
    expect(cluster?.relevantGeometry.features[0]?.geometry.type).toBe("Polygon");
    expect(cluster?.followUps.map((item) => item.action)).toEqual(expect.arrayContaining(["inspect_evidence", "compare_place", "explore_location"]));
    expect(output.discoveries.some((item) => item.kind === "infrastructure_relationship")).toBe(true);
    expect(output.discoveries.every((item) => item.supportingRecordIds.length > 0 && item.limitations.length > 0)).toBe(true);
  });

  it("creates drillable comparison discoveries with evidence on both sides", () => {
    const a = analyzeContext(context(34, -118, [record("a1", "mrds", "mineral_occurrence", -118, 34, { commodityCodes: ["AU"] })])); const b = analyzeContext(context(35, 139, [record("b1", "mrds", "mineral_occurrence", 139, 35, { commodityCodes: ["CU"] })]));
    const discoveries = discoverComparison(compareRegions(a, b));
    expect(discoveries[0]?.headline).toContain("Gold (AU)");
    expect(discoveries[0]?.supportingRecordIdsA).toEqual(["a1"]);
    expect(discoveries[0]?.limitations.join(" ")).toContain("not a measure of reserves");
  });
});
