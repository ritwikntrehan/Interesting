import type { CanonicalRecord, ContextEnvelope, SourceId } from "../../contracts/src/index.ts";
import { haversineKm } from "../../orchestrator/src/index.ts";

export interface MetricSlice { key: string; label: string; count: number; share: number; supportingRecordIds: string[] }
export interface DistanceBin { label: string; minKm: number; maxKm: number; count: number; supportingRecordIds: string[] }
export interface DistanceDistribution { sourceId: SourceId; count: number; medianKm: number | null; p90Km: number | null; bins: DistanceBin[] }
export interface SpatialCluster { id: string; label: string; recordCount: number; center: [number, number]; radiusKm: number; topCommodities: string[]; supportingRecordIds: string[] }
export interface ComputedFinding {
  id: string; classification: "computed_observation"; title: string; statement: string;
  metric: { value: number | string; unit?: string; method: string };
  supportingRecordIds: string[]; limitations: string[];
}
export interface RegionalAnalysis {
  analysisVersion: "1.0.0";
  generatedAt: string;
  query: ContextEnvelope["query"];
  sample: { totalRecords: number; bySource: Record<SourceId, number>; cappedSources: SourceId[]; disclosure: string };
  findings: ComputedFinding[];
  commodities: { occurrenceRecordCount: number; composition: MetricSlice[]; note: string };
  geology: { interpretationCount: number; ageDistribution: MetricSlice[]; lithologyDistribution: MetricSlice[]; note: string };
  distances: DistanceDistribution[];
  clusters: { method: string; epsilonKm: number; minPoints: number; mineralOccurrenceClusters: SpatialCluster[] };
  seismicity: { eventCount: number; maximumMagnitude: number | null; nearestEventKm: number | null; supportingRecordIds: string[]; note: string };
  infrastructure: { mappedPortCount: number; nearestMappedFeatureKm: number | null; nearestMappedFeatureName: string | null; supportingRecordIds: string[]; note: string };
  sourceStatuses: ContextEnvelope["statuses"];
  limitations: string[];
}

export interface RegionComparison {
  comparisonVersion: "1.0.0"; generatedAt: string; regionA: RegionalAnalysis; regionB: RegionalAnalysis;
  commodityDifferences: Array<{ commodity: string; regionAShare: number; regionBShare: number; percentagePointDifference: number; supportingRecordIdsA: string[]; supportingRecordIdsB: string[] }>;
  geology: { sharedAgeLabels: string[]; onlyRegionA: string[]; onlyRegionB: string[] };
  spatial: { clusterCountA: number; clusterCountB: number; medianMineralDistanceKmA: number | null; medianMineralDistanceKmB: number | null };
  dataAvailability: Array<{ sourceId: SourceId; regionAState: string; regionBState: string; regionACount: number; regionBCount: number }>;
  interpretation: string[]; limitations: string[];
}

const sourceIds: SourceId[] = ["macrostrat", "mrds", "osm", "earthquakes"];

