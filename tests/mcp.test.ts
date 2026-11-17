import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import app from "../apps/worker/src/index.ts";
import macro from "./fixtures/macrostrat.json";

afterEach(() => vi.unstubAllGlobals());

describe("remote MCP server", () => {
  it("negotiates the official transport and preserves the original tools alongside analytics", async () => {
    const transport = new StreamableHTTPClientTransport(new URL("https://local.test/mcp"), { fetch: async (input, init) => app.fetch(new Request(input, init), {}) });
    const client = new Client({ name: "test-client", version: "1.0.0" }); await client.connect(transport); const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(["list_sources", "get_geology_at_point", "find_mineral_occurrences", "find_mapped_ports", "find_recent_earthquakes", "build_location_context", "analyze_region", "discover_region", "compare_regions"]);
    const listed = await client.callTool({ name: "list_sources", arguments: {} }); expect(listed.structuredContent).toHaveProperty("version");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(macro), { headers: { "Content-Type": "application/json" } })));
    const analyzed = await client.callTool({ name: "analyze_region", arguments: { lat: 34.0522, lon: -118.2437, sources: ["macrostrat"], radius_km: 25, limit: 25 } });
    expect(analyzed.structuredContent).toHaveProperty("analysis.analysisVersion", "1.0.0");
    expect(analyzed.structuredContent).toHaveProperty("context.apiVersion", "v1");
    const discovered = await client.callTool({ name: "discover_region", arguments: { lat: 34.0522, lon: -118.2437, sources: ["macrostrat"], radius_km: 25, limit: 25 } });
    expect(discovered.structuredContent).toHaveProperty("discovery.discoveryVersion", "1.0.0");
    await client.close();
  });
});
