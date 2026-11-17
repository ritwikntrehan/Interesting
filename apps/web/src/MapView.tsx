import { useEffect, useRef } from "react";
import { Map as MapLibreMap, NavigationControl, ScaleControl, setWorkerUrl, type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { FeatureCollection } from "geojson";
import type { ContextEnvelope } from "../../../packages/contracts/src/index.ts";

interface Props { lat: number; lon: number; radiusKm: number; data: ContextEnvelope | null; selectedId?: string | null; onLocation(lat: number, lon: number): void; onSelect(id: string): void }

setWorkerUrl(mapWorkerUrl);

export function MapView({ lat, lon, radiusKm, data, selectedId, onLocation, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null); const mapRef = useRef<MapLibreMap | null>(null);
  const callbacks = useRef({ onLocation, onSelect }); callbacks.current = { onLocation, onSelect };
  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new MapLibreMap({ container: container.current, style: import.meta.env.VITE_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty", center: [lon, lat], zoom: 7 });
    map.addControl(new NavigationControl(), "top-right"); map.addControl(new ScaleControl({ unit: "metric" }));
    map.on("click", (event: MapMouseEvent) => {
      const hit = map.queryRenderedFeatures(event.point, { layers: map.getLayer("records") ? ["records"] : [] });
      if (hit[0]?.properties?.canonicalId) callbacks.current.onSelect(String(hit[0].properties.canonicalId)); else callbacks.current.onLocation(Number(event.lngLat.lat.toFixed(6)), Number(event.lngLat.lng.toFixed(6)));
    });
    map.on("load", () => {
      map.addSource("query-area", { type: "geojson", data: circle(lon, lat, radiusKm) });
      map.addLayer({ id: "query-fill", type: "fill", source: "query-area", paint: { "fill-color": "#0d9488", "fill-opacity": 0.08 } });
      map.addLayer({ id: "query-line", type: "line", source: "query-area", paint: { "line-color": "#0f766e", "line-width": 2, "line-dasharray": [2, 2] } });
      map.addSource("records", { type: "geojson", data: emptyCollection() });
      map.addLayer({ id: "records", type: "circle", source: "records", paint: { "circle-radius": ["match", ["get", "selected"], "yes", 10, ["match", ["get", "recordType"], "earthquake", 7, "geology", 9, "mineral_occurrence", 6, 6]], "circle-color": ["match", ["get", "recordType"], "geology", "#7c3aed", "mineral_occurrence", "#d97706", "mapped_port", "#0284c7", "earthquake", "#dc2626", "#334155"], "circle-stroke-color": ["match", ["get", "selected"], "yes", "#102a27", "#ffffff"], "circle-stroke-width": ["match", ["get", "selected"], "yes", 3, 1.5], "circle-opacity": 0.9 } });
      map.on("mouseenter", "records", () => { map.getCanvas().style.cursor = "pointer"; }); map.on("mouseleave", "records", () => { map.getCanvas().style.cursor = "crosshair"; });
    });
    mapRef.current = map; return () => { map.remove(); mapRef.current = null; };
  }, []);
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const update = () => {
      (map.getSource("query-area") as GeoJSONSource | undefined)?.setData(circle(lon, lat, radiusKm));
      const features = data?.geojson.features.map((feature) => ({ ...feature, properties: { canonicalId: feature.id, recordType: feature.properties.recordType, name: String(feature.properties.properties.name ?? feature.id), selected: feature.id === selectedId ? "yes" : "no" } })) ?? [];
      (map.getSource("records") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features } as FeatureCollection);
    };
    if (map.loaded()) update(); else map.once("load", update);
  }, [lat, lon, radiusKm, data, selectedId]);
  return <div className="map" ref={container} aria-label="Interactive results map. Click to choose a coordinate." />;
}

const emptyCollection = (): FeatureCollection => ({ type: "FeatureCollection", features: [] });
function circle(lon: number, lat: number, radiusKm: number): FeatureCollection {
  const points: [number, number][] = []; const earth = 6371.0088; const angular = radiusKm / earth; const lat1 = lat * Math.PI / 180; const lon1 = lon * Math.PI / 180;
  for (let i = 0; i <= 96; i++) { const bearing = i / 96 * Math.PI * 2; const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing)); const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)); points.push([((lon2 * 180 / Math.PI + 540) % 360) - 180, lat2 * 180 / Math.PI]); }
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [points] } }] };
}