export function analyzeContext(context: ContextEnvelope): RegionalAnalysis {
  const records = context.geojson.features.map((feature) => feature.properties);
  const mineral = records.filter((record) => record.recordType === "mineral_occurrence");
  const geologyRecords = records.filter((record) => record.recordType === "geology");
  const quakes = records.filter((record) => record.recordType === "earthquake");
  const ports = records.filter((record) => record.recordType === "mapped_port");
  const commodityComposition = categorical(mineral, (record) => asStrings(record.properties.commodityCodes));
  const ageDistribution = categorical(geologyRecords, (record) => [asLabel(record.properties.ageInterval, "Unspecified age")]);
  const lithologyDistribution = categorical(geologyRecords, (record) => [asLabel(record.properties.lithology, "Unspecified lithology")]);
  const epsilonKm = clamp(context.query.radius_km * 0.12, 5, 25);
  const clusters = dbscan(mineral, epsilonKm, 3);
  const distanceRows = sourceIds.map((sourceId) => distanceDistribution(records.filter((record) => record.sourceId === sourceId), sourceId, context.query.lon, context.query.lat, context.query.radius_km));
  const quakeDistances = quakes.map((record) => distance(record, context.query.lon, context.query.lat)).filter(isNumber);
  const maxMagnitude = maxOrNull(quakes.map((record) => numberOrNull(record.properties.magnitude)).filter(isNumber));
  const portRows = ports.map((record) => ({ record, distance: distance(record, context.query.lon, context.query.lat) })).filter((row): row is { record: CanonicalRecord; distance: number } => row.distance !== null).sort((a, b) => a.distance - b.distance);
  const findings: ComputedFinding[] = [];
  const topCommodity = commodityComposition[0];
  if (topCommodity) findings.push({ id: "top-reported-commodity", classification: "computed_observation", title: "Most frequently reported commodity", statement: `${topCommodity.label} appears in ${topCommodity.count} of ${mineral.length} returned MRDS occurrence records (${percent(topCommodity.share)}).`, metric: { value: topCommodity.count, unit: "returned records", method: "Count of returned MRDS records containing the commodity code" }, supportingRecordIds: topCommodity.supportingRecordIds, limitations: ["This describes the returned, potentially capped historical sample; it is not a resource-abundance or production estimate."] });
  const topAge = ageDistribution[0];
  if (topAge) findings.push({ id: "geologic-interpretations", classification: "computed_observation", title: "Overlapping geologic context", statement: `${topAge.label} is the most frequent age label among ${geologyRecords.length} overlapping Macrostrat map interpretations at the selected point.`, metric: { value: topAge.count, unit: "map interpretations", method: "Count of returned Macrostrat map units by normalized age label" }, supportingRecordIds: topAge.supportingRecordIds, limitations: ["Overlapping compilations have different scales and are not independent observations."] });
  const largestCluster = clusters[0];
  if (largestCluster) findings.push({ id: "largest-mineral-cluster", classification: "computed_observation", title: "Densest returned occurrence cluster", statement: `${largestCluster.recordCount} returned mineral occurrences form the largest proximity cluster, centered ${formatCoord(largestCluster.center)}.`, metric: { value: largestCluster.recordCount, unit: "returned records", method: `DBSCAN-style proximity grouping with ${epsilonKm.toFixed(1)} km neighborhood and minimum 3 records` }, supportingRecordIds: largestCluster.supportingRecordIds, limitations: ["Cluster shape depends on query radius, record cap, source coverage, and coordinate precision."] });
  if (quakes.length) findings.push({ id: "recent-seismicity", classification: "computed_observation", title: "Recent seismic observations", statement: `${quakes.length} returned event${quakes.length === 1 ? "" : "s"} met the ${context.query.min_magnitude}+ magnitude and ${context.query.days}-day filters; maximum returned magnitude is ${maxMagnitude ?? "unknown"}.`, metric: { value: maxMagnitude ?? "unknown", unit: "magnitude", method: "Maximum magnitude in returned USGS catalog events" }, supportingRecordIds: quakes.map((record) => record.id), limitations: ["Catalog events may be revised and do not constitute a hazard forecast or risk certification."] });
  if (portRows[0]) findings.push({ id: "nearest-mapped-infrastructure", classification: "computed_observation", title: "Nearest mapped harbor infrastructure", statement: `${String(portRows[0].record.properties.name)} is ${portRows[0].distance.toFixed(1)} km from the query center.`, metric: { value: Number(portRows[0].distance.toFixed(1)), unit: "km", method: "Haversine distance to nearest returned OpenStreetMap harbor/port feature" }, supportingRecordIds: [portRows[0].record.id], limitations: ["Community mapping does not verify throughput, operating status, accessibility, or navigability."] });
  const cappedSources = context.statuses.filter((status) => status.state === "partial").map((status) => status.sourceId);
  return {
    analysisVersion: "1.0.0", generatedAt: new Date().toISOString(), query: context.query,
    sample: { totalRecords: records.length, bySource: context.counts.bySource, cappedSources, disclosure: cappedSources.length ? `At least one source reached the requested record ceiling (${cappedSources.join(", ")}). Counts and shares describe returned samples only.` : "Counts and shares describe returned records and source coverage, not total real-world abundance." },
    findings, commodities: { occurrenceRecordCount: mineral.length, composition: commodityComposition, note: "A record may contain multiple commodity codes, so shares can sum above 100%. Shares use returned MRDS occurrence records as the denominator." },
    geology: { interpretationCount: geologyRecords.length, ageDistribution, lithologyDistribution, note: "Macrostrat can return overlapping source maps at several scales; distributions summarize interpretations, not surface-area coverage." },
    distances: distanceRows, clusters: { method: "Deterministic DBSCAN-style great-circle proximity grouping", epsilonKm, minPoints: 3, mineralOccurrenceClusters: clusters },
    seismicity: { eventCount: quakes.length, maximumMagnitude: maxMagnitude, nearestEventKm: minOrNull(quakeDistances), supportingRecordIds: quakes.map((record) => record.id), note: "Filtered recent observations; not a forecast." },
    infrastructure: { mappedPortCount: ports.length, nearestMappedFeatureKm: portRows[0]?.distance ?? null, nearestMappedFeatureName: portRows[0] ? String(portRows[0].record.properties.name) : null, supportingRecordIds: ports.map((record) => record.id), note: "Community-mapped infrastructure; not verified capacity or access." },
    sourceStatuses: context.statuses, limitations: [...context.limitations, "All computed metrics describe the returned source samples under the displayed query parameters."]
  };
}

