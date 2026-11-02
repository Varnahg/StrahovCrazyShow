/** Pinned SDK 0.18.5: public fetchFn aborts matchmaking; protected createRoom
 * is the subclass hook before consumeSeatReservation calls public Room.connect.
 * Keep the SDK's joinById/handshake untouched, with ownership before connection. */
export function closePendingRoom(room) {
  room.reconnection.enabled = false;
  // leave(true) can send before WebSocket open; close handles CONNECTING too.
  room.connection?.close(1000, "Profiling join cancelled");
}

export async function joinWithDeadline(Client, endpoint, roomId, options, stopSignal, ownedRooms,
  { timeoutMs = 10000, fetchFn = fetch } = {}) {
  const timeout = new AbortController(), signal = AbortSignal.any([stopSignal, timeout.signal]);
  signal.throwIfAborted();
  const rooms = new Set();
  const timer = setTimeout(() => timeout.abort(new Error("SDK matchmaking/handshake deadline")), timeoutMs);
  class TrackedClient extends Client {
    createRoom(...args) {
      signal.throwIfAborted();
      const room = super.createRoom(...args);
      rooms.add(room); ownedRooms.add(room); // Happens before SDK Room.connect.
      signal.throwIfAborted();
      return room;
    }
  }
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  const onAbort = () => {
    for (const room of rooms) try { closePendingRoom(room); } catch { /* retry in outer owned cleanup */ }
    rejectAbort(signal.reason ?? new Error("SDK join aborted"));
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    signal.throwIfAborted();
    const client = new TrackedClient(endpoint, { fetchFn: (url, init = {}) => fetchFn(url, {
      ...init, signal: AbortSignal.any([signal, init.signal].filter(Boolean)),
    }) });
    const joining = client.joinById(roomId, options);
    // Promise.race alone is insufficient: a late success still owns a socket.
    joining.then(room => { if (signal.aborted) closePendingRoom(room); }).catch(() => {});
    const room = await Promise.race([joining, aborted]);
    if (signal.aborted) { closePendingRoom(room); signal.throwIfAborted(); }
    return room;
  } catch (error) {
    for (const room of rooms) try { closePendingRoom(room); } catch { /* outer cleanup records failures */ }
    throw error;
  } finally {
    clearTimeout(timer); signal.removeEventListener("abort", onAbort);
  }
}
