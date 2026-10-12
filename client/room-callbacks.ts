interface RoomCallbackSource {
  onMessage<T>(type: string, callback: (data: T) => void): unknown;
  onLeave(callback: (code: number, reason?: string) => void): unknown;
  onError(callback: (code: number, message?: string) => void): unknown;
}

/** Keep retained SDK listeners harmless after leaving or replacing a room. */
export function currentRoomCallbacks(
  source: RoomCallbackSource,
  isCurrent: () => boolean,
) {
  const guard =
    <Args extends unknown[]>(callback: (...args: Args) => void) =>
    (...args: Args) => {
      if (isCurrent()) callback(...args);
    };
  return {
    onMessage<T>(type: string, callback: (data: T) => void) {
      return source.onMessage(type, guard(callback));
    },
    onLeave(callback: (code: number, reason?: string) => void) {
      return source.onLeave(guard(callback));
    },
    onError(callback: (code: number, message?: string) => void) {
      return source.onError(guard(callback));
    },
  };
}