export function compareRegions(regionA: RegionalAnalysis, regionB: RegionalAnalysis): RegionComparison {
  const a = new Map(regionA.commodities.composition.map((item) => [item.key, item])); const b = new Map(regionB.commodities.composition.map((item) => [item.key, item]));
  const commodityDifferences = [...new Set([...a.keys(), ...b.keys()])].map((commodity) => ({ commodity, regionAShare: a.get(commodity)?.share ?? 0, regionBShare: b.get(commodity)?.share ?? 0, percentagePointDifference: round(((a.get(commodity)?.share ?? 0) - (b.get(commodity)?.share ?? 0)) * 100, 1), supportingRecordIdsA: a.get(commodity)?.supportingRecordIds ?? [], supportingRecordIdsB: b.get(commodity)?.supportingRecordIds ?? [] })).sort((x, y) => Math.abs(y.percentagePointDifference) - Math.abs(x.percentagePointDifference)).slice(0, 15);
  const ageA = new Set(regionA.geology.ageDistribution.map((item) => item.label)); const ageB = new Set(regionB.geology.ageDistribution.map((item) => item.label));
  const mineralDistance = (analysis: RegionalAnalysis) => analysis.distances.find((item) => item.sourceId === "mrds")?.medianKm ?? null;
  const interpretation = [
    commodityDifferences[0] ? `${commodityDifferences[0].commodity} has the largest returned-sample share difference (${Math.abs(commodityDifferences[0].percentagePointDifference).toFixed(1)} percentage points).` : "Neither returned sample contains coded MRDS commodities.",
    `${regionA.clusters.mineralOccurrenceClusters.length} proximity clusters were computed for region A and ${regionB.clusters.mineralOccurrenceClusters.length} for region B.`,
    `The regions share ${[...ageA].filter((value) => ageB.has(value)).length} returned geological age label(s).`
  ];
  return {
    comparisonVersion: "1.0.0", generatedAt: new Date().toISOString(), regionA, regionB, commodityDifferences,
    geology: { sharedAgeLabels: [...ageA].filter((value) => ageB.has(value)), onlyRegionA: [...ageA].filter((value) => !ageB.has(value)), onlyRegionB: [...ageB].filter((value) => !ageA.has(value)) },
    spatial: { clusterCountA: regionA.clusters.mineralOccurrenceClusters.length, clusterCountB: regionB.clusters.mineralOccurrenceClusters.length, medianMineralDistanceKmA: mineralDistance(regionA), medianMineralDistanceKmB: mineralDistance(regionB) },
    dataAvailability: sourceIds.map((sourceId) => { const sa = regionA.sourceStatuses.find((item) => item.sourceId === sourceId); const sb = regionB.sourceStatuses.find((item) => item.sourceId === sourceId); return { sourceId, regionAState: sa?.state ?? "not selected", regionBState: sb?.state ?? "not selected", regionACount: sa?.recordCount ?? 0, regionBCount: sb?.recordCount ?? 0 }; }),
    interpretation, limitations: ["Comparison shares and distributions describe equivalent returned samples, not estimates of total resource abundance.", "A capped, unavailable, or incomplete source can materially affect a difference; inspect data availability before interpreting it.", ...new Set([...regionA.limitations, ...regionB.limitations])]
  };
}

