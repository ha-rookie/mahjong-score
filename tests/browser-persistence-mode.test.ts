import { strict as assert } from "node:assert";
import { test } from "node:test";
import { resolvePersistenceMode } from "../src/infrastructure/composition/browser-services";

test("explicit local marker keeps the legacy local persistence mode", () => {
  assert.equal(resolvePersistenceMode("local"), "local");
});

test("explicit d1 marker selects D1", () => {
  assert.equal(resolvePersistenceMode("d1"), "d1");
});

test("missing persistence marker defaults to D1", () => {
  assert.equal(resolvePersistenceMode(null), "d1");
});

test("unknown persistence marker fails safe to D1", () => {
  assert.equal(resolvePersistenceMode("unexpected"), "d1");
});
