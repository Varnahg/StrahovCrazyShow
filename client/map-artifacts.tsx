import { memo } from "react";
import {
  OUTDOOR_ARTIFACTS,
  type OutdoorArtifact,
} from "../shared/outdoor-artifacts";
import { OUTDOOR_LANDMARKS } from "../shared/outdoor-landmarks";
import coverage from "../shared/data/campus-coverage.json";

/** A source fence can extend beyond the game while only a short part crosses
 * campus. Anchor its map button on the longest segment inside the walking
 * bounds; retain the original source polyline, identity and world placement. */
export function mapArtifactMarker(artifact: OutdoorArtifact): OutdoorArtifact {
  if (artifact.kind !== "fence" || artifact.points.length < 2) return artifact;
  const bounds = coverage.walkBounds;
  let longestSquared = 0;
  let anchor: { x: number; z: number } | undefined;
  for (let i = 1; i < artifact.points.length; i++) {
    const a = artifact.points[i - 1],
      b = artifact.points[i];
    const dx = b[0] - a[0],
      dz = b[1] - a[1];
    let enter = 0,
      exit = 1;
    // Slab clipping retains exact points on the original source segment.
    for (const [origin, delta, min, max] of [
      [a[0], dx, bounds.minX, bounds.maxX],
      [a[1], dz, bounds.minZ, bounds.maxZ],
    ]) {
      if (delta === 0) {
        if (origin < min || origin > max) exit = -1;
      } else {
        const lo = (min - origin) / delta,
          hi = (max - origin) / delta;
        enter = Math.max(enter, Math.min(lo, hi));
        exit = Math.min(exit, Math.max(lo, hi));
      }
    }
    if (exit <= enter) continue;
    const lengthSquared = (dx * dx + dz * dz) * (exit - enter) ** 2;
    if (lengthSquared <= longestSquared) continue;
    longestSquared = lengthSquared;
    const middle = (enter + exit) / 2;
    anchor = { x: a[0] + middle * dx, z: a[1] + middle * dz };
  }
  return anchor ? { ...artifact, ...anchor } : artifact;
}

export const MAP_ARTIFACTS = [...OUTDOOR_ARTIFACTS, ...OUTDOOR_LANDMARKS].map(
  mapArtifactMarker,
);
const symbols: Record<string, string> = {
  bench: "M-5,0H5M-4,-3H4M-4,0V3M4,0V3",
  "picnic-table": "M-5,-2H5M-3,-2L-4,4M3,-2L4,4M-6,1H6",
  tractor: "M-5,2L-1,-4L3,-2L1,3ZM-4,3H4",
  tower: "M-4,4L0,-6L4,4M-3,1H3M-2,-2H2",
};
const binSymbol = "M-3,-3H3L2,4H-2ZM-4,-4H4";
export const MapArtifactLayer = memo(function MapArtifactLayer({
  scale,
  angle,
  selected,
  onSelect,
}: {
  scale: number;
  angle: number;
  selected?: string;
  onSelect: (artifact: OutdoorArtifact) => void;
}) {
  return (
    <g className="map-artifacts">
      {MAP_ARTIFACTS.map((a) => (
        <g key={a.id}>
          {a.points.length > 1 && (
            <polyline
              className="map-artifact-boundary"
              points={a.points.map((p) => p.join(",")).join(" ")}
              pointerEvents="none"
            />
          )}
          <g
            data-map-marker
            data-artifact-id={a.id}
            className={`map-artifact ${selected === a.id ? "selected" : ""}`}
            transform={`translate(${a.x},${a.z}) rotate(${-angle}) scale(${1 / scale})`}
            role="button"
            tabIndex={0}
            aria-label={a.name}
            aria-pressed={selected === a.id}
            onClick={() => onSelect(a)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onSelect(a);
              }
            }}
          >
            <title>{a.name}</title>
            <circle r="7" />
            <path
              d={
                symbols[a.kind] ??
                (a.kind.includes("waste") || a.kind.includes("recycling")
                  ? binSymbol
                  : "M-3,-4H3V2H-3ZM0,2V5")
              }
            />
          </g>
        </g>
      ))}
    </g>
  );
});