function categorical(records: CanonicalRecord[], getValues: (record: CanonicalRecord) => string[]): MetricSlice[] {
  const values = new Map<string, { count: number; ids: string[]; label: string }>();
  for (const record of records) for (const raw of new Set(getValues(record).filter(Boolean))) { const key = raw.trim().toUpperCase(); const row = values.get(key) ?? { count: 0, ids: [], label: raw.trim() }; row.count++; row.ids.push(record.id); values.set(key, row); }
  return [...values.entries()].map(([key, row]) => ({ key, label: row.label, count: row.count, share: records.length ? row.count / records.length : 0, supportingRecordIds: row.ids })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function distanceDistribution(records: CanonicalRecord[], sourceId: SourceId, lon: number, lat: number, radiusKm: number): DistanceDistribution {
  const rows = records.map((record) => ({ id: record.id, value: distance(record, lon, lat) })).filter((row): row is { id: string; value: number } => row.value !== null).sort((a, b) => a.value - b.value);
  const boundaries = [0, .25, .5, .75, 1].map((value) => value * radiusKm);
  const bins = boundaries.slice(0, -1).map((minKm, index) => { const maxKm = boundaries[index + 1]!; const matching = rows.filter((row) => row.value >= minKm && (index === 3 ? row.value <= maxKm : row.value < maxKm)); return { label: `${minKm.toFixed(0)}–${maxKm.toFixed(0)} km`, minKm, maxKm, count: matching.length, supportingRecordIds: matching.map((row) => row.id) }; });
  return { sourceId, count: rows.length, medianKm: quantile(rows.map((row) => row.value), .5), p90Km: quantile(rows.map((row) => row.value), .9), bins };
}

function dbscan(records: CanonicalRecord[], epsilonKm: number, minPoints: number): SpatialCluster[] {
  const points = records.map((record) => ({ record, point: point(record) })).filter((row): row is { record: CanonicalRecord; point: [number, number] } => row.point !== null); const visited = new Set<number>(); const assigned = new Set<number>(); const output: SpatialCluster[] = [];
  const neighbors = (index: number) => points.map((_, candidate) => candidate).filter((candidate) => haversineKm(points[index]!.point, points[candidate]!.point) <= epsilonKm);
  for (let i = 0; i < points.length; i++) { if (visited.has(i)) continue; visited.add(i); const near = neighbors(i); if (near.length < minPoints) continue; const members = new Set<number>([i]); const queue = [...near]; while (queue.length) { const next = queue.shift()!; if (!visited.has(next)) { visited.add(next); const expanded = neighbors(next); if (expanded.length >= minPoints) for (const candidate of expanded) if (!queue.includes(candidate)) queue.push(candidate); } if (!assigned.has(next)) members.add(next); } for (const member of members) assigned.add(member); const selected = [...members].map((index) => points[index]!); const center: [number, number] = [average(selected.map((row) => row.point[0])), average(selected.map((row) => row.point[1]))]; const commodity = categorical(selected.map((row) => row.record), (record) => asStrings(record.properties.commodityCodes)); output.push({ id: `mineral-cluster-${output.length + 1}`, label: `Cluster ${output.length + 1}`, recordCount: selected.length, center, radiusKm: maxOrNull(selected.map((row) => haversineKm(center, row.point))) ?? 0, topCommodities: commodity.slice(0, 3).map((item) => item.label), supportingRecordIds: selected.map((row) => row.record.id) }); }
  return output.sort((a, b) => b.recordCount - a.recordCount);
}

function point(record: CanonicalRecord): [number, number] | null { return record.geometry.type === "Point" ? [record.geometry.coordinates[0], record.geometry.coordinates[1]] : null; }
function distance(record: CanonicalRecord, lon: number, lat: number): number | null { const p = point(record); return p ? haversineKm([lon, lat], p) : null; }
function asStrings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : typeof value === "string" ? [value] : []; }
function asLabel(value: unknown, fallback: string) { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function isNumber(value: number | null): value is number { return value !== null && Number.isFinite(value); }
function numberOrNull(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function quantile(values: number[], q: number): number | null { if (!values.length) return null; const index = (values.length - 1) * q; const lower = Math.floor(index); const upper = Math.ceil(index); return round((values[lower]! * (upper - index)) + (values[upper]! * (index - lower)), 2); }
function minOrNull(values: number[]) { return values.length ? Math.min(...values) : null; }
function maxOrNull(values: number[]) { return values.length ? Math.max(...values) : null; }
function average(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function round(value: number, places: number) { return Number(value.toFixed(places)); }
function percent(value: number) { return `${(value * 100).toFixed(1)}%`; }
function formatCoord(value: [number, number]) { return `${value[1].toFixed(3)}, ${value[0].toFixed(3)}`; }
