import { useMemo, useState } from "react";
import type { CanonicalRecord, ContextEnvelope, SourceId } from "../../../packages/contracts/src/index.ts";
import { SOURCE_CATALOG } from "../../../packages/adapters/src/catalog.ts";
import { MapView } from "./MapView.tsx";

const allSources: SourceId[] = ["macrostrat", "mrds", "osm", "earthquakes"];
const labels: Record<SourceId, string> = { macrostrat: "Geology", mrds: "Mineral occurrences", osm: "Mapped ports", earthquakes: "Earthquakes" };

function initial() { const p = new URLSearchParams(location.search); return { lat: Number(p.get("lat") || 34.0522), lon: Number(p.get("lon") || -118.2437), radius: Number(p.get("radius_km") || 100), sources: (p.get("sources")?.split(",").filter((s): s is SourceId => allSources.includes(s as SourceId)) || allSources), minMagnitude: Number(p.get("min_magnitude") || 2.5), days: Number(p.get("days") || 30) }; }

export function App() {
  const start = initial(); const [lat, setLat] = useState(start.lat); const [lon, setLon] = useState(start.lon); const [radius, setRadius] = useState(start.radius); const [sources, setSources] = useState<SourceId[]>(start.sources); const [minMagnitude, setMinMagnitude] = useState(start.minMagnitude); const [days, setDays] = useState(start.days);
  const [data, setData] = useState<ContextEnvelope | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null); const [selected, setSelected] = useState<string | null>(null);
  const record = useMemo(() => data?.geojson.features.find((f) => f.id === selected)?.properties ?? null, [data, selected]);
  async function run() {
    setLoading(true); setError(null); setSelected(null); const params = new URLSearchParams({ lat: String(lat), lon: String(lon), radius_km: String(radius), sources: sources.join(","), min_magnitude: String(minMagnitude), days: String(days), limit: "250" }); history.replaceState(null, "", `?${params}`);
    try { const response = await fetch(`/api/v1/context?${params}`); const body = await response.json() as ContextEnvelope & { error?: { message?: string } }; if (!response.ok) throw new Error(body.error?.message || `Request failed (${response.status})`); setData(body); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Query failed"); } finally { setLoading(false); }
  }
  function download() { if (!data) return; const blob = new Blob([JSON.stringify(data.geojson, null, 2)], { type: "application/geo+json" }); const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = `world-data-context-${lat}-${lon}.geojson`; anchor.click(); URL.revokeObjectURL(anchor.href); }
  function toggle(id: SourceId) { setSources((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]); }
  return <div className="app">
    <header><div><span className="eyebrow">SOURCE-TRACEABLE GEOSPATIAL RESEARCH</span><h1>World Data Federation</h1></div><div className="header-links"><a href="/api/v1/openapi.json">OpenAPI</a><a href="/api/v1/sources">Source catalog</a><span className="live-dot">Deterministic API</span></div></header>
    <main>
      <aside className="controls panel">
        <div className="section-title"><span>01</span><h2>Define location</h2></div>
        <p className="hint">Enter WGS84 coordinates or click the map.</p>
        <div className="coord-grid"><label>Latitude<input type="number" step="0.0001" min="-90" max="90" value={lat} onChange={(e) => setLat(Number(e.target.value))} /></label><label>Longitude<input type="number" step="0.0001" min="-180" max="180" value={lon} onChange={(e) => setLon(Number(e.target.value))} /></label></div>
        <label>Radius <span>{radius} km</span><input type="range" min="1" max="250" value={radius} onChange={(e) => setRadius(Number(e.target.value))} /></label>
        <div className="section-title"><span>02</span><h2>Select sources</h2></div>
        <div className="source-toggles">{allSources.map((id) => <label className={`source-toggle ${sources.includes(id) ? "active" : ""}`} key={id}><input type="checkbox" checked={sources.includes(id)} onChange={() => toggle(id)} /><i className={`legend ${id}`} /> <span><b>{labels[id]}</b><small>{SOURCE_CATALOG[id].provider}</small></span></label>)}</div>
        <details><summary>Earthquake filters</summary><label>Minimum magnitude<input type="number" min="-1" max="10" step="0.1" value={minMagnitude} onChange={(e) => setMinMagnitude(Number(e.target.value))} /></label><label>Lookback (days)<input type="number" min="1" max="365" value={days} onChange={(e) => setDays(Number(e.target.value))} /></label></details>
        <button className="run" disabled={loading || !sources.length} onClick={run}>{loading ? <><span className="spinner" /> Querying providers…</> : "Run federated query"}</button>
        <p className="budget">Bounded to 250 records/source · cached responsibly</p>
      </aside>
      <section className="workspace">
        <div className="map-shell"><MapView lat={lat} lon={lon} radiusKm={radius} data={data} onLocation={(newLat, newLon) => { setLat(newLat); setLon(newLon); }} onSelect={setSelected} /><div className="map-legend">{allSources.map((id) => <span key={id}><i className={`legend ${id}`} />{labels[id]}</span>)}</div><div className="map-instruction">Click map to set query point</div></div>
        {error && <div className="error"><b>Query failed</b><span>{error}</span></div>}
        <section className="results panel">
          <div className="results-head"><div><span className="eyebrow">FEDERATED RESPONSE</span><h2>{data ? `${data.counts.total} normalized records` : "Run a query to inspect real records"}</h2></div>{data && <button className="download" onClick={download}>Download GeoJSON</button>}</div>
          {data && <><div className="status-grid">{data.statuses.map((s) => <div className="status" key={s.sourceId}><div><i className={`status-dot ${s.state}`} /><b>{labels[s.sourceId]}</b></div><strong>{s.recordCount}</strong><small>{s.state}{s.cacheAgeSeconds !== undefined ? ` · cache ${s.cacheAgeSeconds}s` : ` · ${s.durationMs}ms`}</small>{s.message && <span title={s.message}>ⓘ {s.message}</span>}</div>)}</div>
          <div className="table-wrap"><table><thead><tr><th>Type</th><th>Record</th><th>Source</th><th>Retrieved</th><th /></tr></thead><tbody>{data.geojson.features.map(({ id, properties: r }) => <tr key={id} className={selected === id ? "selected" : ""} onClick={() => setSelected(id)}><td><i className={`legend ${r.sourceId}`} /> {r.recordType.replaceAll("_", " ")}</td><td><b>{String(r.properties.name || r.upstreamId)}</b><small>{secondary(r)}</small></td><td>{r.datasetTitle}</td><td>{new Date(r.retrievedAt).toLocaleString()}</td><td>›</td></tr>)}</tbody></table>{data.counts.total === 0 && <div className="empty">No records matched these bounded source queries. Check each source status above.</div>}</div></>}
          {!data && <div className="empty-state"><div className="crosshair">⌖</div><p>The federation keeps each provider independent. One outage won’t erase successful results from the others.</p></div>}
        </section>
      </section>
      <aside className={`detail panel ${record ? "open" : ""}`}>{record ? <RecordDetail record={record} close={() => setSelected(null)} /> : <><div className="section-title"><span>03</span><h2>Inspect provenance</h2></div><p className="hint">Select a mapped point or table row to see unmodified upstream attributes, attribution, precision, and limitations.</p><div className="notice"><b>Interpret with care</b><p>These datasets describe different phenomena and dates. Co-location does not establish causality or risk.</p></div></>}</aside>
    </main>
    <footer><span>Canonical contract v1.0.0</span><span>WGS84 · provider failures remain visible</span><a href="https://github.com/ritwikntrehan/world-data-federation">GitHub</a></footer>
  </div>;
}

