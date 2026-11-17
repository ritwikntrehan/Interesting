import type { ContextEnvelope } from "../../contracts/src/index.ts";

export interface CacheRecord { value: ContextEnvelope; ageSeconds: number; stale: boolean }
export interface QueryCache { get(key: string): Promise<CacheRecord | null>; put(key: string, value: ContextEnvelope, ttlSeconds: number, staleSeconds: number): Promise<void> }

export class MemoryQueryCache implements QueryCache {
  private values = new Map<string, { value: ContextEnvelope; created: number; expires: number; stale: number }>();
  async get(key: string): Promise<CacheRecord | null> {
    const item = this.values.get(key); const now = Date.now();
    if (!item || now > item.stale) { this.values.delete(key); return null; }
    return { value: structuredClone(item.value), ageSeconds: Math.floor((now - item.created) / 1000), stale: now > item.expires };
  }
  async put(key: string, value: ContextEnvelope, ttlSeconds: number, staleSeconds: number): Promise<void> {
    const created = Date.now(); this.values.set(key, { value: structuredClone(value), created, expires: created + ttlSeconds * 1000, stale: created + staleSeconds * 1000 });
  }
}

interface D1Result<T> { results?: T[] }
interface D1Prepared { bind(...values: unknown[]): D1Prepared; first<T>(): Promise<T | null>; run(): Promise<unknown> }
export interface D1Like { prepare(sql: string): D1Prepared }

export class D1QueryCache implements QueryCache {
  constructor(private db: D1Like) {}
  async get(key: string): Promise<CacheRecord | null> {
    const row = await this.db.prepare("SELECT payload, created_at, expires_at, stale_at FROM query_cache WHERE cache_key = ?").bind(key).first<{ payload: string; created_at: number; expires_at: number; stale_at: number }>();
    const now = Date.now(); if (!row || now > row.stale_at) return null;
    try { return { value: JSON.parse(row.payload) as ContextEnvelope, ageSeconds: Math.floor((now - row.created_at) / 1000), stale: now > row.expires_at }; } catch { return null; }
  }
  async put(key: string, value: ContextEnvelope, ttlSeconds: number, staleSeconds: number): Promise<void> {
    const now = Date.now(); await this.db.prepare("INSERT INTO query_cache(cache_key,payload,created_at,expires_at,stale_at) VALUES(?,?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,created_at=excluded.created_at,expires_at=excluded.expires_at,stale_at=excluded.stale_at").bind(key, JSON.stringify(value), now, now + ttlSeconds * 1000, now + staleSeconds * 1000).run();
  }
}
