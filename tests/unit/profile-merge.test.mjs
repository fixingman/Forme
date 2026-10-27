import test from "node:test";
import assert from "node:assert/strict";
import {
  hidesToCarry,
  mergeHides,
  mergedMessage,
  MAX_DISMISSED,
  MAX_FEEDBACK_ROWS,
} from "../../lib/domain/profile-merge.mjs";

// Real incident: 57 "Not for me" hides made on this browser in a 31-minute window were lost when the account copy, updated
// elsewhere, replaced the local one. The account copy still wins; a hide made since the last sync is carried across.
const row = (key, hiddenAt, extra = {}) => ({
  key,
  brand: "Brand",
  traits: [],
  style: "",
  ...(hiddenAt ? { hiddenAt } : {}),
  ...extra,
});
const at = (minute) => `2026-10-27T21:${String(minute).padStart(2, "0")}:00.000Z`;
const SINCE = at(10);
const local = (hides) => ({ dismissed: hides.map((h) => h.key), tasteFeedback: hides });
const remote = (keys, extra = {}) => ({
  following: ["Auralee"],
  dismissed: keys,
  tasteFeedback: keys.map((key) => row(key, at(1))),
  ...extra,
});

test("a hide made here since the last sync, and not in the account copy, is carried across", () => {
  const mine = local([row("vinted:1", at(20)), row("vinted:2", at(30))]);
  assert.deepEqual(hidesToCarry(mine, remote([]), { since: SINCE }), ["vinted:1", "vinted:2"]);
});
test("hides the account copy already has are never duplicated", () => {
  const mine = local([row("vinted:1", at(20)), row("vinted:2", at(30))]);
  const { settings, carried } = mergeHides(mine, remote(["vinted:1"]), { since: SINCE });
  assert.equal(carried, 1);
  assert.deepEqual(settings.dismissed, ["vinted:1", "vinted:2"]);
  assert.equal(settings.dismissed.filter((key) => key === "vinted:1").length, 1);
});
test("an older hide the account copy lacks is left out: it was probably restored on purpose on the other device", () => {
  const mine = local([row("vinted:old", at(5)), row("vinted:new", at(20))]);
  assert.deepEqual(hidesToCarry(mine, remote([]), { since: SINCE }), ["vinted:new"]);
});
test("a hide exactly at the last sync time is treated as already synced; one a moment later is not", () => {
  const mine = local([row("vinted:edge", SINCE), row("vinted:later", "2026-10-27T21:10:00.001Z")]);
  assert.deepEqual(hidesToCarry(mine, remote([]), { since: SINCE }), ["vinted:later"]);
});
test("an undated hide is never carried automatically, and a damaged date is not trusted", () => {
  const mine = local([
    row("vinted:undated"),
    row("vinted:bad", "yesterday"),
    row("vinted:ok", at(20)),
  ]);
  assert.deepEqual(hidesToCarry(mine, remote([]), { since: SINCE }), ["vinted:ok"]);
});
test("with no recorded last-sync time, every dated hide the account lacks is carried (an older install must not lose them)", () => {
  const mine = local([row("vinted:a", at(5)), row("vinted:undated"), row("vinted:b", at(50))]);
  assert.deepEqual(hidesToCarry(mine, remote([]), { since: null }), ["vinted:a", "vinted:b"]);
  assert.deepEqual(
    hidesToCarry(mine, remote([]), { since: "not a date" }),
    ["vinted:a", "vinted:b"],
    "a damaged last-sync time counts as unknown",
  );
});
test("asking for the older copy back takes every hide the account lacks, dated or not", () => {
  const mine = local([row("vinted:a", at(5)), row("vinted:undated"), row("vinted:has", at(20))]);
  assert.deepEqual(hidesToCarry(mine, remote(["vinted:has"]), { includeUndated: true }), [
    "vinted:a",
    "vinted:undated",
  ]);
});
test("the account's own settings, hides and remembered rows are kept exactly; only carried hides are added, newest last", () => {
  const mine = local([row("vinted:mine", at(20), { reason: "style", title: "Wool coat" })]);
  const theirs = remote(["vinted:t1", "vinted:t2"], {
    following: ["Lemaire", "Hope"],
    excluded: ["Nike"],
    saved: [7],
  });
  const { settings, carried } = mergeHides(mine, theirs, { since: SINCE });
  assert.equal(carried, 1);
  assert.deepEqual(settings.following, ["Lemaire", "Hope"]);
  assert.deepEqual(settings.excluded, ["Nike"]);
  assert.deepEqual(settings.saved, [7]);
  assert.deepEqual(settings.dismissed, ["vinted:t1", "vinted:t2", "vinted:mine"]);
  assert.deepEqual(
    settings.tasteFeedback.map((r) => r.key),
    ["vinted:t1", "vinted:t2", "vinted:mine"],
  );
  assert.equal(
    settings.tasteFeedback.at(-1).reason,
    "style",
    "the reason given here travels with the hide",
  );
  assert.equal(settings.tasteFeedback.at(-1).title, "Wool coat");
});
test("inputs are never changed", () => {
  const mine = local([row("vinted:1", at(20))]),
    theirs = remote(["vinted:2"]);
  const before = JSON.stringify([mine, theirs]);
  mergeHides(mine, theirs, { since: SINCE });
  assert.equal(JSON.stringify([mine, theirs]), before);
});
test("nothing to carry returns the account copy unchanged, with a count of zero", () => {
  const theirs = remote(["vinted:1", "vinted:2"]);
  const { settings, carried } = mergeHides(local([row("vinted:1", at(20))]), theirs, {
    since: SINCE,
  });
  assert.equal(carried, 0);
  assert.deepEqual(settings.dismissed, theirs.dismissed);
  assert.deepEqual(settings.tasteFeedback, theirs.tasteFeedback);
  assert.deepEqual(mergeHides(local([]), theirs).settings, theirs);
});
test("a hide without a remembered row is still carried (the list shows it as an older piece)", () => {
  const { settings, carried } = mergeHides(
    { dismissed: ["vinted:9"], tasteFeedback: [row("vinted:9", at(20))].slice(1) },
    remote([]),
    { includeUndated: true },
  );
  assert.equal(carried, 1);
  assert.deepEqual(settings.dismissed, ["vinted:9"]);
  assert.deepEqual(settings.tasteFeedback, []);
});
test("the app's caps hold: the newest 1000 hides and 200 remembered rows", () => {
  const many = Array.from({ length: 1005 }, (_, i) => `vinted:${i + 1000}`);
  const theirs = { dismissed: many.slice(0, 1000), tasteFeedback: [] };
  const mine = local(Array.from({ length: 250 }, (_, i) => row(`vinted:new${i}`, at(20))));
  const { settings, carried } = mergeHides(mine, theirs, { since: SINCE });
  assert.equal(carried, 250);
  assert.equal(settings.dismissed.length, MAX_DISMISSED);
  assert.equal(settings.dismissed.at(-1), "vinted:new249", "the newest survive");
  assert.equal(settings.tasteFeedback.length, MAX_FEEDBACK_ROWS);
  assert.equal(settings.tasteFeedback.at(-1).key, "vinted:new249");
});
test("missing, null or malformed settings are harmless", () => {
  for (const bad of [
    undefined,
    null,
    {},
    { dismissed: "x", tasteFeedback: 5 },
    { dismissed: [1, null, {}] },
  ]) {
    assert.deepEqual(hidesToCarry(bad, remote([]), { since: SINCE }), []);
    assert.doesNotThrow(() => mergeHides(bad, bad, { since: SINCE }));
    assert.doesNotThrow(() => mergeHides(local([row("vinted:1", at(20))]), bad, { since: SINCE }));
  }
  assert.equal(
    mergeHides(local([row("vinted:1", at(20))]), undefined, { since: SINCE }).carried,
    1,
  );
});
test("the notice says how many were kept, in plain words", () => {
  assert.match(mergedMessage(1), /the piece you hid here since were kept/);
  assert.match(mergedMessage(57), /the 57 pieces you hid here since were kept/);
  assert.match(
    mergedMessage(2),
    /Your account was updated on another device\. Those changes were applied/,
  );
});
