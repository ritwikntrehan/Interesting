# Cloudflare deployment (owner-run)

This repository has not been deployed and contains no Cloudflare credentials. Complete these steps from the repository root. Commands assume Node.js 22.12+ and npm 10+.

## 1. Prepare and verify

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:live
npm run test:live:analytics
npm run test:live:discovery
```

The live test should show records from at least three sources. An Overpass public-instance outage is acceptable only when its status is explicitly `unavailable`; it must not remove other results.

## 2. Authenticate Wrangler and verify D1

```bash
npx wrangler login
npx wrangler whoami
npx wrangler d1 info world-data-federation-cache
```

The repository already contains the owner-created `world-data-federation-cache` database ID and `CACHE` binding. If `d1 info` succeeds in the intended account, do not create another database or edit the binding. Apply all committed migrations, including the interpretation cache and quota ledger:

```bash
npm run db:migrate:remote
```

If deploying a fork into a different Cloudflare account, create a new database and replace only `database_id` in `wrangler.jsonc` with the returned UUID before running the migration:

```bash
npx wrangler d1 create world-data-federation-cache
npm run db:migrate:remote
```

For a non-production preview database, create a separate D1 database and add a Wrangler environment with its own database ID. Do not point preview builds at production D1.

## 3. First preview deployment

```bash
npm run build
npm run deploy
```

Wrangler builds the Worker entry at `apps/worker/src/index.ts`, uploads `dist/web` through Workers Static Assets, and prints the `https://world-data-federation.<account-subdomain>.workers.dev` URL.

No secret is required for deterministic discovery. The supported variables already in `wrangler.jsonc` are:

| Name | Default | Purpose |
|---|---:|---|
| `CACHE_TTL_SECONDS` | `900` | fresh combined-query cache lifetime |
| `STALE_TTL_SECONDS` | `86400` | maximum explicit stale fallback lifetime |
| `OVERPASS_ENDPOINT` | official `overpass-api.de` interpreter | operator-selectable Overpass instance |
| `GEOCODER_ENDPOINT` | official public Nominatim search endpoint | operator-selectable geocoder; public endpoint is rate-limited and cached |
| `ANTHROPIC_MODEL` | `claude-haiku-5-5` | optional finding-interpretation model |

To enable the optional, explicitly user-triggered interpretation button, store the key only as a Worker secret:

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

Without it, deterministic discovery remains fully available. Interpretations are cached for 30 days, capped at 350 output tokens, limited to 10 attempts/hour/IP, and guarded by a conservative D1-backed $0.50 lifetime allowance. Also set a $0.50 Anthropic workspace spend limit as defense in depth; the application ledger is not a billing guarantee under globally concurrent edge requests.

## 4. Verify the `workers.dev` deployment

Replace `$BASE` below with the printed URL:

```bash
export BASE='https://world-data-federation.YOUR-SUBDOMAIN.workers.dev'
curl -fsS "$BASE/api/v1/health"
curl -fsS "$BASE/api/v1/sources"
curl -fsS "$BASE/api/v1/openapi.json"
curl -fsS "$BASE/api/v1/context?lat=34.0522&lon=-118.2437&radius_km=100&limit=100"
curl -fsS "$BASE/api/v1/analysis?lat=34.0522&lon=-118.2437&radius_km=100&limit=100"
curl -fsS "$BASE/api/v1/discover?lat=21.3069&lon=-157.8583&radius_km=100&limit=100"
curl -fsS "$BASE/api/v1/compare?lat_a=34.0522&lon_a=-118.2437&lat_b=34.742&lon_b=-120.5724&radius_km=100&limit=100"
curl -fsS "$BASE/api/v1/places?q=Vandenberg%20Space%20Force%20Base"
```

Then open `$BASE` in a browser and verify:

1. a Los Angeles preset produces computed findings, distributions, clusters, map features, and supporting records;
2. clicking a chart slice filters both the map and supporting-record list;
3. explicit place search returns attributed results and does not request while typing;
4. Vandenberg/Santa Barbara and Tokyo Bay presets produce shareable URLs;
5. comparison uses equivalent parameters and includes source availability/cap states;
6. a record opens source URL, timestamps, raw fields, attribution, and limitations;
7. `/mcp` connects and `list_sources`, `build_location_context`, `analyze_region`, `discover_region`, and `compare_regions` run successfully;
8. a deliberately invalid radius (`251`) returns HTTP 400;
9. a provider outage remains visible without erasing other provider results.

## 5. Connect GitHub Builds

In Cloudflare Dashboard:

1. **Workers & Pages → Create application → Import a repository**.
2. Authorize GitHub and select the connected repository `ritwikntrehan/Interesting` (the application and Worker remain named `world-data-federation`).
3. Set the production branch to `main`.
4. Use build command `npm ci && npm run build`.
5. Use deploy command `npm run deploy`.
6. Leave the root directory at `/`.
7. Use Node.js `22.12` or newer in the build environment.
8. Save and run the first build.

The committed Wrangler file is authoritative for Worker name, entry point, assets, D1 binding, variables, compatibility date, and observability. D1 migrations are intentionally a separate controlled step; run `npm run db:migrate:remote` before deploying any commit that adds a migration.

## 6. Custom domain (only after preview verification)

In **Workers & Pages → world-data-federation → Settings → Domains & Routes → Add → Custom Domain**, enter the desired hostname and confirm. Cloudflare creates the DNS record and certificate when the zone is already on Cloudflare. Re-run the verification commands with the custom HTTPS origin, including the `/mcp` URL. Do not remove the `workers.dev` route until the custom domain is healthy.

## 7. Monitoring and rollback

Workers Observability is enabled. Review request/error logs and provider-specific diagnostics; `/api/v1/metrics` is only a current-isolate snapshot, not durable analytics.

```bash
npx wrangler deployments list
npx wrangler rollback <DEPLOYMENT_ID>
```

Rollback changes Worker code/assets, not D1 schema. Migrations are forward-only in this repository. Before any future destructive schema change, take a D1 backup/export and document a compatible application rollback. To disable a bad GitHub auto-deploy, restore the last stable deployment in the Cloudflare dashboard and revert the offending Git commit.

## Official references

- [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Workers custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Workers rollbacks](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/)
