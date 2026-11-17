import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import app from "../apps/worker/src/index.ts";

describe("remote MCP server", () => {
  it("negotiates the official transport and lists the six tools", async () => {
    const transport = new StreamableHTTPClientTransport(new URL("https://local.test/mcp"), { fetch: async (input, init) => app.fetch(new Request(input, init), {}) });
    const client = new Client({ name: "test-client", version: "1.0.0" }); await client.connect(transport); const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(["list_sources", "get_geology_at_point", "find_mineral_occurrences", "find_mapped_ports", "find_recent_earthquakes", "build_location_context"]);
    const listed = await client.callTool({ name: "list_sources", arguments: {} }); expect(listed.structuredContent).toHaveProperty("version"); await client.close();
  });
});
