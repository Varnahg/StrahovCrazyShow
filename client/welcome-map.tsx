import { WELCOME_MAP_GEOMETRY } from "./welcome-map-geometry";

const artwork = (
  <svg
    className="home-map-art"
    viewBox="-610 -310 980 610"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
    focusable="false"
    pointerEvents="none"
  >
    {WELCOME_MAP_GEOMETRY.roads.map((surface) => (
      <path
        key={surface.material}
        className="home-map-roads roads"
        d={surface.path}
        fillRule="evenodd"
      />
    ))}
    <path
      className="home-map-stadium stadium"
      d={WELCOME_MAP_GEOMETRY.stadium}
      fillRule="evenodd"
    />
    <path
      className="home-map-buildings buildings"
      d={WELCOME_MAP_GEOMETRY.buildings}
    />
    <path
      className="home-map-buildings buildings home-map-dormitories dormitories"
      d={WELCOME_MAP_GEOMETRY.dormitories}
    />
  </svg>
);

/** Decorative only. The welcome screen owns colour, blur, sizing and motion. */
export function WelcomeMap() {
  return artwork;
}

export default WelcomeMap;
