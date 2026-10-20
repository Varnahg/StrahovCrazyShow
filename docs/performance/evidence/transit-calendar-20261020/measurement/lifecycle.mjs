export async function deadline(promise, milliseconds, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label + ' timeout')), milliseconds);
  })]); } finally { clearTimeout(timer); }
}
const exited = child => child.exitCode !== null || child.signalCode !== null;
async function stopChild(child, milliseconds) {
  if (exited(child)) return;
  let listener;
  const exit = new Promise(resolve => { listener = resolve; child.once('exit', listener); });
  try {
    child.kill();
    try { await deadline(exit, milliseconds, 'Owned API exit'); }
    catch { child.kill('SIGKILL'); await deadline(exit, milliseconds, 'Owned API forced exit'); }
    if (!exited(child)) throw new Error('Owned API exit not confirmed');
  } finally { child.removeListener('exit', listener); }
}
/** Operates only on process/connection objects created by this harness. */
export async function stopOwned({peers, api, preview, sockets, milliseconds = 1500}) {
  const report = {peers: [], apiExited: false, previewClosed: !preview, errors: []};
  try {
    for (const peer of peers) {
      if (peer.room.reconnection) peer.room.reconnection.enabled = false;
      if (!peer.evidence.connected || !peer.room.connection?.isOpen) {
        report.peers.push('already-terminal'); continue;
      }
      try { await deadline(peer.room.leave(), milliseconds, 'SDK leave'); report.peers.push('left'); }
      catch (error) {
        // SDK leave() waits for a future onLeave even if one already happened.
        // Closing our own connection is bounded; server cleanup follows regardless.
        try { peer.room.connection?.close(); } catch {}
        report.peers.push(String(error));
      }
    }
  } finally {
    try { await stopChild(api, milliseconds); report.apiExited = true; }
    catch (error) { report.errors.push(String(error)); }
    finally {
      if (preview) {
        try {
          const closed = new Promise((resolve, reject) => preview.httpServer.close(error => error ? reject(error) : resolve()));
          for (const socket of sockets) socket.destroy();
          preview.httpServer.closeAllConnections?.();
          await deadline(closed, milliseconds, 'Owned preview close');
          report.previewClosed = true;
        } catch (error) { report.errors.push(String(error)); }
      }
    }
  }
  if (!report.apiExited || !report.previewClosed) {
    const error = new Error('Cleanup incomplete: ' + report.errors.join('; '));
    error.report = report;
    throw error;
  }
  return report;
}
