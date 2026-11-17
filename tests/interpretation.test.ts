import { afterEach, describe, expect, it, vi } from "vitest";
import { InterpretationError, InterpretationService } from "../packages/interpretation/src/index.ts";
import type { ContextEnvelope } from "../packages/contracts/src/index.ts";
import type { Discovery } from "../packages/discovery/src/index.ts";

afterEach(() => vi.unstubAllGlobals());
const context = { apiVersion: "v1", query: { lat: 1, lon: 2, radius_km: 10, sources: [], min_magnitude: 2.5, days: 30, limit: 10, requestedAt: "2026-01-01" }, geojson: { type: "FeatureCollection", features: [] } } as unknown as ContextEnvelope;
const discovery = { id: "unique-ai-fixture", headline: "Computed cluster", explanation: "Three records cluster.", whyInvestigate: "Inspect it.", metric: { value: 3, label: "records", method: "fixture" }, supportingRecordIds: [], limitations: ["fixture"] } as unknown as Discovery;
describe("optional Claude interpretation", () => {
  it("gracefully reports a missing secret", async () => { await expect(new InterpretationService().interpret(context, discovery, "Fixture")).rejects.toEqual(expect.objectContaining<Partial<InterpretationError>>({ code: "AI_NOT_CONFIGURED", status: 503 })); });
  it("uses a bounded structured request and caches the response", async () => { const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ model: "claude-haiku-5-5", content: [{ type: "text", text: JSON.stringify({ interpretation: "Worth inspecting.", relationships: ["Could geology help explain the pattern?"], followUps: ["Inspect source records"], caveat: "No causal claim." }) }], usage: { input_tokens: 100, output_tokens: 50 } }), { headers: { "Content-Type": "application/json" } })); vi.stubGlobal("fetch", fetchMock); const service = new InterpretationService("test-key", undefined, "claude-haiku-5-5", "https://anthropic.example.test/messages"); const first = await service.interpret(context, discovery, "Fixture"); const second = await service.interpret(context, discovery, "Fixture"); expect(first).toMatchObject({ cached: false, interpretation: "Worth inspecting." }); expect(second.cached).toBe(true); expect(fetchMock).toHaveBeenCalledTimes(1); expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).max_tokens).toBe(350); });
});
