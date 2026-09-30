import { strict as assert } from "node:assert";
import { test } from "node:test";
import { deriveGameResultPlacements } from "../src/domain";

const derive = (scores: readonly number[]) => deriveGameResultPlacements(
  scores.map((scorePoint, index) => ({ playerId: `p${index + 1}`, scorePoint })),
);

test("derives normal three-player placement and last place", () => {
  const result = derive([50, 10, -60]);
  assert.ok(result);
  assert.deepEqual(result.map(({ placement, isLast }) => ({ placement, isLast })), [
    { placement: 1, isLast: false },
    { placement: 2, isLast: false },
    { placement: 3, isLast: true },
  ]);
});

test("keeps a shared three-player last place as 2nd-place tie plus isLast", () => {
  const result = derive([50, -25, -25]);
  assert.ok(result);
  assert.deepEqual(result.map(({ placement, isLast }) => ({ placement, isLast })), [
    { placement: 1, isLast: false },
    { placement: 2, isLast: true },
    { placement: 2, isLast: true },
  ]);
});

test("derives a four-player middle tie without losing unique last place", () => {
  const result = derive([50, 10, 10, -70]);
  assert.ok(result);
  assert.deepEqual(result.map(({ placement, isLast }) => ({ placement, isLast })), [
    { placement: 1, isLast: false },
    { placement: 2, isLast: false },
    { placement: 2, isLast: false },
    { placement: 4, isLast: true },
  ]);
});

test("derives a shared four-player last place independently from placement number", () => {
  const result = derive([50, 10, -30, -30]);
  assert.ok(result);
  assert.deepEqual(result.map(({ placement, isLast }) => ({ placement, isLast })), [
    { placement: 1, isLast: false },
    { placement: 2, isLast: false },
    { placement: 3, isLast: true },
    { placement: 3, isLast: true },
  ]);
});

test("supports a three-way shared last place", () => {
  const result = derive([60, -20, -20, -20]);
  assert.ok(result);
  assert.deepEqual(result.map(({ placement, isLast }) => ({ placement, isLast })), [
    { placement: 1, isLast: false },
    { placement: 2, isLast: true },
    { placement: 2, isLast: true },
    { placement: 2, isLast: true },
  ]);
});

test("rejects a highest-score tie because first place must be unique", () => {
  assert.equal(derive([10, 10, -20]), null);
  assert.equal(derive([20, 20, -10, -30]), null);
});
