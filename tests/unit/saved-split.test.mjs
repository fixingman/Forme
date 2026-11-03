import test from "node:test";
import assert from "node:assert/strict";
import { splitSaved } from "../../lib/domain/saved-split.mjs";

// Saved pieces a provider check has confirmed are gone are kept apart; nothing else is ever treated as gone.
const at = "2026-11-03T10:00:00.000Z";
const piece = (id, extra = {}) => ({
  id,
  source: "vinted",
  sourceKey: `vinted:${id}`,
  brand: "B",
  title: `Piece ${id}`,
  ...extra,
});
const checked = (id, availability, extra = {}) =>
  piece(id, { availability, availabilitySource: "provider", availabilityObservedAt: at, ...extra });
const ids = (rows) => rows.map((row) => row.id);

test("sold and removed-or-hidden pieces are gone; everything else stays", () => {
  const items = [
    piece(1),
    checked(2, "sold"),
    checked(3, "available"),
    checked(4, "unavailable"),
    checked(5, "reserved"),
    piece(6),
  ];
  const { available, gone } = splitSaved(items);
  assert.deepEqual(ids(gone), [2, 4]);
  assert.deepEqual(ids(available), [1, 3, 5, 6]);
});
test("a reserved piece may come back, so it stays with the rest", () => {
  assert.deepEqual(ids(splitSaved([checked(1, "reserved")]).available), [1]);
});
test("a piece that merely went missing from searches is never treated as gone: only a provider check counts", () => {
  const stale = piece(1, {
    fetchedAt: "2026-01-01T00:00:00.000Z",
    observedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.deepEqual(ids(splitSaved([stale]).available), [1]);
  assert.deepEqual(ids(splitSaved([stale]).gone), []);
});
test("a 'sold' that did not come from the provider, or has no valid check time, is not believed", () => {
  const notProvider = piece(1, {
    availability: "sold",
    availabilitySource: "search",
    availabilityObservedAt: at,
  });
  const noTime = piece(2, { availability: "sold", availabilitySource: "provider" });
  const badTime = piece(3, {
    availability: "sold",
    availabilitySource: "provider",
    availabilityObservedAt: "yesterday",
  });
  const unknownWord = piece(4, {
    availability: "gone",
    availabilitySource: "provider",
    availabilityObservedAt: at,
  });
  const { available, gone } = splitSaved([notProvider, noTime, badTime, unknownWord]);
  assert.deepEqual(ids(gone), []);
  assert.deepEqual(ids(available), [1, 2, 3, 4]);
});
test("sample (demo) listings have no marketplace state and are never gone", () => {
  const demo = {
    id: 7,
    brand: "B",
    title: "Sample",
    availability: "sold",
    availabilitySource: "provider",
    availabilityObservedAt: at,
  };
  assert.deepEqual(ids(splitSaved([demo]).available), [7]);
});
test("order is preserved on both sides", () => {
  const items = [
    checked(9, "sold"),
    piece(8),
    checked(7, "sold"),
    piece(6),
    checked(5, "unavailable"),
    piece(4),
  ];
  const { available, gone } = splitSaved(items);
  assert.deepEqual(ids(gone), [9, 7, 5]);
  assert.deepEqual(ids(available), [8, 6, 4]);
});
test("every piece lands on exactly one side, and the input is not changed", () => {
  const items = [piece(1), checked(2, "sold"), checked(3, "unavailable"), checked(4, "available")];
  const before = JSON.stringify(items);
  const { available, gone } = splitSaved(items);
  assert.equal(available.length + gone.length, items.length);
  assert.deepEqual([...ids(available), ...ids(gone)].sort(), ids(items).sort());
  assert.equal(JSON.stringify(items), before);
});
test("empty, missing and odd input is harmless", () => {
  assert.deepEqual(splitSaved([]), { available: [], gone: [] });
  assert.deepEqual(splitSaved(undefined), { available: [], gone: [] });
  assert.deepEqual(splitSaved(null), { available: [], gone: [] });
  const { available, gone } = splitSaved([null, undefined, {}, piece(1)]);
  assert.equal(gone.length, 0);
  assert.equal(available.length, 4, "odd rows are passed through, not dropped");
});
