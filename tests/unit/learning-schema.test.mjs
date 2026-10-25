import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
const migration = readFileSync(
  new URL("../../supabase/migrations/20261022000000_private_beta.sql", import.meta.url),
  "utf8",
);
const owner = { id: "11111111-1111-1111-1111-111111111111", email: "owner@example.com" };
const friend = { id: "22222222-2222-2222-2222-222222222222", email: "friend@example.com" };
const stranger = { id: "33333333-3333-3333-3333-333333333333", email: "stranger@example.com" };
let db;
async function as(user, run) {
  await db.exec("RESET ROLE");
  if (!user) {
    await db.exec("SET ROLE anon");
    await db.query("select set_config('request.jwt.claims','',false)");
  } else {
    await db.exec("SET ROLE authenticated");
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ sub: user.id, email: user.email, role: "authenticated" }),
    ]);
  }
  try {
    return await run();
  } finally {
    await db.exec("RESET ROLE");
  }
}
const sample = (n) => ({ app: "forme", version: 1, n });
before(async () => {
  db = new PGlite();
  await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt() ->> 'sub')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  grant execute on function auth.jwt(), auth.uid() to anon, authenticated;`);
  for (const user of [owner, friend, stranger])
    await db.query("insert into auth.users values ($1,$2)", [user.id, user.email]);
  await db.exec(migration);
  await db.exec(
    readFileSync(
      new URL("../../supabase/migrations/20261025000000_learning.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query(
    "insert into public.allowed_users (email, role) values ('owner@example.com','owner'),('friend@example.com','member')",
  );
  await db.query("insert into public.snapshot_meta (id, fetched_at) values (1, now())");
  await db.query(
    "insert into public.listings (source_key, data) values ('vinted:1', '{\"title\":\"Auralee shirt\"}')",
  );
});
after(async () => {
  await db.close();
});

test("learning history is immutable/idempotent and isolated by owner; members and signed-out callers cannot write", async () => {
  const id = randomUUID(),
    row = { kind: "event", id, data: { id, key: "vinted:12345", action: "save" } };
  const append = (user) =>
    as(user, () =>
      db.query("select public.append_learning_records($1::jsonb) as ack", [JSON.stringify([row])]),
    );
  await append(owner);
  await append(owner);
  assert.equal(
    (await as(owner, () => db.query("select * from public.learning_records"))).rows.length,
    1,
  );
  await assert.rejects(
    as(owner, () =>
      db.query("select public.append_learning_records($1::jsonb)", [
        JSON.stringify([{ ...row, data: { ...row.data, action: "dismiss" } }]),
      ]),
    ),
    /reused/,
  );
  await assert.rejects(append(friend), /owner required/);
  await assert.rejects(append(stranger), /owner required/);
  await assert.rejects(append(null), /permission denied/);
  assert.equal(
    (await as(friend, () => db.query("select * from public.learning_records"))).rows.length,
    0,
  );
  await assert.rejects(
    as(owner, () => db.query("update public.learning_records set data='{}'")),
    /permission denied/,
  );
  const second = { id: "44444444-4444-4444-4444-444444444444", email: "second@example.com" };
  await db.query("insert into auth.users values($1,$2)", [second.id, second.email]);
  await db.query("insert into public.allowed_users values($1,'owner',now())", [second.email]);
  assert.equal(
    (await as(second, () => db.query("select * from public.learning_records"))).rows.length,
    0,
  );
});
test("selection has optimistic concurrency and deleting learning leaves real profiles alone", async () => {
  const choose = (rev) =>
    as(owner, () =>
      db.query("select public.select_learning_model($1,$2::jsonb) as revision", [
        rev,
        JSON.stringify({ selected: null }),
      ]),
    );
  assert.equal((await choose(0)).rows[0].revision, 1);
  assert.equal((await choose(0)).rows[0].revision, null);
  await as(owner, () =>
    db.query("select public.save_profile(0,$1::jsonb)", [JSON.stringify({ keep: true })]),
  );
  await as(owner, () => db.query("select public.clear_learning_history()"));
  assert.equal(
    (await as(owner, () => db.query("select * from public.learning_records"))).rows.length,
    0,
  );
  assert.equal(
    (await as(owner, () => db.query("select backup from public.user_profiles"))).rows[0].backup
      .keep,
    true,
  );
});
