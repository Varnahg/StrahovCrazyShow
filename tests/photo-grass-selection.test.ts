import test from "node:test";
import assert from "node:assert/strict";
import { GrassSelectionHeap } from "../client/photo-grass-selection";
import {
  allocateGrassBudget,
  type RootDemand,
} from "../client/photo-grass-budget";

test("incremental score ordering matches full sorting and every quality's triangle budget", () => {
  const demands: RootDemand[] = Array.from({ length: 16000 }, (_, i) => ({
    id: 16000 - i,
    score: (i * 7891) % 2017,
    level: (["near", "medium", "far"] as const)[i % 3],
  }));
  const queue = new GrassSelectionHeap<RootDemand>(),
    popped: RootDemand[] = [];
  for (const item of demands) queue.push(item);
  while (queue.length) popped.push(queue.pop()!);
  const expected = [...demands].sort(
    (a, b) => a.score - b.score || a.id - b.id,
  );
  assert.deepEqual(popped, expected);
  for (const quality of ["low", "medium", "high"] as const)
    assert.deepEqual(
      allocateGrassBudget(popped, quality),
      allocateGrassBudget(expected, quality),
    );
  assert.equal(queue.pop(), undefined);
  queue.push(demands[0]);
  queue.clear();
  assert.equal(queue.pop(), undefined);
  queue.push(demands[1]);
  assert.equal(queue.pop(), demands[1]);
});
