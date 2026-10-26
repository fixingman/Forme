import test from "node:test";
import assert from "node:assert/strict";
import {
  pendingOperations,
  queueOperation,
  acknowledgeOperation,
  drainQueue,
  rejectOperation,
  rejectedOperations,
  clearRejected,
  isPermanentRejection,
  noteRefusal,
  MAX_EVENT_TRIES,
} from "../../lib/domain/learning-outbox.mjs";
const storage = () => {
  const data = new Map();
  return {
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index],
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
};
test("independent tab appends and acknowledgements preserve other operations in causal order", () => {
  const device = storage(),
    scope = "forme:owner";
  queueOperation(device, scope, { id: "exposure" }, 100);
  queueOperation(device, scope, { id: "vote" }, 100);
  const tabA = pendingOperations(device, scope);
  queueOperation(device, scope, { id: "reason" }, 99);
  acknowledgeOperation(device, scope, tabA[0].id);
  assert.deepEqual(
    pendingOperations(device, scope).map((row) => row.id),
    ["vote", "reason"],
  );
  acknowledgeOperation(device, scope, "exposure");
  assert.equal(pendingOperations(device, "forme:other-owner").length, 0);
});
test("legacy queues migrate without losing pending operations and quota failures leave earlier records", () => {
  const device = storage(),
    scope = "forme:owner";
  device.setItem(scope, JSON.stringify([{ id: "one" }, { id: "two" }]));
  assert.deepEqual(
    pendingOperations(device, scope).map((row) => row.id),
    ["one", "two"],
  );
  assert.equal(device.getItem(scope), null);
  const failing = {
    ...device,
    setItem() {
      throw Error("Quota");
    },
  };
  assert.throws(() => queueOperation(failing, scope, { id: "three" }), /Quota/);
  assert.deepEqual(
    pendingOperations(device, scope).map((row) => row.id),
    ["one", "two"],
  );
});

// ---------------------------------------------------------------------------------------------------- permanent refusals
// A real incident: the oldest queued exposure was refused for good ("Exposure is outside its frozen pool"), the queue stopped at it,
// and 54 operations behind it (including real hides and reasons) never reached the server while a "pending" notice stayed up.
const refused = (message = "Exposure is outside its frozen pool.", status = 400) =>
  Object.assign(new Error(message), { status });
const exposure = (id, keys = 1) => ({
  id,
  action: "exposure",
  exposure: { keys: Array(keys).fill("vinted:1") },
});
const events = (id, action) => ({
  id,
  action: "events",
  events: [{ id: id + "-e", action, key: "vinted:2" }],
});
const fill = (device, scope, ops) =>
  ops.forEach((op, index) => queueOperation(device, scope, op, 1000 + index));

