import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import * as z from "zod/v4";
import type { ContextEnvelope, QueryDefinition, SourceId } from "../../../packages/contracts/src/index.ts";
import { SOURCE_CATALOG, SOURCE_CATALOG_VERSION } from "../../../packages/adapters/src/catalog.ts";
import type { FederationOrchestrator } from "../../../packages/orchestrator/src/index.ts";

const location = { lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) };
const radius = z.number().positive().max(250).default(100);
const base = (sources: SourceId[], args: { lat: number; lon: number; radius_km?: number; limit?: number; min_magnitude?: number; days?: number }): QueryDefinition => ({ lat: args.lat, lon: args.lon, radius_km: args.radius_km ?? 100, sources, limit: args.limit ?? 100, min_magnitude: args.min_magnitude ?? 2.5, days: args.days ?? 30 });
const result = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: value as Record<string, unknown> });
const sourceSlice = (context: ContextEnvelope, sourceId: SourceId) => ({ query: context.query, status: context.statuses.find((s) => s.sourceId === sourceId), geojson: { type: "FeatureCollection", features: context.geojson.features.filter((f) => f.properties.sourceId === sourceId) }, limitations: context.limitations });

export function createMcpServer(orchestrator: FederationOrchestrator): McpServer {
  const server = new McpServer({ name: "world-data-federation", version: "1.0.0" });
  server.registerTool("list_sources", { title: "List authoritative sources", description: "Lists the versioned data-source catalog, licensing, cache policy, and caveats.", inputSchema: {} }, async () => result({ version: SOURCE_CATALOG_VERSION, sources: Object.values(SOURCE_CATALOG) }));
  server.registerTool("get_geology_at_point", { title: "Get geology at point", description: "Queries real Macrostrat map units at a WGS84 coordinate.", inputSchema: location }, async (args) => result(sourceSlice(await orchestrator.buildContext(base(["macrostrat"], { ...args, radius_km: 1, limit: 25 })), "macrostrat")));
  server.registerTool("find_mineral_occurrences", { title: "Find historical mineral occurrences", description: "Finds bounded USGS MRDS historical occurrence records. Not current mine status or reserves.", inputSchema: { ...location, radius_km: radius, limit: z.number().int().min(1).max(500).default(100) } }, async (args) => result(sourceSlice(await orchestrator.buildContext(base(["mrds"], args)), "mrds")));
  server.registerTool("find_mapped_ports", { title: "Find community-mapped port infrastructure", description: "Finds conservative OpenStreetMap harbor/port tags. Not verified throughput or accessibility.", inputSchema: { ...location, radius_km: z.number().positive().max(100).default(50), limit: z.number().int().min(1).max(500).default(100) } }, async (args) => result(sourceSlice(await orchestrator.buildContext(base(["osm"], args)), "osm")));
  server.registerTool("find_recent_earthquakes", { title: "Find recent earthquakes", description: "Queries the USGS catalog with a bounded time window, magnitude, radius, and result count.", inputSchema: { ...location, radius_km: radius, min_magnitude: z.number().min(-1).max(10).default(2.5), days: z.number().int().min(1).max(365).default(30), limit: z.number().int().min(1).max(500).default(100) } }, async (args) => result(sourceSlice(await orchestrator.buildContext(base(["earthquakes"], args)), "earthquakes")));
  server.registerTool("build_location_context", { title: "Build federated location context", description: "Runs the same deterministic, real multi-source federation as GET /api/v1/context.", inputSchema: { ...location, radius_km: radius, sources: z.array(z.enum(["macrostrat", "mrds", "osm", "earthquakes"])).default(["macrostrat", "mrds", "osm", "earthquakes"]), min_magnitude: z.number().min(-1).max(10).default(2.5), days: z.number().int().min(1).max(365).default(30), limit: z.number().int().min(1).max(500).default(250) } }, async (args) => result(await orchestrator.buildContext(base(args.sources, args))));
  return server;
}

export async function handleMcp(request: Request, orchestrator: FederationOrchestrator): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  const server = createMcpServer(orchestrator); await server.connect(transport); return transport.handleRequest(request);
}
