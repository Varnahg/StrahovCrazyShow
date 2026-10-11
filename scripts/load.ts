import { Client, type Room } from "@colyseus/sdk";
import { DEFAULT_PROFILE } from "../shared/types";
import { PROTOCOL_VERSION } from "../shared/netcode";
const count = Number(process.argv[2] || 29),
  duration = Number(process.argv[3] || 90) * 1000;
const sdk = new Client("http://127.0.0.1:2567"),
  rooms: Room[] = [];
try {
  for (let i = 0; i < count; i++) {
    const r = await fetch("http://127.0.0.1:2567/api/session", {
      method: "POST",
      body: JSON.stringify({
        mode: "multiplayer",
        profile: {
          ...DEFAULT_PROFILE,
          nickname: "Test " + String(i + 1).padStart(2, "0"),
          avatar: {
            ...DEFAULT_PROFILE.avatar,
            shirt: ["#d6f26b", "#bfa4d4", "#e6bc84", "#72a7a0"][i % 4],
          },
        },
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    const room = await sdk.joinById(data.worldId, {
      token: data.token,
      protocol: PROTOCOL_VERSION,
    });
    room.onMessage("*", () => {});
    rooms.push(room);
  }
  console.log(
    `${rooms.length} real network clients connected for ${duration / 1000} seconds. Open the multiplayer demo to measure rendering with 30 avatars.`,
  );
  await new Promise((r) => setTimeout(r, duration));
} finally {
  for (const room of rooms) await room.leave();
  console.log("Load clients disconnected.");
}
