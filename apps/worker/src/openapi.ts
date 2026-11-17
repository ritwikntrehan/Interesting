const sharedParameters = [
  { name: "radius_km", in: "query", schema: { type: "number", default: 100, exclusiveMinimum: 0, maximum: 250 } },
  { name: "sources", in: "query", schema: { type: "string", example: "macrostrat,mrds,osm,earthquakes" } },
  { name: "min_magnitude", in: "query", schema: { type: "number", default: 2.5 } },
  { name: "days", in: "query", schema: { type: "integer", default: 30, minimum: 1, maximum: 365 } },
  { name: "limit", in: "query", schema: { type: "integer", default: 250, minimum: 1, maximum: 500 } }
] as const;
const locationParameters = [
  { name: "lat", in: "query", required: true, schema: { type: "number", minimum: -90, maximum: 90 } },
  { name: "lon", in: "query", required: true, schema: { type: "number", minimum: -180, maximum: 180 } },
  ...sharedParameters
] as const;

export const OPENAPI = {
  openapi: "3.1.0",
  info: { title: "World Data Federation API", version: "1.0.0", description: "Bounded, source-traceable geospatial context from independent public datasets." },
  servers: [{ url: "/" }],
  paths: {
    "/api/v1/health": { get: { summary: "Service health", parameters: [{ name: "deep", in: "query", schema: { type: "boolean" } }], responses: { "200": { description: "Health response" } } } },
    "/api/v1/sources": { get: { summary: "Versioned source catalog", responses: { "200": { description: "Source catalog" } } } },
    "/api/v1/metrics": { get: { summary: "Per-isolate basic operational counters", responses: { "200": { description: "Operational counters" } } } },
    "/api/v1/context": { get: { summary: "Build federated location context", parameters: locationParameters, responses: { "200": { description: "Canonical context envelope with GeoJSON and provenance" }, "400": { description: "Invalid parameters" }, "429": { description: "Request budget exceeded" } } } },
    "/api/v1/analysis": { get: { summary: "Build a computed regional intelligence analysis from the federated context", parameters: locationParameters, responses: { "200": { description: "Context plus structured analytical metrics, clusters, findings, and limitations" }, "400": { description: "Invalid parameters" } } } },
    "/api/v1/compare": { get: { summary: "Compare two equivalently queried regions", parameters: [
      { name: "lat_a", in: "query", required: true, schema: { type: "number", minimum: -90, maximum: 90 } }, { name: "lon_a", in: "query", required: true, schema: { type: "number", minimum: -180, maximum: 180 } },
      { name: "lat_b", in: "query", required: true, schema: { type: "number", minimum: -90, maximum: 90 } }, { name: "lon_b", in: "query", required: true, schema: { type: "number", minimum: -180, maximum: 180 } },
      { name: "label_a", in: "query", schema: { type: "string" } }, { name: "label_b", in: "query", schema: { type: "string" } }, ...sharedParameters
    ], responses: { "200": { description: "Two contexts and sample-aware computed comparison" }, "400": { description: "Invalid region parameters" } } } },
    "/api/v1/places": { get: { summary: "User-triggered cached place search", parameters: [{ name: "q", in: "query", required: true, schema: { type: "string", minLength: 2, maxLength: 120 } }], responses: { "200": { description: "Geocoded places with attribution" }, "400": { description: "Invalid query" }, "429": { description: "Public provider request budget exceeded" }, "502": { description: "Place provider unavailable" } } } },
    "/mcp": { post: { summary: "MCP Streamable HTTP endpoint", responses: { "200": { description: "MCP protocol response" } } } }
  }
} as const;
