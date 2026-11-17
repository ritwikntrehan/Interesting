# World Data Federation

A functioning, source-traceable regional intelligence workbench for real public data. Search or choose a WGS84 region, query independent providers in parallel, compute reproducible patterns, compare equivalent regions, and inspect every metric against its supporting canonical records. Provider failures remain visible and do not discard successful results from other sources.

## What works

- **Macrostrat API v2:** point geology with age, lithology, scale, CC BY 4.0 licensing, and original-map references.
- **USGS MRDS:** bounded ArcGIS distance queries with verified kilometer units, WGS84 output, deterministic ordering, pagination, and a strict result budget. MRDS is prominently treated as a historical occurrence compilation—not current mine status, reserves, production, or viability.
- **OpenStreetMap Overpass:** a conservative allow-list of mapped harbor, ferry terminal, port, named pier, and seamark tags; POST requests, 100 km maximum, cache, timeout, and explicit outage diagnostics.
- **USGS Earthquake Catalog:** bounded FDSN circle queries with configurable time window and magnitude threshold.
- **Canonical contract:** stable IDs, WGS84 geometry, normalized and unmodified upstream fields, provenance, license, timestamps, quality flags, transformation version, and limitations.
- **Regional analytics:** returned-sample commodity and geology distributions, radial distance bins, deterministic great-circle proximity clusters, recent seismic summaries, nearest mapped infrastructure, evidence-linked computed observations, and explicit cap disclosures.
- **Region comparison:** equivalent query parameters, percentage-point composition differences, shared/unique geology labels, spatial metrics, and side-by-side source availability.
- **Place search:** explicit-submit Nominatim lookup with 1 request/second public-endpoint guard, identifying User-Agent, 30-day D1 cache, attribution, and an operator-selectable endpoint. It is deliberately not autocomplete.
- **One Worker:** Hono REST API, official MCP Streamable HTTP endpoint, D1 query/place cache, rate budget, per-isolate metrics, and built React/MapLibre assets.
- **Partial results:** adapters run independently; `live`, `cached`, `stale`, `partial`, `unavailable`, and `unsupported` states are preserved.
- **Linked investigation UI:** charts, findings, map features, and canonical record details share the same supporting record IDs; analysis URLs are shareable and replayable.

This is a complete first vertical slice, not a claim of complete global data coverage.

## Quick start

Requirements: Node.js 22.12+ and npm 10+.

```bash
npm install
npm run db:migrate:local
npm run dev
```

Open `http://localhost:5173`. The Vite development server proxies `/api` and `/mcp` to the Worker on port 8787.

Quality commands:

```bash
npm run typecheck
npm test
npm run build
npm run test:live   # opt-in: calls all four public upstream services
npm run test:live:analytics # LA, Vandenberg/Santa Barbara, Tokyo Bay + comparison
```

The regional live test uses Los Angeles, Vandenberg/Santa Barbara, and Tokyo Bay with equivalent 100 km queries, then compares Los Angeles with Vandenberg/Santa Barbara. It verifies evidence links and source-state handling. Public Overpass capacity is nondeterministic; an explicit `unavailable` state is accepted without hiding the other live results.

## REST API

```bash
curl 'http://localhost:8787/api/v1/health'
curl 'http://localhost:8787/api/v1/sources'
curl 'http://localhost:8787/api/v1/metrics'
curl 'http://localhost:8787/api/v1/context?lat=34.0522&lon=-118.2437&radius_km=100&sources=macrostrat,mrds,osm,earthquakes&min_magnitude=2.5&days=30&limit=250'
curl 'http://localhost:8787/api/v1/analysis?lat=34.0522&lon=-118.2437&radius_km=100&limit=250'
curl 'http://localhost:8787/api/v1/compare?lat_a=34.0522&lon_a=-118.2437&label_a=Los%20Angeles&lat_b=34.742&lon_b=-120.5724&label_b=Vandenberg&radius_km=100&limit=250'
curl 'http://localhost:8787/api/v1/places?q=Vandenberg%20Space%20Force%20Base'
curl 'http://localhost:8787/api/v1/openapi.json'
```

`/api/v1/context` returns source records; `/analysis` adds deterministic computed metrics; `/compare` returns both contexts and their comparison; `/places` performs an explicit place lookup. Latitude is always supplied before longitude in API parameters; GeoJSON coordinates are always `[longitude, latitude]`. Radius is limited to 250 km, Overpass to 100 km, and each source to 500 records. The Worker applies a best-effort 30 context requests/minute/IP budget per edge isolate.

## MCP

The standard remote MCP endpoint is `https://YOUR-WORKER.workers.dev/mcp`. It uses the official Model Context Protocol SDK and Streamable HTTP transport. Available tools:

- `list_sources`
- `get_geology_at_point`
- `find_mineral_occurrences`
- `find_mapped_ports`
- `find_recent_earthquakes`
- `build_location_context`
- `analyze_region`
- `compare_regions`

Example MCP client configuration:

```json
{
  "mcpServers": {
    "world-data-federation": {
      "type": "http",
      "url": "https://YOUR-WORKER.workers.dev/mcp"
    }
  }
}
```

The MCP tools call the same orchestrator and adapters as the REST API. No arbitrary URL-fetch tool is exposed.

## Data interpretation and attribution

Every result carries its source URL, upstream ID, retrieval timestamp, source-specific caveats, license, and attribution. Key limitations:

- MRDS is archival, most complete in the United States, and may be stale regarding ownership, operations, production, reserves, and resources.
- OpenStreetMap is community-mapped infrastructure, not verified throughput, navigability, operating status, or accessibility.
- Recent earthquakes are observations, not a hazard forecast, structural-geology interpretation, or risk certification.
- Macrostrat point results may include overlapping compilations at several scales; query-point geometry is not a polygon boundary.
- Co-location never establishes causality or economic viability. Absence of records never proves absence of a feature.

The versioned source catalog is in [`packages/adapters/src/catalog.ts`](packages/adapters/src/catalog.ts) and available at `/api/v1/sources`.

## Repository map

```text
apps/web/               React + MapLibre research interface
apps/worker/            Hono REST API, MCP endpoint, assets routing
packages/contracts/     canonical TypeScript contract and validation
packages/adapters/      independent real-source adapters and catalog
packages/orchestrator/  parallel execution, cache, geospatial helpers
packages/analytics/     deterministic findings, distributions, clusters, comparison
packages/geocoding/     cached, policy-bounded place search
tests/                  fixtures, adapter/contract/API/MCP tests, live smoke
migrations/             D1 query and place-cache schema
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for design details and [DEPLOY_CLOUDFLARE.md](DEPLOY_CLOUDFLARE.md) for exact owner-run deployment instructions. This repository intentionally does not contain Cloudflare credentials and has not been deployed.

## Security and scope

Inputs are allow-listed and bounded. Upstream destinations are hard-coded except for operator-controlled Overpass and geocoder endpoint variables. The application does not proxy arbitrary URLs, perform unbounded scraping, expose browser-side secrets, or perform place autocomplete. Optional LLM narrative generation is deliberately not enabled; the findings are deterministic computations over source records.

Application code is MIT licensed. Upstream records remain under their respective licenses and attribution requirements.
