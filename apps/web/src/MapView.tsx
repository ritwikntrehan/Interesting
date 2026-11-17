import { useEffect, useRef } from "react";
import { LngLatBounds, Map as MapLibreMap, NavigationControl, ScaleControl, setWorkerUrl, type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { FeatureCollection, GeoJsonProperties, Geometry as GeoJsonGeometry } from "geojson";
import type { ContextEnvelope } from "../../../packages/contracts/src/index.ts";
import type { DiscoveryGeometryFeature } from "../../../packages/discovery/src/index.ts";

interface Props {
  lat: number; lon: number; radiusKm: number; data: ContextEnvelope | null; selectedId?: string | null;
  highlightedIds?: string[]; focusGeometry?: { type: "FeatureCollection"; features: DiscoveryGeometryFeature[] } | null;
  onLocation(lat: number, lon: number): void; onSelect(id: string): void; onViewChange?(lat: number, lon: number, zoom: number): void;
}

setWorkerUrl(mapWorkerUrl);

export function MapView({ lat, lon, radiusKm, data, selectedId, highlightedIds = [], focusGeometry, onLocation, onSelect, onViewChange }: Props) {
  const container = useRef<HTMLDivElement>(null); const mapRef = useRef<MapLibreMap | null>(null);
  const callbacks = useRef({ onLocation, onSelect, onViewChange }); callbacks.current = { onLocation, onSelect, onViewChange };
  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new MapLibreMap({ container: container.current, style: import.meta.env.VITE_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty", center: data ? [lon, lat] : [12, 18], zoom: data ? 7 : 2.15, minZoom: 1.5 });
    map.addControl(new NavigationControl({ visualizePitch: true }), "bottom-right"); map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
    map.on("click", (event: MapMouseEvent) => { const hit = map.queryRenderedFeatures(event.point, { layers: map.getLayer("records") ? ["records"] : [] }); if (hit[0]?.properties?.canonicalId) callbacks.current.onSelect(String(hit[0].properties.canonicalId)); else callbacks.current.onLocation(Number(event.lngLat.lat.toFixed(6)), Number(event.lngLat.lng.toFixed(6))); });
    map.on("moveend", () => { const center = map.getCenter(); callbacks.current.onViewChange?.(Number(center.lat.toFixed(6)), Number(center.lng.toFixed(6)), Number(map.getZoom().toFixed(2))); });
    map.on("load", () => {
      map.addSource("query-area", { type: "geojson", data: emptyCollection() });
      map.addLayer({ id: "query-fill", type: "fill", source: "query-area", paint: { "fill-color": "#b86b3f", "fill-opacity": 0.035 } });
      map.addLayer({ id: "query-line", type: "line", source: "query-area", paint: { "line-color": "#8f4e2e", "line-width": 1.5, "line-dasharray": [3, 3], "line-opacity": .65 } });
      map.addSource("discovery-focus", { type: "geojson", data: emptyCollection() });
      map.addLayer({ id: "discovery-focus-fill", type: "fill", source: "discovery-focus", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#d78642", "fill-opacity": .2 } });
      map.addLayer({ id: "discovery-focus-line", type: "line", source: "discovery-focus", paint: { "line-color": "#8f3f24", "line-width": 3, "line-opacity": .9 } });
      map.addSource("records", { type: "geojson", data: emptyCollection() });
      map.addLayer({ id: "records", type: "circle", source: "records", paint: { "circle-radius": ["match", ["get", "selected"], "yes", 11, ["match", ["get", "highlighted"], "yes", 8, ["match", ["get", "recordType"], "earthquake", 6, "geology", 8, 5]]], "circle-color": ["match", ["get", "recordType"], "geology", "#6d4c9a", "mineral_occurrence", "#cf7138", "mapped_port", "#167ca2", "earthquake", "#c84949", "#334155"], "circle-stroke-color": ["match", ["get", "selected"], "yes", "#17211f", ["match", ["get", "highlighted"], "yes", "#fff8e9", "#ffffff"]], "circle-stroke-width": ["match", ["get", "selected"], "yes", 4, ["match", ["get", "highlighted"], "yes", 2.5, 1]], "circle-opacity": ["match", ["get", "dimmed"], "yes", .18, .9] } });
      map.on("mouseenter", "records", () => { map.getCanvas().style.cursor = "pointer"; }); map.on("mouseleave", "records", () => { map.getCanvas().style.cursor = "crosshair"; });
    });
    mapRef.current = map; return () => { map.remove(); mapRef.current = null; };
  }, []);
  useEffect(() => {
    const map = mapRef.current; if (!map) return; const update = () => {
      (map.getSource("query-area") as GeoJSONSource | undefined)?.setData(data ? circle(lon, lat, radiusKm) : emptyCollection());
      const highlight = new Set(highlightedIds); const hasHighlight = highlight.size > 0;
      const features = data?.geojson.features.map((feature) => ({ ...feature, properties: { canonicalId: feature.id, recordType: feature.properties.recordType, name: String(feature.properties.properties.name ?? feature.id), selected: feature.id === selectedId ? "yes" : "no", highlighted: highlight.has(feature.id) ? "yes" : "no", dimmed: hasHighlight && !highlight.has(feature.id) ? "yes" : "no" } })) ?? [];
      (map.getSource("records") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features } as FeatureCollection);
      (map.getSource("discovery-focus") as GeoJSONSource | undefined)?.setData((focusGeometry ?? emptyCollection()) as FeatureCollection<GeoJsonGeometry, GeoJsonProperties>);
    }; if (map.loaded()) update(); else map.once("load", update);
  }, [lat, lon, radiusKm, data, selectedId, highlightedIds, focusGeometry]);
  useEffect(() => {
    const map = mapRef.current; if (!map || !data) return; const ids = new Set(highlightedIds); const coords = data.geojson.features.filter((feature) => !ids.size || ids.has(feature.id)).flatMap((feature) => coordinates(feature.geometry));
    if (coords.length > 1 && ids.size) { const bounds = coords.reduce((value, coord) => value.extend(coord), new LngLatBounds(coords[0]!, coords[0]!)); map.fitBounds(bounds, { padding: 90, maxZoom: 10, duration: 800 }); }
    else map.flyTo({ center: [lon, lat], zoom: Math.max(5, map.getZoom()), duration: 700 });
  }, [data, highlightedIds, lat, lon]);
  return <div className="map" ref={container} aria-label="Interactive discovery map. Click anywhere to explore that location." />;
}

const emptyCollection = (): FeatureCollection => ({ type: "FeatureCollection", features: [] });
function circle(lon: number, lat: number, radiusKm: number): FeatureCollection { const points: [number, number][] = []; const angular = radiusKm / 6371.0088; const lat1 = lat * Math.PI / 180; const lon1 = lon * Math.PI / 180; for (let i = 0; i <= 96; i++) { const bearing = i / 96 * Math.PI * 2; const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing)); const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)); points.push([((lon2 * 180 / Math.PI + 540) % 360) - 180, lat2 * 180 / Math.PI]); } return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [points] } }] }; }
function coordinates(geometry: ContextEnvelope["geojson"]["features"][number]["geometry"]): [number, number][] { if (geometry.type === "Point") return [[geometry.coordinates[0], geometry.coordinates[1]]]; if (geometry.type === "LineString") return geometry.coordinates.map((value) => [value[0], value[1]]); if (geometry.type === "Polygon") return geometry.coordinates.flat().map((value) => [value[0], value[1]]); return []; }
