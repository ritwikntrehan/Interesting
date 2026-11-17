export * from "./catalog.ts";
export * from "./macrostrat.ts";
export * from "./mrds.ts";
export * from "./osm.ts";
export * from "./earthquakes.ts";

import type { DataAdapter } from "../../contracts/src/index.ts";
import { MacrostratAdapter } from "./macrostrat.ts";
import { MrdsAdapter } from "./mrds.ts";
import { OsmAdapter } from "./osm.ts";
import { EarthquakeAdapter } from "./earthquakes.ts";

export function createAdapters(options: { overpassEndpoint?: string } = {}): DataAdapter[] { return [new MacrostratAdapter(), new MrdsAdapter(), new OsmAdapter(options.overpassEndpoint), new EarthquakeAdapter()]; }
