import { describe, expect, it } from "vitest";
import type { DataAdapter, QueryDefinition } from "../packages/contracts/src/index.ts";
import { FederationOrchestrator, MemoryQueryCache } from "../packages/orchestrator/src/index.ts";

const input: QueryDefinition = { lat: 1, lon: 2, radius_km: 10, sources: ["macrostrat", "mrds"], min_magnitude: 2.5, days: 30, limit: 10 };
const adapter = (id: "macrostrat" | "mrds", fail = false): DataAdapter => ({ id, health: async () => ({ ok: true, latencyMs: 1 }), query: async () => ({ records: [], status: { sourceId: id, state: fail ? "unavailable" : "live", recordCount: 0, retrievedAt: new Date().toISOString(), durationMs: 1, ...(fail ? { message: "down" } : {}) } }) });
describe("federation orchestration", () => {
  it("keeps independent source failures visible", async () => { const value = await new FederationOrchestrator([adapter("macrostrat"), adapter("mrds", true)]).buildContext(input); expect(value.statuses.map((s) => s.state)).toEqual(["live", "unavailable"]); expect(value.provenance.deterministic).toBe(true); });
  it("returns coherent zero counts for all catalog sources", async () => { const value = await new FederationOrchestrator([adapter("macrostrat")]).buildContext({ ...input, sources: ["macrostrat"] }); expect(value.counts.bySource).toEqual({ macrostrat: 0, mrds: 0, osm: 0, earthquakes: 0 }); });
  it("memory cache expires into explicit cached state", async () => { const cache = new MemoryQueryCache(); const orchestration = new FederationOrchestrator([adapter("macrostrat")], cache, 60, 120); await orchestration.buildContext({ ...input, sources: ["macrostrat"] }); const value = await orchestration.buildContext({ ...input, sources: ["macrostrat"] }); expect(value.statuses[0]?.state).toBe("cached"); expect(value.statuses[0]?.cacheAgeSeconds).toBeDefined(); });
});