test("only 400 and 413 are permanent; offline, signed out, busy, unavailable and server errors are retried", () => {
  for (const status of [400, 413]) assert.equal(isPermanentRejection(status), true, String(status));
  for (const status of [401, 403, 404, 408, 409, 429, 500, 502, 503, 504, undefined, null, 0])
    assert.equal(isPermanentRejection(status), false, String(status));
});
test("a refused operation at the head no longer blocks the ones behind it, and real feedback is delivered in order", async () => {
  const device = storage(),
    scope = "forme:owner",
    sent = [];
  fill(device, scope, [
    exposure("x1"),
    exposure("x2"),
    events("hide", "dismiss"),
    exposure("x3"),
    events("restore", "restore"),
  ]);
  await drainQueue(device, scope, async (op) => {
    if (op.action === "exposure" && op.id !== "x3") throw refused();
    sent.push(op.id);
  });
  assert.deepEqual(
    sent,
    ["hide", "x3", "restore"],
    "everything valid went out, in the original order",
  );
  assert.deepEqual(pendingOperations(device, scope), [], "nothing is left pending, so no notice");
  assert.deepEqual(
    rejectedOperations(device, scope)
      .map((row) => row.op.id)
      .sort(),
    ["x1", "x2"],
  );
});
// Flushes happen again every 15 seconds and on reconnect; this stands in for that.
const flushes = async (device, scope, send, times) => {
  const errors = [];
  for (let i = 0; i < times; i++)
    await drainQueue(device, scope, send).catch((error) => errors.push(error.message));
  return errors;
};
test("a refused real event is kept whole for review once its retries are used up, and a refused exposure keeps only the facts", async () => {
  const device = storage(),
    scope = "forme:owner";
  fill(device, scope, [events("reason", "reason"), exposure("x", 24)]);
  const send = async (op) => {
    throw refused(
      op.action === "events"
        ? "Original feedback is unavailable. Send the hide first."
        : "Exposure is outside its frozen pool.",
    );
  };
  const errors = await flushes(device, scope, send, MAX_EVENT_TRIES);
  assert.equal(errors.length, MAX_EVENT_TRIES - 1, "held, with an error shown, until the last try");
  const rows = rejectedOperations(device, scope),
    byId = Object.fromEntries(rows.map((row) => [row.op.id, row]));
  assert.deepEqual(
    byId.reason.op.events[0],
    { id: "reason-e", action: "reason", key: "vinted:2" },
    "the feedback itself is preserved",
  );
  assert.match(byId.reason.message, /Original feedback is unavailable/);
  assert.deepEqual(
    byId.x.op,
    { id: "x", action: "exposure", exposure: { keys: 24 } },
    "no listing payload is kept",
  );
  assert.ok(rows.every((row) => Number.isFinite(row.at)));
  assert.deepEqual(pendingOperations(device, scope), []);
});
test("a feedback event refused once, as in a server race, is retried and delivered, in order, with nothing overtaking it", async () => {
  const device = storage(),
    scope = "forme:owner",
    sent = [];
  fill(device, scope, [
    events("hide", "dismiss"),
    events("reason", "reason"),
    events("restore", "restore"),
    exposure("x"),
  ]);
  let refusals = 0;
  const send = async (op) => {
    if (op.id === "reason" && refusals++ < 1)
      throw refused("Original feedback is unavailable. Send the hide first.");
    sent.push(op.id);
  };
  const errors = await flushes(device, scope, send, 2);
  assert.equal(errors.length, 1, "the first flush stopped at the refused reason");
  assert.deepEqual(
    sent,
    ["hide", "reason", "restore", "x"],
    "the later ones only went after it, in the original order",
  );
  assert.deepEqual(pendingOperations(device, scope), []);
  assert.deepEqual(
    rejectedOperations(device, scope),
    [],
    "nothing was set aside: it was only a race",
  );
});
test("a held event keeps everything behind it queued, untouched, until it is delivered or set aside", async () => {
  const device = storage(),
    scope = "forme:owner",
    sent = [];
  fill(device, scope, [
    events("a", "dismiss"),
    events("b", "dismiss"),
    exposure("x"),
    events("c", "dismiss"),
  ]);
  const send = async (op) => {
    if (op.id === "b") throw refused("Invalid feedback event.");
    sent.push(op.id);
  };
  await flushes(device, scope, send, 1);
  assert.deepEqual(sent, ["a"]);
  assert.deepEqual(
    pendingOperations(device, scope).map((row) => row.id),
    ["b", "x", "c"],
    "b is still first; x and c did not overtake it",
  );
  await flushes(device, scope, send, MAX_EVENT_TRIES);
  assert.deepEqual(
    sent,
    ["a", "x", "c"],
    "after b's retries are used up it is set aside and the rest follow",
  );
  assert.deepEqual(
    rejectedOperations(device, scope).map((row) => row.op.id),
    ["b"],
  );
});
test("refusal counts are kept per operation, survive a reload, and a damaged entry counts as used up", () => {
  const device = storage(),
    scope = "forme:owner";
  fill(device, scope, [events("a", "dismiss"), events("b", "dismiss")]);
  assert.equal(noteRefusal(device, scope, "a"), 1);
  assert.equal(noteRefusal(device, scope, "a"), 2);
  assert.equal(noteRefusal(device, scope, "b"), 1);
  assert.deepEqual(
    pendingOperations(device, scope).map((row) => row.id),
    ["a", "b"],
    "counting changes nothing else",
  );
  device.setItem(scope + ":op:broken", "{nope");
  assert.equal(noteRefusal(device, scope, "broken"), MAX_EVENT_TRIES);
  assert.equal(noteRefusal(device, scope, "missing"), MAX_EVENT_TRIES);
});
test("a temporary failure still stops at that operation and keeps everything queued, in order, untouched", async () => {
  for (const status of [503, 401, 409, 500, null]) {
    const device = storage(),
      scope = "forme:owner",
      sent = [];
    fill(device, scope, [events("a", "dismiss"), events("b", "dismiss"), events("c", "dismiss")]);
    await assert.rejects(
      drainQueue(device, scope, async (op) => {
        if (op.id === "b") throw refused("unavailable", status);
        sent.push(op.id);
      }),
      /unavailable/,
      String(status),
    );
    assert.deepEqual(sent, ["a"]);
    assert.deepEqual(
      pendingOperations(device, scope).map((row) => row.id),
      ["b", "c"],
      `${status}: nothing was dropped`,
    );
    assert.deepEqual(rejectedOperations(device, scope), [], `${status}: nothing was set aside`);
  }
});
test("a network failure (no response, no status) is retried, not discarded", async () => {
  const device = storage(),
    scope = "forme:owner";
  fill(device, scope, [events("a", "dismiss")]);
  await assert.rejects(
    drainQueue(device, scope, async () => {
      throw new TypeError("Failed to fetch");
    }),
    /Failed to fetch/,
  );
  assert.equal(pendingOperations(device, scope).length, 1);
  assert.equal(rejectedOperations(device, scope).length, 0);
});
test("a queue where every operation is refused still ends, and reports progress", async () => {
  const device = storage(),
    scope = "forme:owner",
    counts = [];
  fill(
    device,
    scope,
    Array.from({ length: 30 }, (_, i) => exposure("x" + i)),
  );
  await drainQueue(
    device,
    scope,
    async () => {
      throw refused();
    },
    { onChange: (n) => counts.push(n) },
  );
  assert.equal(pendingOperations(device, scope).length, 0);
  assert.equal(rejectedOperations(device, scope).length, 30);
  assert.equal(counts.length, 30);
  assert.equal(counts.at(-1), 0);
  assert.ok(
    counts.every((n, i) => i === 0 || n < counts[i - 1]),
    "strictly shrinking",
  );
});
test("the set-aside list is bounded: only the newest 100 are kept", () => {
  const device = storage(),
    scope = "forme:owner";
  for (let i = 0; i < 130; i++)
    rejectOperation(device, scope, exposure("x" + String(i).padStart(3, "0")), "no", 5000 + i);
  const rows = rejectedOperations(device, scope);
  assert.equal(rows.length, 100);
  assert.equal(rows[0].op.id, "x030");
  assert.equal(rows.at(-1).op.id, "x129");
});
test("setting aside leaves other scopes and the pending queue alone, and clearing removes only that scope's set-aside entries", () => {
  const device = storage();
  fill(device, "forme:a", [events("keep", "dismiss"), exposure("bad")]);
  fill(device, "forme:b", [exposure("other")]);
  rejectOperation(device, "forme:a", exposure("bad"), "no");
  rejectOperation(device, "forme:b", exposure("other"), "no");
  assert.deepEqual(
    pendingOperations(device, "forme:a").map((row) => row.id),
    ["keep"],
  );
  assert.equal(rejectedOperations(device, "forme:a").length, 1);
  assert.equal(rejectedOperations(device, "forme:b").length, 1);
  clearRejected(device, "forme:a");
  assert.equal(rejectedOperations(device, "forme:a").length, 0);
  assert.equal(rejectedOperations(device, "forme:b").length, 1);
  assert.deepEqual(
    pendingOperations(device, "forme:a").map((row) => row.id),
    ["keep"],
    "pending feedback is never touched by clearing",
  );
});
test("set-aside entries are not mistaken for pending ones, and a damaged one does not break the queue", () => {
  const device = storage(),
    scope = "forme:owner";
  fill(device, scope, [events("a", "dismiss")]);
  rejectOperation(device, scope, exposure("x"), "no");
  device.setItem(scope + ":rejected:broken", "{not json");
  assert.deepEqual(
    pendingOperations(device, scope).map((row) => row.id),
    ["a"],
  );
  assert.deepEqual(
    rejectedOperations(device, scope).map((row) => row.op.id),
    ["x"],
  );
});
test("the loop stops quietly when the signed-in person changes mid-flight, without acknowledging or setting anything aside", async () => {
  for (const mode of ["delivered", "refused"]) {
    const device = storage(),
      scope = "forme:owner";
    fill(device, scope, [events("a", "dismiss"), events("b", "dismiss")]);
    await drainQueue(
      device,
      scope,
      async () => {
        if (mode === "refused") throw refused();
      },
      { stillCurrent: () => false },
    );
    assert.deepEqual(
      pendingOperations(device, scope).map((row) => row.id),
      ["a", "b"],
      mode,
    );
    assert.deepEqual(rejectedOperations(device, scope), [], mode);
  }
});
test("an empty queue sends nothing", async () => {
  let calls = 0;
  await drainQueue(storage(), "forme:owner", async () => {
    calls++;
  });
  assert.equal(calls, 0);
});
