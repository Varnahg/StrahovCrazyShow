import { memo, useEffect, useId, useRef, useState } from "react";
import {
  BUILDINGS,
  BOUNDS,
  PLACES,
  STADIUM,
  blockNumber,
} from "../shared/world";
import { STREET_SURFACES } from "../shared/streets";
import { LANDCOVER } from "../shared/vegetation";
import { REALITY_GROUND } from "../shared/terrain";
import type { Player } from "../shared/types";
import { clusterMapPlaces } from "./interaction";
import {
  clampMapCamera,
  fitMapScale,
  mapEdgeIndicator,
  mapHeading,
  mapToScreen,
  panMapBy,
  zoomMapAt,
  type MapPoint,
} from "./minimap-math";
import "./minimap.css";

// Geometry is shared with the actual world and constructed once, not for each
// telemetry update. No extra map tiles, requests, or multiplayer connection.
const BACKGROUND = (
  <>
    {LANDCOVER.areas.map((a) => (
      <polygon
        key={"land:" + a.osmId}
        points={a.points.map((p) => p.join(",")).join(" ")}
        fill={
          a.kind === "pitch"
            ? "#9aaf88"
            : ["wood", "forest"].includes(a.kind)
              ? "#8ca17d"
              : "#bdcba6"
        }
      />
    ))}
    <path
      d={[...STADIUM.outerRings, ...STADIUM.innerRings]
        .map((ring) => "M" + ring.map((p) => p.join(",")).join("L") + "Z")
        .join(" ")}
      fill="#a6aba3"
      stroke="#6e796b"
      strokeWidth=".65"
      fillRule="evenodd"
    />
    {STREET_SURFACES.map((surface) => (
      <path
        key={surface.material}
        fill={
          surface.material === "asphalt"
            ? "#a5aaa5"
            : surface.material === "paving"
              ? "#e5dbc5"
              : "#c3c2ae"
        }
        fillRule="evenodd"
        d={surface.polygons
          .flatMap((p) => [p.outer, ...p.holes])
          .map((ring) => "M" + ring.map((p) => p.join(",")).join("L") + "Z")
          .join(" ")}
      />
    ))}
    {REALITY_GROUND.surfaces.map((s) => (
      <polygon
        key={s.id}
        points={s.points.map((p) => p.join(",")).join(" ")}
        fill="#a5aaa5"
      />
    ))}
    {BUILDINGS.map((b) => (
      <g key={b.id}>
        <polygon
          points={b.points.map((p) => p.join(",")).join(" ")}
          fill={blockNumber(b.name) === 6 ? "#e8cf8d" : "#d4c9aa"}
          stroke="#6e796b"
          strokeWidth=".65"
        />
        {blockNumber(b.name) && (
          <text
            x={b.points.reduce((s, p) => s + p[0], 0) / b.points.length}
            y={b.points.reduce((s, p) => s + p[1], 0) / b.points.length + 2}
            fontSize="7.5"
            fill="#455443"
            textAnchor="middle"
            fontWeight="700"
          >
            {blockNumber(b.name)}
          </text>
        )}
      </g>
    ))}
  </>
);
const MapBackground = memo(() => BACKGROUND);
const mapBounds = {
  minX: BOUNDS.minX - 8,
  maxX: BOUNDS.maxX + 8,
  minZ: BOUNDS.minZ - 8,
  maxZ: BOUNDS.maxZ + 8,
};
const center = {
  x: (mapBounds.minX + mapBounds.maxX) / 2,
  z: (mapBounds.minZ + mapBounds.maxZ) / 2,
};
const shortName = (id: string, name: string) =>
  ({
    b6: "B6",
    club6: "Klubovna B6",
    seven: "007",
    rko: "R-ko",
    sports: "Mezi bloky",
  })[id] || name;

