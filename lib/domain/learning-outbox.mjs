// One storage entry per operation prevents another tab's append/ack from overwriting feedback.
export function pendingOperations(storage, scope) {
  const prefix = scope + ":op:";
  const legacy = JSON.parse(storage.getItem(scope) ?? "[]");
  if (!Array.isArray(legacy)) throw Error("Pending feedback could not be read.");
  legacy.forEach((op, index) => {
    const key = prefix + op.id;
    if (!storage.getItem(key)) storage.setItem(key, JSON.stringify({ order: index, op }));
  });
  if (legacy.length) storage.removeItem(scope);
  const rows = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) rows.push(JSON.parse(storage.getItem(key)));
  }
  return rows
    .sort((a, b) => a.order - b.order || a.op.id.localeCompare(b.op.id))
    .map((row) => row.op);
}
export function queueOperation(storage, scope, op, now = Date.now()) {
  const previous = pendingOperations(storage, scope);
  const orders = previous.map((row) => JSON.parse(storage.getItem(scope + ":op:" + row.id)).order);
  storage.setItem(
    scope + ":op:" + op.id,
    JSON.stringify({ order: Math.max(now, ...orders.map((n) => n + 1)), op }),
  );
}
export function acknowledgeOperation(storage, scope, id) {
  storage.removeItem(scope + ":op:" + id);
}
/**
 * HTTP statuses that mean "this exact request is wrong and will never be accepted" (bad shape, a pool or parent that is not there,
 * too large). Everything else (offline, signed out, busy, history unavailable, 5xx) is temporary and is retried as before.
 */
export const isPermanentRejection = (status) => status === 400 || status === 413;
const REJECTED_LIMIT = 100;
/**
 * A refusal of a real feedback event is retried this many times (across flushes) before the event is set aside. A refusal can be a
 * race on the server, not a verdict: in practice a "reason" was refused once for a hide the server did hold, and accepted on the next
 * try. Exposures are not retried: they never affect ordering, and their pool cannot change.
 */
export const MAX_EVENT_TRIES = 3;
/** Counts one more refusal for a queued operation and returns the new total. */
export function noteRefusal(storage, scope, id) {
  const key = scope + ":op:" + id;
  try {
    const row = JSON.parse(storage.getItem(key));
    row.tries = (row.tries ?? 0) + 1;
    storage.setItem(key, JSON.stringify(row));
    return row.tries;
  } catch {
    return MAX_EVENT_TRIES;
  }
}
/**
 * Sets aside an operation the server permanently refused, so it no longer holds up everything queued behind it. It is not
 * silently lost: events (real feedback) are kept whole for review, exposures keep only the facts. Oldest set-aside entries beyond
 * REJECTED_LIMIT are removed so this cannot grow without bound.
 */
export function rejectOperation(storage, scope, op, message, now = Date.now()) {
  const kept =
    op.action === "events"
      ? op
      : { id: op.id, action: op.action, exposure: { keys: op.exposure?.keys?.length ?? 0 } };
  storage.setItem(
    scope + ":rejected:" + op.id,
    JSON.stringify({ at: now, message: String(message ?? "").slice(0, 200), op: kept }),
  );
  acknowledgeOperation(storage, scope, op.id);
  const rows = rejectedOperations(storage, scope);
  for (const row of rows.slice(0, Math.max(0, rows.length - REJECTED_LIMIT)))
    storage.removeItem(scope + ":rejected:" + row.op.id);
}
export function rejectedOperations(storage, scope) {
  const prefix = scope + ":rejected:",
    rows = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    try {
      const row = JSON.parse(storage.getItem(key));
      if (row?.op?.id) rows.push(row);
    } catch {
      /* A damaged entry is ignored rather than breaking the queue. */
    }
  }
  return rows.sort((a, b) => a.at - b.at || a.op.id.localeCompare(b.op.id));
}
export function clearRejected(storage, scope) {
  for (const row of rejectedOperations(storage, scope))
    storage.removeItem(scope + ":rejected:" + row.op.id);
}
/**
 * Sends queued operations oldest first. A delivered one is acknowledged. A refused exposure is set aside at once and the next is
 * tried, so one bad entry can never freeze everything behind it. A refused feedback event is held (nothing may overtake it) and
 * retried on the next flush, and only set aside after MAX_EVENT_TRIES refusals. Any other failure (offline, signed out,
 * unavailable) stops here and leaves the rest queued, to be retried later in the same order. Every pass either removes the head
 * or throws, so this always ends.
 * `stillCurrent` lets the caller abandon the loop when the signed-in person changed mid-flight.
 * @param {Storage} storage @param {string} scope @param {(op: any) => Promise<unknown>} send
 * @param {{stillCurrent?: () => boolean, onChange?: (queued: number) => void}} [options]
 */
export async function drainQueue(
  storage,
  scope,
  send,
  { stillCurrent = () => true, onChange = () => {} } = {},
) {
  let queue = pendingOperations(storage, scope);
  while (queue.length) {
    const op = queue[0];
    try {
      await send(op);
    } catch (error) {
      if (!isPermanentRejection(error?.status)) throw error;
      if (!stillCurrent()) return;
      if (op.action === "events" && noteRefusal(storage, scope, op.id) < MAX_EVENT_TRIES)
        throw error;
      rejectOperation(storage, scope, op, error.message);
      queue = pendingOperations(storage, scope);
      onChange(queue.length);
      continue;
    }
    if (!stillCurrent()) return;
    acknowledgeOperation(storage, scope, op.id);
    queue = pendingOperations(storage, scope);
    onChange(queue.length);
  }
}
