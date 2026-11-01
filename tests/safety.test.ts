import { test } from "node:test";
import assert from "node:assert/strict";
import { assertCanonical, verifyGraph } from "../src/lib/verify";
import { client } from "../src/lib/contracts";
const hash =
  "0xb598179acc944dc9f3ea91b54f8003598cc2701539854d33e179e3602269d3d5" as const;
test("snapshot is rejected if its block hash changes during reads", async () => {
  const mock = {
    getBlock: async () => ({ hash: "0xchanged" }),
  } as unknown as typeof client;
  await assert.rejects(
    () => assertCanonical({ number: 12037976n, hash }, mock),
    /reorganized/,
  );
});
test("canonical snapshot passes without substituting another block", async () => {
  const mock = {
    getBlock: async ({ blockNumber }: { blockNumber: bigint }) => {
      assert.equal(blockNumber, 12037976n);
      return { hash };
    },
  } as unknown as typeof client;
  await assertCanonical({ number: 12037976n, hash }, mock);
});
test("wrong-chain reads stop before accessing deployment state", async () => {
  let read = false;
  const mock = {
    getChainId: async () => 1,
    getStorageAt: async () => {
      read = true;
      throw Error("must not read");
    },
  } as unknown as typeof client;
  await assert.rejects(() => verifyGraph(12037976n, mock), /not Sepolia/);
  assert.equal(read, false);
});