export type MapViewProps = {
  players?: Player[];
  self?: MapPoint & { yaw?: number };
  selected?: string;
  onPlace?: (id: string) => void;
  onPlayer?: (id: string) => void;
  big?: boolean;
};
export const MapView = memo(function MapView({
  players = [],
  self,
  selected,
  onPlace,
  onPlayer,
  big = false,
}: MapViewProps) {
  const svg = useRef<SVGSVGElement>(null),
    titleId = useId(),
    hintId = useId(),
    drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(
      null,
    ),
    gesture = useRef(new Map<number, { x: number; y: number }>()),
    pinchDistance = useRef(0),
    suppressedClickUntil = useRef(0);
  const [size, setSize] = useState({
      width: big ? 520 : 222,
      height: big ? 340 : 186,
    }),
    [zoom, setZoom] = useState(
      big
        ? 1
        : Math.min(
            12,
            Math.max(
              1,
              222 / (180 * fitMapScale(mapBounds, { width: 222, height: 186 })),
            ),
          ),
    ),
    [freeCenter, setFreeCenter] = useState(center),
    [follow, setFollow] = useState(!big),
    [headingUp, setHeadingUp] = useState(false),
    [hover, setHover] = useState<string | null>(null),
    [expandedIds, setExpandedIds] = useState<string[]>([]);
  const fit = fitMapScale(mapBounds, size),
    maxZoom = 12,
    rotation = headingUp && self ? -mapHeading(self.yaw) : 0,
    camera = clampMapCamera(
      { ...(follow && self ? self : freeCenter), scale: fit * zoom, rotation },
      mapBounds,
      size,
    ),
    cameraRef = useRef(camera),
    sizeRef = useRef(size);
  cameraRef.current = camera;
  sizeRef.current = size;
  const localPointer = (clientX: number, clientY: number) => {
    const transform = svg.current?.getScreenCTM();
    if (transform) {
      const p = new DOMPoint(clientX, clientY).matrixTransform(
        transform.inverse(),
      );
      return { x: p.x, y: p.y };
    }
    const rect = svg.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left || 0), y: clientY - (rect?.top || 0) };
  };
  useEffect(() => {
    if (!svg.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width && height) setSize({ width, height });
    });
    observer.observe(svg.current);
    return () => observer.disconnect();
  }, []);
  const changeZoom = (
    factor: number,
    anchor = { x: size.width / 2, y: size.height / 2 },
  ) => {
    const current = cameraRef.current,
      viewport = sizeRef.current,
      base = fitMapScale(mapBounds, viewport),
      nextZoom = Math.max(
        1,
        Math.min(maxZoom, (current.scale / base) * factor),
      ),
      next = clampMapCamera(
        zoomMapAt(current, anchor, base * nextZoom, viewport),
        mapBounds,
        viewport,
      );
    setZoom(nextZoom);
    // Buttons at the centre keep following. A wheel anchored elsewhere should
    // preserve that point instead of snapping back to the player next frame.
    if (
      Math.abs(anchor.x - viewport.width / 2) > 1 ||
      Math.abs(anchor.y - viewport.height / 2) > 1
    ) {
      setFollow(false);
      setFreeCenter(next);
    }
    cameraRef.current = next;
  };
  const zoomRef = useRef(changeZoom);
  zoomRef.current = changeZoom;
  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      zoomRef.current(
        Math.exp(-Math.max(-200, Math.min(200, event.deltaY)) * 0.003),
        localPointer(event.clientX, event.clientY),
      );
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, []);
  const pan = (dx: number, dy: number) => {
    const next = clampMapCamera(
      panMapBy(cameraRef.current, dx, dy),
      mapBounds,
      sizeRef.current,
    );
    cameraRef.current = next;
    setFreeCenter(next);
    setFollow(false);
  };
  const reset = () => {
    setZoom(1);
    setFreeCenter(center);
    setFollow(false);
    setHeadingUp(false);
  };
  const pick = (id: string) => {
    if (performance.now() >= suppressedClickUntil.current) {
      setExpandedIds([]);
      onPlace?.(id);
    }
  };
  const clusters = clusterMapPlaces(PLACES, camera.scale),
    expandedPlaces = PLACES.filter((p) => expandedIds.includes(p.id));
  const pickCluster = (places: typeof PLACES) => {
    if (performance.now() < suppressedClickUntil.current) return;
    if (places.length === 1) pick(places[0].id);
    else setExpandedIds(places.map((p) => p.id));
  };
  const selectedPlace = PLACES.find((p) => p.id === selected),
    selectedScreen = selectedPlace
      ? mapToScreen(selectedPlace, camera, size)
      : null,
    indicator = selectedScreen && mapEdgeIndicator(selectedScreen, size),
    distance =
      self && selectedPlace
        ? Math.round(
            Math.hypot(self.x - selectedPlace.x, self.z - selectedPlace.z),
          )
        : null,
    northAngle = (rotation * 180) / Math.PI,
    nearest =
      self &&
      PLACES.filter((p) => p.id !== "club6")
        .map((p) => ({
          ...p,
          distance: Math.hypot(self.x - p.x, self.z - p.z),
        }))
        .sort((a, b) => a.distance - b.distance)[0],
    placeLabel =
      PLACES.find((p) => p.id === hover)?.name ||
      (nearest && nearest.distance < 45 ? nearest.name : "Strahov");
  return (
    <section
      className={"map-widget " + (big ? "map-widget-big" : "map-widget-mini")}
      aria-label={big ? "Velká interaktivní mapa" : "Interaktivní minimapa"}
      data-map-ui
      onKeyDown={(e) => {
        if (!["KeyM", "KeyJ", "KeyG", "Escape"].includes(e.code))
          e.stopPropagation();
      }}
    >
      <header className="map-widget-heading">
        <span id={titleId}>{placeLabel}</span>
        <button
          type="button"
          className="map-north"
          title={
            headingUp
              ? "Směr postavy nahoře · přepnout na sever"
              : "Sever nahoře · přepnout na směr postavy"
          }
          aria-label="Otáčet mapu podle směru postavy"
          aria-pressed={headingUp}
          disabled={!self}
          onClick={() => setHeadingUp(!headingUp)}
        >
          <span style={{ transform: `rotate(${northAngle}deg)` }}>↑</span> S
        </button>
      </header>
      <div className="map-viewport">
        <svg
          ref={svg}
          className={big ? "map big-map" : "map"}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="group"
          aria-label="Mapa kolejního areálu Strahov podle OpenStreetMap"
          aria-describedby={hintId}
          tabIndex={0}
          data-follow-player={follow && !!self}
          data-zoom={zoom.toFixed(2)}
          data-map-center={`${camera.x.toFixed(2)},${camera.z.toFixed(2)}`}
          onKeyDown={(e) => {
            if (
              [
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "+",
                "=",
                "-",
                "Home",
              ].includes(e.key)
            )
              e.preventDefault();
            if (e.key === "ArrowLeft") pan(35, 0);
            if (e.key === "ArrowRight") pan(-35, 0);
            if (e.key === "ArrowUp") pan(0, 35);
            if (e.key === "ArrowDown") pan(0, -35);
            if (e.key === "+" || e.key === "=") changeZoom(1.3);
            if (e.key === "-") changeZoom(1 / 1.3);
            if (e.key === "Home") reset();
          }}
          onPointerDown={(e) => {
            if (e.button !== 0 && e.pointerType !== "touch") return;
            const point = localPointer(e.clientX, e.clientY);
            gesture.current.set(e.pointerId, point);
            if (gesture.current.size === 2) {
              const [a, b] = [...gesture.current.values()];
              pinchDistance.current = Math.hypot(a.x - b.x, a.y - b.y);
              for (const id of gesture.current.keys())
                e.currentTarget.setPointerCapture(id);
            }
            drag.current = {
              id: e.pointerId,
              x: point.x,
              y: point.y,
              moved: false,
            };
          }}
          onPointerMove={(e) => {
            const pointer = gesture.current.get(e.pointerId);
            if (!pointer) return;
            const point = localPointer(e.clientX, e.clientY);
            gesture.current.set(e.pointerId, point);
            if (gesture.current.size === 2) {
              const [a, b] = [...gesture.current.values()],
                distance = Math.hypot(a.x - b.x, a.y - b.y);
              if (pinchDistance.current > 0)
                changeZoom(distance / pinchDistance.current, {
                  x: (a.x + b.x) / 2,
                  y: (a.y + b.y) / 2,
                });
              pinchDistance.current = distance;
              suppressedClickUntil.current = performance.now() + 250;
            } else if (drag.current?.id === e.pointerId) {
              const dx = point.x - drag.current.x,
                dy = point.y - drag.current.y;
              if (drag.current.moved || Math.hypot(dx, dy) > 4) {
                e.currentTarget.setPointerCapture(e.pointerId);
                pan(dx, dy);
                drag.current.x = point.x;
                drag.current.y = point.y;
                drag.current.moved = true;
                suppressedClickUntil.current = performance.now() + 250;
              }
            }
          }}
          onPointerUp={(e) => {
            gesture.current.delete(e.pointerId);
            pinchDistance.current = 0;
            if (drag.current?.id === e.pointerId) {
              const remaining = [...gesture.current.entries()][0];
              drag.current = remaining
                ? { id: remaining[0], ...remaining[1], moved: true }
                : null;
            }
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={(e) => {
            gesture.current.delete(e.pointerId);
            drag.current = null;
            pinchDistance.current = 0;
          }}
          onPointerLeave={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
              gesture.current.delete(e.pointerId);
              if (drag.current?.id === e.pointerId) drag.current = null;
            }
          }}
        >
          <title>Strahov · sever nahoře, metry</title>
          <rect width={size.width} height={size.height} fill="#b8c3a5" />
          <g
            transform={`translate(${size.width / 2},${size.height / 2}) rotate(${northAngle}) scale(${camera.scale}) translate(${-camera.x},${-camera.z})`}
          >
            <MapBackground />
            {clusters.map((group) => {
              const p =
                  group.places.find((place) => place.id === selected) ||
                  group.places[0],
                clustered = group.places.length > 1,
                active = group.places.some((place) => place.id === selected),
                name = clustered
                  ? `${group.places.length} míst: ${group.places.map((place) => place.name).join(", ")}`
                  : p.name;
              return (
                <g
                  key={group.id}
                  transform={`translate(${group.x},${group.z}) rotate(${-northAngle}) scale(${1 / camera.scale})`}
                  className={"map-poi " + (active ? "map-poi-selected" : "")}
                  role={onPlace ? "button" : undefined}
                  tabIndex={onPlace ? 0 : undefined}
                  aria-label={name}
                  aria-expanded={
                    clustered ? expandedIds.includes(p.id) : undefined
                  }
                  aria-pressed={onPlace ? active : undefined}
                  onPointerEnter={() => setHover(p.id)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(p.id)}
                  onBlur={() => setHover(null)}
                  onClick={() => pickCluster(group.places)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      pickCluster(group.places);
                    }
                  }}
                >
                  <title>
                    {name}
                    {!clustered && p.floor ? ` · ${p.floor}. patro` : ""}
                  </title>
                  <g>
                    <circle r="12" fill="transparent" />
                    <circle
                      className="map-poi-dot"
                      r={clustered ? 10 : active ? 7 : 5}
                      fill={
                        active
                          ? "#f7db7e"
                          : p.id === "club6"
                            ? "#9d7ab9"
                            : "#245c4c"
                      }
                      stroke="#fff5d5"
                      strokeWidth="1.6"
                    />
                    {clustered && (
                      <text
                        textAnchor="middle"
                        y="3.5"
                        className="map-cluster-count"
                      >
                        {group.places.length}
                      </text>
                    )}
                    {(big || zoom >= 4 || active || hover === p.id) && (
                      <text
                        x={clustered ? 14 : 10}
                        y="4"
                        className="map-poi-name"
                      >
                        {clustered
                          ? active
                            ? shortName(p.id, p.name)
                            : `${group.places.length} míst`
                          : shortName(p.id, p.name)}
                      </text>
                    )}
                  </g>
                </g>
              );
            })}
            {players.map((p) => (
              <g
                key={p.id}
                transform={`translate(${p.x},${p.z}) rotate(${-northAngle}) scale(${1 / camera.scale})`}
                role={onPlayer ? "button" : undefined}
                tabIndex={onPlayer ? 0 : undefined}
                aria-label={`Vybrat hráče ${p.nickname}`}
                className="map-player"
                onClick={() => {
                  if (performance.now() >= suppressedClickUntil.current)
                    onPlayer?.(p.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onPlayer?.(p.id);
                  }
                }}
              >
                <circle r="9" fill="transparent" />
                <circle r="3" fill="#8760ad" stroke="#eee4ff" strokeWidth=".8">
                  <title>{p.nickname} · virtuálně online</title>
                </circle>
              </g>
            ))}
            {self && (
              <g
                className="map-self"
                transform={`translate(${self.x},${self.z}) rotate(${-northAngle}) scale(${1 / camera.scale})`}
              >
                <circle r="11" fill="#faf4c0" opacity=".25" />
                <path
                  d="M0,-9 L6,6 L0,3 L-6,6 Z"
                  transform={`rotate(${(mapHeading(self.yaw) * 180) / Math.PI + northAngle})`}
                  fill="#f9edb0"
                  stroke="#244b3c"
                  strokeWidth="1.7"
                >
                  <title>Tvoje virtuální poloha</title>
                </path>
              </g>
            )}
          </g>
          {indicator?.offscreen && selectedPlace && (
            <g
              transform={`translate(${indicator.x},${indicator.y})`}
              className="map-target-edge"
              role="button"
              tabIndex={0}
              aria-label={`Cíl mimo výřez: ${selectedPlace.name}`}
              onClick={() => {
                setFreeCenter(selectedPlace);
                setFollow(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setFreeCenter(selectedPlace);
                  setFollow(false);
                }
              }}
            >
              <circle
                r="11"
                fill="#244b3c"
                stroke="#f7db7e"
                strokeWidth="1.3"
              />
              <path
                d="M0,-6 L4,4 L0,2 L-4,4 Z"
                fill="#f7db7e"
                transform={`rotate(${indicator.angle})`}
              />
              <title>{selectedPlace.name} · zobrazit cíl</title>
            </g>
          )}
          <g
            className="map-scale"
            transform={`translate(12,${size.height - 12})`}
          >
            <path d={`M0,-4 V0 H${fit * zoom * (zoom >= 5 ? 10 : 50)} V-4`} />
            <text y="-5">{zoom >= 5 ? "10 m" : "50 m"}</text>
          </g>
        </svg>
        <div className="map-tools" role="group" aria-label="Ovládání mapy">
          <button
            type="button"
            aria-label="Přiblížit mapu"
            title="Přiblížit (+)"
            disabled={zoom >= maxZoom}
            onClick={() => changeZoom(1.3)}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Oddálit mapu"
            title="Oddálit (−)"
            disabled={zoom <= 1}
            onClick={() => changeZoom(1 / 1.3)}
          >
            −
          </button>
          <button
            type="button"
            aria-label="Sledovat moji postavu"
            title="Sledovat moji postavu"
            aria-pressed={follow}
            disabled={!self}
            onClick={() => {
              setFollow(true);
              if (zoom < 2)
                setZoom(
                  Math.min(maxZoom, Math.max(1, size.width / (180 * fit))),
                );
            }}
          >
            ⌖
          </button>
          <button
            type="button"
            aria-label="Zobrazit celý areál"
            title="Celý areál (Home)"
            onClick={reset}
          >
            ⛶
          </button>
        </div>
      </div>
      {expandedPlaces.length > 1 && (
        <div className="map-cluster-list" aria-label="Místa v této části mapy">
          <header>
            <strong>{expandedPlaces.length} míst v okolí</strong>
            <button
              type="button"
              aria-label="Zavřít seznam míst"
              onClick={() => setExpandedIds([])}
            >
              ×
            </button>
          </header>
          {expandedPlaces.map((place) => (
            <button
              type="button"
              key={place.id}
              onClick={() => pick(place.id)}
              aria-pressed={selected === place.id}
            >
              <span>⌖</span>
              {place.name}
              <span>↗</span>
            </button>
          ))}
        </div>
      )}
      {selectedPlace && (
        <div className="map-destination">
          <span>◆ {shortName(selectedPlace.id, selectedPlace.name)}</span>
          <strong>
            {distance != null ? `${distance} m` : "Vybrané místo"}
          </strong>
        </div>
      )}
      <p id={hintId} className={big ? "map-help" : "map-help map-sr-only"}>
        Kolečko nebo +/− přibližuje. Tažením či šipkami posuneš mapu. ⌖ sleduje
        postavu, ⛶ zobrazí areál. Vzdálenost je vzdušnou čarou.
      </p>
    </section>
  );
});
