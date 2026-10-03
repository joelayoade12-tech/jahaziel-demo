import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "./demo-map.css";

const OSU_CENTER: [number, number] = [-83.0153, 40.0017];
const DARK_STYLE = "https://tiles.openfreemap.org/styles/dark";

function addBuildingExtrusions(map: MapLibreMap) {
  if (map.getLayer("demo-3d-buildings")) return;
  const labelLayer = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
  try {
    map.addLayer({
      id: "demo-3d-buildings", source: "openmaptiles", "source-layer": "building", type: "fill-extrusion", minzoom: 13,
      paint: {
        "fill-extrusion-color": "#1d3a4f",
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": 0.92,
      },
    }, labelLayer);
  } catch { /* The public style may omit building geometry in some places. */ }
}

function locationArrow(): HTMLElement {
  const arrow = document.createElement("div");
  arrow.className = "demo-map-me";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "30");
  svg.setAttribute("height", "30");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M12 2 L19 21 L12 16.5 L5 21 Z");
  path.setAttribute("fill", "#ff4d4d");
  path.setAttribute("stroke", "#ffd0d0");
  path.setAttribute("stroke-width", "1");
  svg.appendChild(path);
  arrow.appendChild(svg);
  return arrow;
}

export function DemoMap({ open }: { open: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const pin = useRef<MapLibreMarker | null>(null);
  const me = useRef<MapLibreMarker | null>(null);
  const pinModeRef = useRef(false);
  const [pinMode, setPinMode] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pitch, setPitch] = useState(55);
  const [status, setStatus] = useState("Loading the hologram map…");
  const [locating, setLocating] = useState(false);

  useEffect(() => { pinModeRef.current = pinMode; }, [pinMode]);
  useEffect(() => {
    if (!open || !container.current) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (map.current) { map.current.resize(); return; }
      try {
        const module = await import("maplibre-gl");
        const maplibregl = module.default || module;
        maplibregl.setWorkerUrl(mapWorkerUrl);
        if (cancelled || !container.current) return;
        const instance = new maplibregl.Map({
          container: container.current, style: DARK_STYLE, center: OSU_CENTER, zoom: 14.5,
          minZoom: 1.4, pitch: 55, maxPitch: 55, bearing: -15,
          canvasContextAttributes: { antialias: true }, attributionControl: { compact: true },
          dragRotate: true, pitchWithRotate: false,
        });
        map.current = instance;
        instance.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
        instance.on("style.load", () => {
          addBuildingExtrusions(instance);
          try { instance.setProjection({ type: "globe" }); } catch { /* Flat-map fallback. */ }
        });
        instance.on("load", () => setStatus("Map ready. Pan, zoom, or enable Pin mode."));
        instance.on("pitch", () => setPitch(Math.round(instance.getPitch())));
        instance.on("error", () => setStatus("Public map tiles are temporarily unavailable."));
        instance.on("click", (event) => {
          if (!pinModeRef.current) return;
          const coordinates: [number, number] = [event.lngLat.lng, event.lngLat.lat];
          if (pin.current) pin.current.setLngLat(coordinates);
          else pin.current = new maplibregl.Marker({ color: "#ffd166" }).setLngLat(coordinates).addTo(instance);
          setStatus(`Demo pin: ${event.lngLat.lat.toFixed(5)}, ${event.lngLat.lng.toFixed(5)}`);
        });
        const observer = new ResizeObserver(() => instance.resize());
        observer.observe(container.current);
        instance.on("remove", () => observer.disconnect());
      } catch (error) { setStatus(`The map could not load: ${error instanceof Error ? error.message : String(error)}`); }
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [open]);
  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);

  function locate() {
    if (!navigator.geolocation) { setStatus("This browser does not offer location sharing."); return; }
    setLocating(true);
    setStatus("Waiting for your location permission…");
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      setLocating(false);
      const instance = map.current;
      if (!instance) { setStatus("Open the map again to use your location."); return; }
      const { Marker } = await import("maplibre-gl");
      const coordinates: [number, number] = [coords.longitude, coords.latitude];
      if (me.current) me.current.setLngLat(coordinates);
      else me.current = new Marker({ element: locationArrow() }).setLngLat(coordinates).addTo(instance);
      instance.flyTo({ center: coordinates, zoom: Math.max(instance.getZoom(), 15), essential: true });
      setStatus("Showing your location for this visit. It is not saved by the demo.");
    }, (error) => {
      setLocating(false);
      setStatus(error.code === 1 ? "Location permission was denied. You can still explore the map." : "Your location is unavailable right now.");
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
  }

  return <div className="demo-map-body">
    <div className="demo-map-area">
      <div className="demo-map-canvas" ref={container} aria-label="Interactive hologram-style map" />
      <div className="demo-map-toolbar">
        <div className="demo-map-search" title="Place search requires the full map service"><i className="ph ph-magnifying-glass" /><span>Explore the map</span></div>
        <button type="button" className="demo-map-chip" onClick={locate} disabled={locating} aria-label="Locate me" title="Requests browser permission. Nearby public map tiles load from OpenFreeMap; the demo does not save your coordinates."><i className="ph ph-crosshair" /> {locating ? "Locating…" : "Locate"}</button>
        <label className={`demo-map-pitch${pitch > 5 ? " active" : ""}`}><i className="ph ph-cube" /><input aria-label="3D tilt" type="range" min="0" max="55" value={pitch} onChange={(event) => { const value = Number(event.target.value); setPitch(value); map.current?.easeTo({ pitch: value, duration: 150 }); }} /><span>{pitch}°</span></label>
        <button type="button" className={`demo-map-chip${drawerOpen ? " active" : ""}`} onClick={() => setDrawerOpen((value) => !value)}><i className="ph ph-stack" /> Layers</button>
      </div>
      {drawerOpen && <aside className="demo-map-drawer" aria-label="Map layers">
        <span className="demo-map-drawer-head">View</span><button type="button" disabled title="Satellite imagery needs the full map service"><i className="ph ph-planet" /> Satellite <small>Full demo</small></button>
        <span className="demo-map-drawer-head">Pins</span><button type="button" className={pinMode ? "active" : ""} onClick={() => setPinMode((value) => !value)}><i className="ph ph-push-pin" /> Pin mode</button>
        <span className="demo-map-drawer-head">Live layers</span><button type="button" disabled><i className="ph ph-airplane" /> Planes <small>Full demo</small></button><button type="button" disabled><i className="ph ph-broadcast" /> Satellites <small>Full demo</small></button><button type="button" disabled><i className="ph ph-newspaper" /> News <small>Full demo</small></button>
        <button type="button" onClick={() => { map.current?.flyTo({ center: OSU_CENTER, zoom: 14.5, pitch: 55, bearing: -15 }); setDrawerOpen(false); }}>Return to OSU</button>
      </aside>}
    </div>
    <div className="demo-map-events"><div className="demo-map-events-head"><span>Map &amp; events</span><small>Public demo · no calendar connected</small></div><div className="demo-map-event-status" role="status">{status}</div></div>
  </div>;
}