function secondary(r: CanonicalRecord) { if (r.recordType === "earthquake") return `M ${r.properties.magnitude ?? "?"} · ${r.observedAt ? new Date(r.observedAt).toLocaleString() : "time unknown"}`; if (r.recordType === "geology") return String(r.properties.ageInterval || r.properties.lithology || "Map unit"); if (r.recordType === "mineral_occurrence") return String((r.properties.commodityCodes as string[] | undefined)?.join(", ") || "Commodities not listed"); return "Community-mapped infrastructure"; }
function RecordDetail({ record, close }: { record: CanonicalRecord; close(): void }) { return <><button className="close" onClick={close}>×</button><span className="eyebrow">{record.recordType.replaceAll("_", " ")}</span><h2>{String(record.properties.name || record.upstreamId)}</h2><dl><dt>Dataset</dt><dd>{record.datasetTitle}</dd><dt>Upstream ID</dt><dd>{record.upstreamId}</dd><dt>Observed / published</dt><dd>{record.observedAt ? new Date(record.observedAt).toLocaleString() : "Not published"}</dd><dt>Retrieved</dt><dd>{new Date(record.retrievedAt).toLocaleString()}</dd><dt>License</dt><dd>{record.license}</dd><dt>Coordinate quality</dt><dd>{record.coordinateQuality.precision || "Not specified"}</dd></dl><a className="source-link" href={record.sourceUrl} target="_blank" rel="noreferrer">Open original source ↗</a><h3>Normalized properties</h3><pre>{JSON.stringify(record.properties, null, 2)}</pre><h3>Unmodified upstream attributes</h3><pre>{JSON.stringify(record.upstreamAttributes, null, 2)}</pre><h3>Limitations</h3><ul>{record.limitations.map((item) => <li key={item}>{item}</li>)}</ul><p className="attribution">{record.attribution}</p></>; }
