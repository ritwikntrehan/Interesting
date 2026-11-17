# World Data Federation

A functioning, source-traceable geospatial orchestration layer for real public data. Choose a WGS84 coordinate and bounded radius to query independent providers in parallel, inspect canonical records and upstream attributes, map the results, and download combined GeoJSON. Provider failures remain visible and do not discard successful results from other sources.

## What works

- **Macrostrat API v2:** point geology with age, lithology, scale, CC BY 4.0 licensing, and original-map references.
- **USGS MRDS:** bounded ArcGIS distance queries with verified kilometer units, WGS84 output, deterministic ordering, pagination, and a strict result budget. MRDS is prominently treated as a historical occurrence compilation—not current mine status, reserves, production, or viability.
- **OpenStreetMap Overpass:** a conservative allow-list of mapped harbor, ferry terminal, port, named pier, and seamark tags; POST requests, 100 km maximum, cache, timeout, and explicit outage diagnostics.
- **USGS Earthquake Catalog:** bounded FDSN circle queries with configurable time window and magnitude threshold.
- **Canonical contract:** stable IDs, WGS84 geometry, normalized and unmodified upstream fields, provenance, license, timestamps, quality flags, transformation version, and limitations.
- **One Worker:** Hono REST API, official MCP Streamable HTTP endpoint, D1 query cache, rate budget, per-isolate metrics, and built React/MapLibre assets.
- **Partial results:** adapters run independently; `live`, `cached`, `stale`, `partial`, `unavailable`, and `unsupported` states are preserved.

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
```

The live smoke test uses Los Angeles (`34.0522, -118.2437`), a 100 km radius, magnitude 2.5, a 30-day earthquake window, and a 100-record/source ceiling. It succeeds when at least three independent sources return source-backed records; the fourth may explicitly report a real upstream outage.

## REST API

```bash
curl 'http://localhost:8787/api/v1/health'
curl 'http://localhost:8787/api/v1/sources'
curl 'http://localhost:8787/api/v1/metrics'
curl 'http://localhost:8787/api/v1/context?lat=34.0522&lon=-118.2437&radius_km=100&sources=macrostrat,mrds,osm,earthquakes&min_magnitude=2.5&days=30&limit=250'
curl 'http://localhost:8787/api/v1/openapi.json'
```

`/api/v1/context` returns the query definition, source statuses, counts, canonical GeoJSON features, provenance, and cross-source limitations. Latitude is always supplied before longitude in API parameters; GeoJSON coordinates are always `[longitude, latitude]`. Radius is limited to 250 km, Overpass to 100 km, and each source to 500 records. The Worker applies a best-effort 30 context requests/minute/IP budget per edge isolate.

## MCP

The standard remote MCP endpoint is `https://YOUR-WORKER.workers.dev/mcp`. It uses the official Model Context Protocol SDK and Streamable HTTP transport. Available tools:

- `list_sources`
- `get_geology_at_point`
- `find_mineral_occurrences`
- `find_mapped_ports`
- `find_recent_earthquakes`
- `build_location_context`

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
tests/                  fixtures, adapter/contract/API/MCP tests, live smoke
migrations/             D1 query-cache schema
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for design details and [DEPLOY_CLOUDFLARE.md](DEPLOY_CLOUDFLARE.md) for exact owner-run deployment instructions. This repository intentionally does not contain Cloudflare credentials and has not been deployed.

## Security and scope

Inputs are allow-listed and bounded. Upstream destinations are hard-coded except for the operator-controlled Overpass endpoint variable. The application does not proxy arbitrary URLs, perform unbounded scraping, or expose browser-side secrets. Optional LLM narrative generation is deliberately not enabled in this release; deterministic records are the product.

Application code is MIT licensed. Upstream records remain under their respective licenses and attribution requirements.
