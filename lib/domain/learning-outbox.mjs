// One storage entry per operation prevents another tab's append/ack from overwriting feedback.
export function pendingOperations(storage, scope) {
  const prefix = scope + ':op:';
  const legacy = JSON.parse(storage.getItem(scope) ?? '[]');
  if (!Array.isArray(legacy)) throw Error('Pending feedback could not be read.');
  legacy.forEach((op, index) => {
    const key = prefix + op.id;
    if (!storage.getItem(key)) storage.setItem(key, JSON.stringify({order: index, op}));
  });
  if (legacy.length) storage.removeItem(scope);
  const rows = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) rows.push(JSON.parse(storage.getItem(key)));
  }
  return rows.sort((a, b) => a.order - b.order || a.op.id.localeCompare(b.op.id)).map(row => row.op);
}
export function queueOperation(storage, scope, op, now = Date.now()) {
  const previous = pendingOperations(storage, scope);
  const orders = previous.map(row => JSON.parse(storage.getItem(scope + ':op:' + row.id)).order);
  storage.setItem(scope + ':op:' + op.id, JSON.stringify({order: Math.max(now, ...orders.map(n => n + 1)), op}));
}
export function acknowledgeOperation(storage, scope, id) {
  storage.removeItem(scope + ':op:' + id);
}
