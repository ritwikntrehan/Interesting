import { describe, expect, it } from "vitest";
import { analyzeContext, compareRegions } from "../packages/analytics/src/index.ts";
import type { CanonicalRecord, ContextEnvelope, SourceId } from "../packages/contracts/src/index.ts";

const sources: SourceId[] = ["macrostrat", "mrds", "osm", "earthquakes"];

function record(id: string, sourceId: SourceId, recordType: CanonicalRecord["recordType"], lon: number, lat: number, properties: Record<string, unknown>): CanonicalRecord {
  return { id, sourceId, datasetId: `${sourceId}-test`, datasetTitle: `${sourceId} test data`, upstreamId: id, recordType, geometry: { type: "Point", coordinates: [lon, lat] }, properties, upstreamAttributes: properties, sourceUrl: `https://example.test/${id}`, retrievedAt: "2026-01-01T00:00:00.000Z", observedAt: null, license: "test", attribution: "test", coordinateQuality: { precision: "fixture", flags: [] }, transformationVersion: "1.0.0", limitations: [] };
}

function context(lat: number, lon: number, rows: CanonicalRecord[], partial: SourceId[] = []): ContextEnvelope {
  const bySource = Object.fromEntries(sources.map((source) => [source, rows.filter((row) => row.sourceId === source).length])) as Record<SourceId, number>;
  return { apiVersion: "v1", query: { lat, lon, radius_km: 100, sources, min_magnitude: 2.5, days: 30, limit: 250, requestedAt: "2026-01-01T00:00:00.000Z" }, statuses: sources.map((sourceId) => ({ sourceId, state: partial.includes(sourceId) ? "partial" : "live", recordCount: bySource[sourceId], retrievedAt: "2026-01-01T00:00:00.000Z", durationMs: 1 })), counts: { total: rows.length, bySource }, geojson: { type: "FeatureCollection", features: rows.map((row) => ({ type: "Feature", id: row.id, geometry: row.geometry, properties: row })) }, provenance: { transformationVersion: "1.0.0", sourceCatalogVersion: "test", deterministic: true }, limitations: ["Fixture coverage limitation"] };
}

describe("regional analytics", () => {
  it("computes evidence-linked composition, distances, clusters, and capped-sample disclosure", () => {
    const rows = [
      record("mrds:1", "mrds", "mineral_occurrence", -118.24, 34.05, { name: "A", commodityCodes: ["AU", "CU"] }),
      record("mrds:2", "mrds", "mineral_occurrence", -118.23, 34.06, { name: "B", commodityCodes: ["AU"] }),
      record("mrds:3", "mrds", "mineral_occurrence", -118.22, 34.04, { name: "C", commodityCodes: ["AU"] }),
      record("macrostrat:1", "macrostrat", "geology", -118.24, 34.05, { ageInterval: "Cenozoic", lithology: "sedimentary" }),
      record("osm:1", "osm", "mapped_port", -118.2, 34.0, { name: "Test Harbor" }),
      record("earthquakes:1", "earthquakes", "earthquake", -118.3, 34.1, { magnitude: 3.4 })
    ];
    const analysis = analyzeContext(context(34.0522, -118.2437, rows, ["mrds"]));
    expect(analysis.commodities.composition[0]).toMatchObject({ label: "AU", count: 3, share: 1 });
    expect(analysis.clusters.mineralOccurrenceClusters[0]?.supportingRecordIds).toHaveLength(3);
    expect(analysis.distances.find((item) => item.sourceId === "mrds")?.medianKm).toBeTypeOf("number");
    expect(analysis.findings.every((finding) => finding.classification === "computed_observation" && finding.supportingRecordIds.length > 0)).toBe(true);
    expect(analysis.sample.cappedSources).toEqual(["mrds"]);
    expect(analysis.sample.disclosure).toContain("returned samples only");
  });

  it("compares equivalent regional samples without claiming resource abundance", () => {
    const a = analyzeContext(context(34, -118, [
      record("a1", "mrds", "mineral_occurrence", -118, 34, { commodityCodes: ["AU"] }),
      record("a2", "mrds", "mineral_occurrence", -118.01, 34.01, { commodityCodes: ["AU"] }),
      record("ga", "macrostrat", "geology", -118, 34, { ageInterval: "Cenozoic" })
    ]));
    const b = analyzeContext(context(35, 139, [
      record("b1", "mrds", "mineral_occurrence", 139, 35, { commodityCodes: ["CU"] }),
      record("gb", "macrostrat", "geology", 139, 35, { ageInterval: "Mesozoic" })
    ]));
    const comparison = compareRegions(a, b);
    expect(comparison.commodityDifferences.find((item) => item.commodity === "AU")?.percentagePointDifference).toBe(100);
    expect(comparison.geology.onlyRegionA).toEqual(["Cenozoic"]);
    expect(comparison.limitations.join(" ")).toContain("not estimates of total resource abundance");
    expect(comparison.dataAvailability).toHaveLength(4);
  });
});
