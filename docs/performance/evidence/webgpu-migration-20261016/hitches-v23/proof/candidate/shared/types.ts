export type Vec3 = { x: number; y: number; z: number };
export type AvatarConfig = {
  preset: number;
  skin: string;
  hair: string;
  shirt: string;
  trousers: string;
  glasses: boolean;
  beard: boolean;
  face: number;
  badge?: string;
};
export type Profile = {
  nickname: string;
  avatar: AvatarConfig;
  interests: string[];
  social: boolean;
  firstTime: boolean;
};
export type Input = {
  x: number;
  z: number;
  yaw: number;
  jump: boolean;
  seq: number;
  run?: boolean;
  vehicle?: boolean;
};
export type Player = Vec3 &
  Profile & {
    id: string;
    yaw: number;
    emote: string;
    vehicle: boolean;
    speed: number;
    ack: number;
    zone: string;
    /** Authoritative contact state; older local/demo records may omit it. */
    grounded?: boolean;
  };
export type Place = {
  id: string;
  name: string;
  x: number;
  z: number;
  floor?: number;
  description: string;
  source?: string;
  worldLabel?: boolean;
};
export type EventItem = {
  id: string;
  title: string;
  description: string;
  placeId: string;
  startsAt: number;
  endsAt: number;
  tags: string[];
  cancelled: boolean;
  owner?: string;
  demo: true;
};
export type Attendance = {
  eventId: string;
  playerId: string;
  company: boolean;
};
export type ChatMessage = {
  id: string;
  sender: string;
  nickname: string;
  text: string;
  channel: string;
  at: number;
};
export type SocialState = {
  attendance: Attendance[];
  contacts: string[];
  requests: string[];
  blocked: string[];
};
export type ActivityState = {
  hunt: string[];
  quiz: {
    question: number;
    deadline: number;
    scores: Record<string, number>;
    running: boolean;
    teamScores: Record<string, number>;
  };
};
export type Building = {
  id: string;
  name: string;
  points: [number, number][];
  height: number;
  source: string;
};
export type WorldMap = {
  origin: { lat: number; lon: number };
  buildings: Building[];
  paths: { id: string; points: [number, number][]; kind: string }[];
  source: string;
  fetchedAt: string;
};
export const DEFAULT_AVATAR: AvatarConfig = {
  preset: 0,
  skin: "#d7a77f",
  hair: "#352823",
  shirt: "#d6f26b",
  trousers: "#233e3b",
  glasses: false,
  beard: false,
  face: 0,
};
export const INTERESTS = [
  "Hudba",
  "Hry",
  "Sport",
  "Technika",
  "Čaj",
  "Seznamování",
];
export const DEFAULT_PROFILE: Profile = {
  nickname: "Návštěvník",
  avatar: DEFAULT_AVATAR,
  interests: [],
  social: false,
  firstTime: false,
};
