import { createAdapters } from "../packages/adapters/src/index.ts";
import { analyzeContext, compareRegions } from "../packages/analytics/src/index.ts";
import { discoverComparison, discoverRegion } from "../packages/discovery/src/index.ts";
import { FederationOrchestrator } from "../packages/orchestrator/src/index.ts";

const regions = [
  { name: "Honolulu", lat: 21.3099, lon: -157.8581 },
  { name: "Los Angeles", lat: 34.0522, lon: -118.2437 },
  { name: "Tokyo Bay", lat: 35.6762, lon: 139.6503 },
  { name: "Vandenberg / Santa Barbara", lat: 34.742, lon: -120.5724 }
];
const orchestrator = new FederationOrchestrator(createAdapters()); const outputs = [];
for (const region of regions) {
  const context = await orchestrator.buildContext({ lat: region.lat, lon: region.lon, radius_km: 100, sources: ["macrostrat", "mrds", "osm", "earthquakes"], min_magnitude: 2.5, days: 30, limit: 100 }, { bypassCache: true }); const discovery = discoverRegion(context); outputs.push({ context, discovery });
  console.log(JSON.stringify({ region: region.name, records: context.counts.total, states: Object.fromEntries(context.statuses.map((status) => [status.sourceId, status.state])), discoveries: discovery.discoveries.map((item) => ({ kind: item.kind, headline: item.headline, evidence: item.supportingRecordIds.length, followUps: item.followUps.length })) }));
  if (!discovery.discoveries.length) throw new Error(`${region.name}: no computed discoveries`);
  if (discovery.discoveries.some((item) => !item.supportingRecordIds.length || !item.relevantGeometry.features.length || !item.followUps.length)) throw new Error(`${region.name}: incomplete discovery evidence path`);
}
const comparison = compareRegions(analyzeContext(outputs[1]!.context), analyzeContext(outputs[2]!.context)); const comparisonDiscoveries = discoverComparison(comparison);
console.log(JSON.stringify({ comparison: "Los Angeles vs Tokyo Bay", discoveries: comparisonDiscoveries.map((item) => ({ headline: item.headline, evidenceA: item.supportingRecordIdsA.length, evidenceB: item.supportingRecordIdsB.length })) }));
if (!comparisonDiscoveries.length) throw new Error("Los Angeles/Tokyo comparison produced no drillable discoveries");
