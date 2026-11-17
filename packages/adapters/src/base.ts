import type { AdapterResult, CanonicalRecord, DataAdapter, QueryDefinition, SourceId, SourceStatus } from "../../contracts/src/index.ts";
import { SOURCE_CATALOG } from "./catalog.ts";

export abstract class BaseAdapter implements DataAdapter {
  abstract id: SourceId;
  abstract execute(input: QueryDefinition, signal: AbortSignal, retrievedAt: string): Promise<CanonicalRecord[]>;

  async query(input: QueryDefinition, options: { signal?: AbortSignal } = {}): Promise<AdapterResult> {
    const started = Date.now();
    const retrievedAt = new Date().toISOString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("provider timeout"), SOURCE_CATALOG[this.id].requestTimeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
    try {
      const records = await this.execute(input, signal, retrievedAt);
      const bounded = records.length >= input.limit;
      return { records, status: this.status(bounded ? "partial" : "live", records.length, retrievedAt, started, bounded ? `Result bounded at requested limit ${input.limit}` : undefined) };
    } catch (error) {
      const upstreamStatus = error instanceof ProviderError ? error.status : undefined;
      const message = error instanceof Error ? error.message : "Unknown provider error";
      return { records: [], status: this.status("unavailable", 0, retrievedAt, started, message, upstreamStatus) };
    } finally { clearTimeout(timeout); }
  }

  async health(): Promise<{ ok: boolean; latencyMs: number; message?: string }> {
    const started = Date.now();
    try {
      const response = await fetch(SOURCE_CATALOG[this.id].api, { method: "HEAD", signal: AbortSignal.timeout(5000) });
      return { ok: response.ok || response.status === 405, latencyMs: Date.now() - started, message: `HTTP ${response.status}` };
    } catch (error) { return { ok: false, latencyMs: Date.now() - started, message: error instanceof Error ? error.message : "health failed" }; }
  }

  protected async fetchJson<T>(url: string, init: RequestInit, signal: AbortSignal): Promise<T> {
    const response = await fetch(url, { ...init, signal, headers: { "Accept": "application/json", "User-Agent": "WorldDataFederation/1.0 (+https://github.com/ritwikntrehan/Interesting)", ...init.headers } });
    if (!response.ok) throw new ProviderError(`Upstream returned HTTP ${response.status}`, response.status);
    try { return await response.json() as T; } catch { throw new ProviderError("Upstream returned invalid JSON", response.status); }
  }

  private status(state: SourceStatus["state"], count: number, retrievedAt: string, started: number, message?: string, upstreamStatus?: number): SourceStatus {
    return { sourceId: this.id, state, recordCount: count, retrievedAt, durationMs: Date.now() - started, ...(message ? { message } : {}), ...(upstreamStatus ? { diagnostics: { code: "UPSTREAM_HTTP_ERROR", upstreamStatus } } : {}) };
  }
}

export class ProviderError extends Error { constructor(message: string, public status?: number) { super(message); } }
