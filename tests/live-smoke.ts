import { createAdapters } from "../packages/adapters/src/index.ts";
import { FederationOrchestrator } from "../packages/orchestrator/src/index.ts";

const context = await new FederationOrchestrator(createAdapters()).buildContext({ lat: 34.0522, lon: -118.2437, radius_km: 100, sources: ["macrostrat", "mrds", "osm", "earthquakes"], min_magnitude: 2.5, days: 30, limit: 100 }, { bypassCache: true });
console.log(JSON.stringify({ query: context.query, counts: context.counts, statuses: context.statuses, sampleRecords: context.geojson.features.slice(0, 8).map((f) => ({ id: f.id, name: f.properties.properties.name, sourceUrl: f.properties.sourceUrl })) }, null, 2));
const successful = context.statuses.filter((status) => ["live", "partial"].includes(status.state) && status.recordCount > 0).length;
if (successful < 3) { console.error(`Expected at least three successful sources with records, received ${successful}`); process.exitCode = 1; }
