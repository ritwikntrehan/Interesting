import { createAdapters } from "../packages/adapters/src/index.ts";
import { analyzeContext, compareRegions } from "../packages/analytics/src/index.ts";
import { FederationOrchestrator } from "../packages/orchestrator/src/index.ts";

const regions = [
  { name: "Los Angeles", lat: 34.0522, lon: -118.2437 },
  { name: "Vandenberg / Santa Barbara", lat: 34.742, lon: -120.5724 },
  { name: "Tokyo Bay", lat: 35.6762, lon: 139.6503 }
];
const orchestrator = new FederationOrchestrator(createAdapters());
const analyses = [];
for (const region of regions) {
  const context = await orchestrator.buildContext({ lat: region.lat, lon: region.lon, radius_km: 100, sources: ["macrostrat", "mrds", "osm", "earthquakes"], min_magnitude: 2.5, days: 30, limit: 100 }, { bypassCache: true });
  const analysis = analyzeContext(context); analyses.push(analysis);
  const workingSources = context.statuses.filter((status) => ["live", "partial"].includes(status.state)).length;
  console.log(JSON.stringify({ region: region.name, counts: context.counts, states: Object.fromEntries(context.statuses.map((status) => [status.sourceId, status.state])), findings: analysis.findings.map((finding) => finding.title), clusters: analysis.clusters.mineralOccurrenceClusters.length, cappedSources: analysis.sample.cappedSources }));
  if (workingSources < 3 || analysis.sample.totalRecords === 0) throw new Error(`${region.name}: expected records from at least three live/partial sources`);
  if (analysis.findings.some((finding) => !finding.supportingRecordIds.length)) throw new Error(`${region.name}: finding without supporting record IDs`);
}
const comparison = compareRegions(analyses[0]!, analyses[1]!);
console.log(JSON.stringify({ comparison: "Los Angeles vs Vandenberg / Santa Barbara", leadingDifference: comparison.commodityDifferences[0] ?? null, sharedGeology: comparison.geology.sharedAgeLabels.slice(0, 5), dataAvailability: comparison.dataAvailability }));
if (comparison.dataAvailability.length !== 4) throw new Error("Expected four-source comparison availability table");
