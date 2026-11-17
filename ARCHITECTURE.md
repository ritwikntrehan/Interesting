# Architecture

## Request flow

```text
React/MapLibre UI ─┬─ GET /api/v1/context ─┐
MCP client ────────┴─ POST /mcp ───────────┤
                                           ▼
                              FederationOrchestrator
                               │  D1 query cache
                  ┌────────────┼────────────┬─────────────┐
                  ▼            ▼            ▼             ▼
              Macrostrat    USGS MRDS    Overpass     USGS FDSN
                  └────────────┴────────────┴─────────────┘
                                           ▼
                         canonical records + source statuses
```

The REST and MCP surfaces instantiate the same `FederationOrchestrator`. Each adapter owns request construction, timeout, bounded result handling, normalization, metadata, attribution, and source-specific limitations. Calls use `Promise.all`, so a failed provider becomes an explicit source status without suppressing other records.

## Canonical contract

Each record contains:

- stable source-scoped record ID and upstream ID;
- dataset ID/title and record type;
- WGS84 GeoJSON geometry (`[longitude, latitude]`);
- normalized properties plus relevant unmodified upstream attributes;
- original source URL, retrieval and observation/publication times;
- license, attribution, coordinate quality/precision flags;
- transformation version and source-specific limitations.

The response envelope adds the sanitized query, per-source status, aggregate counts, source-catalog version, cross-source caveats, and a deterministic provenance flag.

## Provider behavior

| Adapter | Spatial query | Bound | Cache policy | Special handling |
|---|---|---:|---:|---|
| Macrostrat | point (`lat`, `lng`) | 25 overlapping units | 24 h catalog policy | preserves `refs` original-map citation |
| MRDS | ArcGIS point + `distance` in kilometers | 500 | 24 h catalog policy | pages with `resultOffset`, orders by object ID |
| OSM | Overpass `around` | 100 km / 500 | 6 h catalog policy | POST body, conservative tag allow-list |
| Earthquakes | FDSN radius in km | 500 / 365 days | 5 min catalog policy | configurable time and magnitude window |

The current combined D1 cache defaults to 15 minutes fresh and 24 hours stale. If every selected live provider fails, an available stale response is served with every status explicitly changed to `stale` and cache age reported. Cache is an availability mechanism, never evidence of provider liveness.

## Cloudflare topology

One module Worker serves API/MCP routes and a single-page application from Workers Static Assets. D1 stores JSON query envelopes. Cloudflare Workers Observability is enabled; `/api/v1/metrics` exposes only process-local counters and clearly labels their isolate scope. No Durable Object, queue, R2 bucket, authentication subsystem, or model API is required.

The in-memory rate bucket is deliberately a best-effort per-isolate abuse guard, not a globally strict quota. For a high-traffic public service, add Cloudflare Rate Limiting rules or a Durable Object without weakening the existing input/result bounds.

## Correctness decisions

- MRDS uses the live layer metadata-confirmed fields `objectid_1`, `dep_id`, `site_name`, `dev_stat`, `code_list`, and `grade`; output is requested in EPSG:4326.
- MRDS `grade` and `dev_stat` remain “as reported” fields. They are not interpreted as ore grade, present-day status, or viability.
- Macrostrat’s map endpoint does not return polygons, so its canonical geometry is explicitly flagged as a query-point representation.
- Overpass ways/relations use the returned element center and receive a `derived-center` flag.
- Earthquake depth is preserved in the third point coordinate and normalized as kilometers.
- Antimeridian-aware bounding-box helpers and distance/unit tests protect future rectangular adapters; current providers use native radial queries.

## Failure model

Provider HTTP errors, invalid JSON, and timeouts become `unavailable` statuses with safe diagnostics. Hitting a requested record ceiling becomes `partial`. Cache hits are `cached`; expired fallback is `stale`. Unsupported source constraints remain distinguishable from outages. Production records are never replaced with fixtures or synthetic values.

## Testing

Fixture tests validate request parameters, longitude/latitude ordering, units, pagination, source caveats, transformation, antimeridian splitting, partial failures, and cache state. HTTP tests execute the Worker app directly. The MCP test connects an official SDK client to the official Web Standard Streamable HTTP server transport and calls `list_sources`. `npm run test:live` is separate because public upstream availability is not deterministic.
