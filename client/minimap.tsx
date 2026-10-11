import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
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
  screenToMap,
  type MapPoint,
} from "./minimap-math";
import type { PlanMapRoute, MapNavigation } from "./map-navigation";
import { useLocale, localizeText as L, formatNumber } from "./i18n";
import "./minimap.css";

// Geometry is shared with the actual world and constructed once, not for each
// telemetry update. No extra map tiles, requests, or multiplayer connection.
const BACKGROUND = (
  <>
    {LANDCOVER.areas.map((a) => (
      <polygon
        key={"land:" + a.osmId}
        className={`map-land map-land-${a.kind}`}
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
      className="map-stadium"
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
        className={`map-surface map-surface-${surface.material}`}
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
        className="map-reality-surface"
        points={s.points.map((p) => p.join(",")).join(" ")}
        fill="#a5aaa5"
      />
    ))}
    {BUILDINGS.map((b) => (
      <g
        key={b.id}
        className={`map-building ${blockNumber(b.name) === 6 ? "map-building-b6" : ""}`}
      >
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
  waypoint?: MapPoint;
  onWaypoint?: (point: MapPoint) => void;
  onClearDestination?: () => void;
  planRoute?: PlanMapRoute;
  big?: boolean;
};
export const MapView = memo(function MapView({
  players = [],
  self,
  selected,
  onPlace,
  onPlayer,
  waypoint,
  onWaypoint,
  onClearDestination,
  planRoute,
  big = false,
}: MapViewProps) {
  const locale = useLocale();
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
    destination = waypoint
      ? { ...waypoint, id: undefined, name: L("Vlastní cíl") }
      : selectedPlace,
    selectedScreen = destination
      ? mapToScreen(destination, camera, size)
      : null,
    indicator = selectedScreen && mapEdgeIndicator(selectedScreen, size),
    distance =
      self && destination
        ? Math.round(Math.hypot(self.x - destination.x, self.z - destination.z))
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
  const [navigation, setNavigation] = useState<MapNavigation>();
  const [routePending, setRoutePending] = useState(false);
  const navigationKey = destination
    ? `${destination.id ?? ""}:${destination.x}:${destination.z}`
    : "";
  const previousNavigationKey = useRef("");
  useEffect(() => {
    let current = true;
    if (!self || !destination || !planRoute) {
      setNavigation(undefined);
      setRoutePending(false);
      return;
    }
    if (previousNavigationKey.current !== navigationKey)
      setNavigation(undefined);
    previousNavigationKey.current = navigationKey;
    setRoutePending(true);
    Promise.resolve(planRoute(self, destination)).then(
      (result) => {
        if (!current) return;
        setNavigation(result);
        setRoutePending(false);
      },
      () => {
        if (!current) return;
        setNavigation({
          status: "unavailable",
          points: [],
          distance: 0,
          endpoint: destination,
          toEntrance: false,
        });
        setRoutePending(false);
      },
    );
    return () => {
      current = false;
    };
  }, [
    self ? Math.round(self.x * 10) : null,
    self ? Math.round(self.z * 10) : null,
    destination?.x,
    destination?.z,
    destination?.id,
    planRoute,
  ]);
  const routePoints = useMemo(
    () => navigation?.points.map((p) => `${p.x},${p.z}`).join(" "),
    [navigation],
  );
  return (
    <section
      className={"map-widget " + (big ? "map-widget-big" : "map-widget-mini")}
      aria-label={L(big ? "Velká interaktivní mapa" : "Interaktivní minimapa")}
      data-map-ui
      onKeyDown={(e) => {
        if (!["KeyM", "KeyJ", "KeyG", "Escape"].includes(e.code))
          e.stopPropagation();
      }}
    >
      <header className="map-widget-heading">
        <span id={titleId}>{L(placeLabel)}</span>
        <button
          type="button"
          className="map-north"
          title={L(
            headingUp
              ? "Směr postavy nahoře · přepnout na sever"
              : "Sever nahoře · přepnout na směr postavy",
          )}
          aria-label={L("Otáčet mapu podle směru postavy")}
          aria-pressed={headingUp}
          disabled={!self}
          onClick={() => setHeadingUp(!headingUp)}
        >
          <span style={{ transform: `rotate(${northAngle}deg)` }}>↑</span>{" "}
          {locale === "cs" ? "S" : "N"}
        </button>
      </header>
      <div className="map-viewport">
        <svg
          ref={svg}
          className={big ? "map big-map" : "map"}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="group"
          aria-label={L("Mapa kolejního areálu Strahov podle OpenStreetMap")}
          aria-describedby={hintId}
          tabIndex={0}
          data-follow-player={follow && !!self}
          data-zoom={zoom.toFixed(2)}
          data-map-center={`${camera.x.toFixed(2)},${camera.z.toFixed(2)}`}
          data-route-status={
            routePending ? "planning" : (navigation?.status ?? "none")
          }
          data-route-points={navigation?.points.length ?? 0}
          onClick={(e) => {
            if (
              !onWaypoint ||
              performance.now() < suppressedClickUntil.current ||
              (e.target as Element).closest("[data-map-marker]")
            )
              return;
            onWaypoint(
              screenToMap(
                localPointer(e.clientX, e.clientY),
                cameraRef.current,
                sizeRef.current,
              ),
            );
          }}
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
            if (
              (e.key === "Enter" || e.key === " ") &&
              e.target === e.currentTarget &&
              onWaypoint
            ) {
              e.preventDefault();
              onWaypoint({ x: camera.x, z: camera.z });
            }
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
          <title>{L("Strahov · sever nahoře, metry")}</title>
          <defs>
            <pattern
              id={`${titleId}-grid`}
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M40 0H0V40"
                fill="none"
                stroke="#87c7c0"
                strokeWidth=".5"
                opacity=".07"
              />
            </pattern>
          </defs>
          <rect width={size.width} height={size.height} fill="#101e27" />
          <rect
            width={size.width}
            height={size.height}
            fill={`url(#${titleId}-grid)`}
          />
          <g
            transform={`translate(${size.width / 2},${size.height / 2}) rotate(${northAngle}) scale(${camera.scale}) translate(${-camera.x},${-camera.z})`}
          >
            <MapBackground />
            {routePoints && (
              <g className="map-route" pointerEvents="none">
                <polyline className="map-route-underlay" points={routePoints} />
                <polyline className="map-route-line" points={routePoints} />
              </g>
            )}
            {waypoint && (
              <g
                data-map-marker
                transform={`translate(${waypoint.x},${waypoint.z}) rotate(${-northAngle}) scale(${1 / camera.scale})`}
                className="map-waypoint"
                pointerEvents="none"
              >
                <path d="M0,-10 8,0 0,10 -8,0Z" />
                <circle r="2" />
              </g>
            )}
            {clusters.map((group) => {
              const p =
                  group.places.find((place) => place.id === selected) ||
                  group.places[0],
                clustered = group.places.length > 1,
                active = group.places.some((place) => place.id === selected),
                name = clustered
                  ? `${group.places.length} ${L("míst")}: ${group.places.map((place) => L(place.name)).join(", ")}`
                  : L(p.name);
              return (
                <g
                  key={group.id}
                  data-map-marker
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
                    {L(name)}
                    {!clustered && p.floor
                      ? ` · ${formatNumber(p.floor)} ${L("patro")}`
                      : ""}
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
                    {((big && zoom >= 3) || active || hover === p.id) && (
                      <text
                        x={clustered ? 14 : 10}
                        y="4"
                        className="map-poi-name"
                      >
                        {clustered
                          ? active
                            ? L(shortName(p.id, p.name))
                            : `${group.places.length} ${L("míst")}`
                          : L(shortName(p.id, p.name))}
                      </text>
                    )}
                  </g>
                </g>
              );
            })}
            {players.map((p) => (
              <g
                key={p.id}
                data-map-marker
                transform={`translate(${p.x},${p.z}) rotate(${-northAngle}) scale(${1 / camera.scale})`}
                role={onPlayer ? "button" : undefined}
                tabIndex={onPlayer ? 0 : undefined}
                aria-label={`${L("Vybrat hráče")} ${p.nickname}`}
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
                  <title>
                    {p.nickname} · {L("virtuálně online")}
                  </title>
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
                  <title>{L("Tvoje virtuální poloha")}</title>
                </path>
              </g>
            )}
          </g>
          {indicator?.offscreen && destination && (
            <g
              transform={`translate(${indicator.x},${indicator.y})`}
              className="map-target-edge"
              data-map-marker
              role="button"
              tabIndex={0}
              aria-label={`${L("Cíl mimo výřez")}: ${L(destination.name)}`}
              onClick={() => {
                setFreeCenter(destination);
                setFollow(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setFreeCenter(destination);
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
              <title>
                {L(destination.name)} · {L("zobrazit cíl")}
              </title>
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
        <div className="map-tools" role="group" aria-label={L("Ovládání mapy")}>
          <button
            type="button"
            aria-label={L("Přiblížit mapu")}
            title={L("Přiblížit (+)")}
            disabled={zoom >= maxZoom}
            onClick={() => changeZoom(1.3)}
          >
            +
          </button>
          <button
            type="button"
            aria-label={L("Oddálit mapu")}
            title={L("Oddálit (−)")}
            disabled={zoom <= 1}
            onClick={() => changeZoom(1 / 1.3)}
          >
            −
          </button>
          <button
            type="button"
            aria-label={L("Sledovat moji postavu")}
            title={L("Sledovat moji postavu")}
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
            aria-label={L("Zobrazit celý areál")}
            title={L("Celý areál (Home)")}
            onClick={reset}
          >
            ⛶
          </button>
        </div>
      </div>
      {expandedPlaces.length > 1 && (
        <div
          className="map-cluster-list"
          aria-label={L("Místa v této části mapy")}
        >
          <header>
            <strong>
              {expandedPlaces.length} {L("míst v okolí")}
            </strong>
            <button
              type="button"
              aria-label={L("Zavřít seznam míst")}
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
              {L(place.name)}
              <span>↗</span>
            </button>
          ))}
        </div>
      )}
      {destination && (
        <div
          className="map-destination"
          data-navigation-status={
            routePending ? "planning" : (navigation?.status ?? "none")
          }
        >
          <span>
            ◆{" "}
            {selectedPlace
              ? L(shortName(selectedPlace.id, selectedPlace.name))
              : L("Vlastní cíl")}
          </span>
          <strong>
            {routePending
              ? L("Hledám trasu…")
              : navigation?.status === "arrived"
                ? L("Jsi v cíli")
                : navigation?.status === "unavailable"
                  ? L("Trasa není dostupná")
                  : navigation?.status === "route"
                    ? `${formatNumber(Math.round(navigation.distance))} m`
                    : distance != null
                      ? `${distance} m · ${L("směr")}`
                      : L("Vybrané místo")}
          </strong>
          {onClearDestination && (
            <button
              type="button"
              className="map-clear-target"
              onClick={onClearDestination}
              aria-label={L("Zrušit navigační cíl")}
              title={L("Zrušit navigační cíl")}
            >
              ×
            </button>
          )}
        </div>
      )}
      {big && navigation?.toEntrance && (
        <p className="map-route-note">
          {L("Trasa vede k venkovnímu přístupu.")}
        </p>
      )}
      <p id={hintId} className="map-help map-sr-only">
        {L(
          "Kolečko přibližuje, tažení posouvá. Kliknutím označíš cíl; Enter označí střed mapy.",
        )}
      </p>
    </section>
  );
});
