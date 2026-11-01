import test from "node:test";
import assert from "node:assert/strict";
import { describeHostedError, hostedErrorFields } from "../../lib/domain/hosted-error.mjs";
import { hostedLearningStore } from "../../lib/server/learning-store.mjs";
import { LearningError } from "../../lib/domain/learning.mjs";

// A failed read or write of the hosted learning history used to say "Apply the learning migration" every time, even though the tables
// exist and most calls succeed. A slow database and a missing table need different words, and the real cause was thrown away.
const err = (code, message, extra = {}) => ({ code, message, ...extra });
const kind = (error) => describeHostedError(error).kind;

test("a statement timeout is a timeout, whatever shape it arrives in, and says the feedback is kept", () => {
  for (const error of [
    err("57014", "canceling statement due to statement timeout"),
    err("57014", ""),
    err("", "canceling statement due to statement timeout"),
    err("PGRST003", "Timed out acquiring connection from connection pool."),
    err("", "The operation timed out"),
    err("", "", { details: "request timeout" }),
  ])
    assert.equal(kind(error), "timeout", JSON.stringify(error));
  const described = describeHostedError(err("57014", "x"));
  assert.match(described.message, /slow to respond/);
  assert.match(described.message, /kept on this device and sent again automatically/);
  assert.doesNotMatch(described.message, /migration/i, "a timeout must never blame the migration");
});
test("only a genuinely missing table asks for the migration", () => {
  for (const error of [
    err("PGRST205", "Could not find the table 'public.learning_records' in the schema cache"),
    err("42P01", 'relation "public.learning_records" does not exist'),
    err("", "Could not find the table 'public.learning_selection'"),
  ])
    assert.equal(kind(error), "missing", JSON.stringify(error));
  assert.match(describeHostedError(err("42P01", "x")).message, /Apply the learning migration/);
});
test("the error code alone is enough, when the message is empty or unhelpful", () => {
  for (const code of ["PGRST205", "42P01"]) assert.equal(kind(err(code, "")), "missing", code);
  for (const code of ["PGRST301", "42501"]) assert.equal(kind(err(code, "")), "auth", code);
  for (const code of ["57014", "PGRST003"]) assert.equal(kind(err(code, "")), "timeout", code);
  assert.equal(kind(err("22P02", "")), "other", "an unknown code is not guessed at");
});
test("sign-in and permission problems are named as such, not as a missing migration", () => {
  for (const error of [
    err("PGRST301", "JWT expired"),
    err("42501", "owner required"),
    err("", "permission denied for table learning_records"),
    err("", "new row violates row-level security policy"),
  ])
    assert.equal(kind(error), "auth", JSON.stringify(error));
  assert.doesNotMatch(describeHostedError(err("PGRST301", "JWT expired")).message, /migration/i);
});
test("connection failures are named as such", () => {
  for (const error of [
    err("", "TypeError: fetch failed"),
    err("", "getaddrinfo ENOTFOUND abc.supabase.co"),
    err("", "read ECONNRESET"),
    err("", "Failed to fetch"),
  ])
    assert.equal(kind(error), "network", JSON.stringify(error));
  assert.match(
    describeHostedError(err("", "TypeError: fetch failed")).message,
    /could not be reached/,
  );
});
test("anything unrecognised gets a calm generic message that never blames the migration", () => {
  for (const error of [
    err("XX000", "internal error"),
    err("", ""),
    {},
    null,
    undefined,
    "boom",
    42,
  ]) {
    const described = describeHostedError(error);
    assert.equal(described.kind, "other", String(JSON.stringify(error)));
    assert.match(described.message, /unavailable right now/);
    assert.doesNotMatch(described.message, /migration/i);
  }
});
test("a timeout wins over a missing-table word, and a missing table is never mistaken for a timeout", () => {
  assert.equal(
    kind(err("57014", "relation x does not exist")),
    "missing",
    "a missing relation is reported first",
  );
  assert.equal(
    kind(
      err("57014", "canceling statement due to statement timeout while reading learning_records"),
    ),
    "timeout",
  );
});
test("log fields carry codes and a short message only, trimmed, and nothing else", () => {
  const long = "x".repeat(2000);
  const fields = hostedErrorFields(
    err("57014", long, { details: long, hint: long, extra: "SECRET", row: { data: "private" } }),
    "list event",
  );
  assert.deepEqual(Object.keys(fields).sort(), ["code", "details", "hint", "message", "operation"]);
  assert.equal(fields.operation, "list event");
  assert.ok(
    fields.message.length <= 240 && fields.details.length <= 240 && fields.hint.length <= 240,
  );
  assert.deepEqual(hostedErrorFields(null, "append"), {
    operation: "append",
    code: undefined,
    message: "",
    details: undefined,
    hint: undefined,
  });
});
// ---------------------------------------------------------------------------------------------------- the store itself
const failing = (error) => {
  const result = { data: null, error };
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    range: () => chain,
    limit: () => chain,
    then: (resolve) => resolve(result),
  };
  return { from: () => chain, rpc: async () => result };
};
const captured = async (fn) => {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines.map((line) => JSON.parse(line));
};
test("every hosted operation fails as a temporary 503 with the described message, and logs the real cause", async () => {
  const store = hostedLearningStore(
    failing(err("57014", "canceling statement due to statement timeout")),
  );
  const operations = {
    "list event": () => store.list("event"),
    append: () => store.append([{ kind: "event", id: "x", data: {} }]),
    selection: () => store.selection(),
    "select model": () => store.select(0, {}),
    clear: () => store.clear(),
  };
  for (const [operation, run] of Object.entries(operations)) {
    let thrown;
    const lines = await captured(async () => {
      await run().catch((error) => (thrown = error));
    });
    assert.ok(thrown instanceof LearningError, operation);
    assert.equal(thrown.status, 503, operation);
    assert.match(thrown.message, /slow to respond/, operation);
    const line = lines.find((row) => row.event === "learning.hosted.error");
    assert.ok(line, `${operation} logged the cause`);
    assert.equal(line.operation, operation);
    assert.equal(line.code, "57014");
    assert.equal(line.kind, "timeout");
    assert.equal(line.level, "warn");
  }
});
test("a missing table still produces the migration message from the store", async () => {
  const store = hostedLearningStore(
    failing(
      err("PGRST205", "Could not find the table 'public.learning_records' in the schema cache"),
    ),
  );
  await captured(async () => {
    await assert.rejects(
      store.list("run"),
      (error) => error.status === 503 && /Apply the learning migration/.test(error.message),
    );
  });
});
test("a successful read still returns its rows and logs nothing", async () => {
  const rows = [{ id: "a", ordinal: 1, data: {}, recorded_at: "2026-11-01T00:00:00Z" }];
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    range: () => chain,
    then: (resolve) => resolve({ data: rows, error: null }),
  };
  const store = hostedLearningStore({
    from: () => chain,
    rpc: async () => ({ data: ["a"], error: null }),
  });
  const lines = await captured(async () => {
    assert.deepEqual(await store.list("event"), rows);
    assert.deepEqual(await store.append([]), ["a"]);
  });
  assert.deepEqual(lines, []);
});
