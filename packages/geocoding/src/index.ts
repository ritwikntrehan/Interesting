import type { D1Like } from "../../orchestrator/src/cache.ts";

export interface PlaceResult {
  id: string; name: string; displayName: string; lat: number; lon: number;
  type: string; category: string; boundingBox: [number, number, number, number] | null;
  attribution: string; sourceUrl: string;
}

interface NominatimResult { place_id: number; osm_type: string; osm_id: number; display_name: string; lat: string; lon: string; type?: string; category?: string; boundingbox?: [string, string, string, string]; licence?: string; name?: string }
let lastPublicRequestAt = 0;
const memory = new Map<string, { expires: number; value: PlaceResult[] }>();

export class PlaceSearchService {
  constructor(private db?: D1Like, private endpoint = "https://nominatim.openstreetmap.org/search") {}
  async search(query: string, signal?: AbortSignal): Promise<{ results: PlaceResult[]; cached: boolean; limitations: string[] }> {
    const normalized = query.trim().replace(/\s+/g, " "); if (normalized.length < 2 || normalized.length > 120) throw new PlaceSearchError("Place query must be 2–120 characters", 400);
    const key = normalized.toLocaleLowerCase("en-US"); const cached = await this.read(key); if (cached) return { results: cached, cached: true, limitations: limitations() };
    const now = Date.now(); if (this.endpoint.includes("nominatim.openstreetmap.org") && now - lastPublicRequestAt < 1000) throw new PlaceSearchError("Place search is limited to one uncached request per second. Try again shortly.", 429); lastPublicRequestAt = now;
    const url = new URL(this.endpoint); url.searchParams.set("q", normalized); url.searchParams.set("format", "jsonv2"); url.searchParams.set("addressdetails", "1"); url.searchParams.set("limit", "5"); url.searchParams.set("accept-language", "en");
    const response = await fetch(url, { signal: signal ?? AbortSignal.timeout(10000), headers: { Accept: "application/json", "Accept-Language": "en", "User-Agent": "WorldDataFederation/0.2 (+https://github.com/ritwikntrehan/Interesting)" } });
    if (!response.ok) throw new PlaceSearchError(`Place provider returned HTTP ${response.status}`, response.status);
    const upstream = await response.json() as NominatimResult[]; const results = upstream.map(normalize); await this.write(key, results); return { results, cached: false, limitations: limitations() };
  }
  private async read(key: string): Promise<PlaceResult[] | null> {
    const local = memory.get(key); if (local && local.expires > Date.now()) return structuredClone(local.value);
    if (!this.db) return null;
    try { const row = await this.db.prepare("SELECT payload, expires_at FROM place_cache WHERE query_key = ?").bind(key).first<{ payload: string; expires_at: number }>(); return row && row.expires_at > Date.now() ? JSON.parse(row.payload) as PlaceResult[] : null; } catch { return null; }
  }
  private async write(key: string, value: PlaceResult[]) {
    const expires = Date.now() + 30 * 86400000; memory.set(key, { expires, value: structuredClone(value) });
    if (this.db) await this.db.prepare("INSERT INTO place_cache(query_key,payload,created_at,expires_at) VALUES(?,?,?,?) ON CONFLICT(query_key) DO UPDATE SET payload=excluded.payload,created_at=excluded.created_at,expires_at=excluded.expires_at").bind(key, JSON.stringify(value), Date.now(), expires).run().catch(() => undefined);
  }
}

export class PlaceSearchError extends Error { constructor(message: string, public status: number) { super(message); } }
function normalize(value: NominatimResult): PlaceResult {
  const parts = value.display_name.split(","); const box = value.boundingbox?.map(Number);
  return { id: `${value.osm_type}/${value.osm_id}`, name: value.name || parts[0]!.trim(), displayName: value.display_name, lat: Number(value.lat), lon: Number(value.lon), type: value.type || "place", category: value.category || "place", boundingBox: box?.length === 4 ? [box[0]!, box[2]!, box[1]!, box[3]!] : null, attribution: value.licence || "© OpenStreetMap contributors, ODbL 1.0", sourceUrl: `https://www.openstreetmap.org/${value.osm_type}/${value.osm_id}` };
}
function limitations() { return ["Place search is user-triggered, cached, and not an autocomplete service.", "Do not submit personal or confidential information as a place query.", "Search results © OpenStreetMap contributors under ODbL 1.0."]; }
