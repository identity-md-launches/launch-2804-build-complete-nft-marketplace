import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { verifiedBlock, assertCanonical } from "../src/lib/verify";
import { readToken } from "../src/lib/reads";
import { client, addresses, abis, SEAPORT } from "../src/lib/contracts";
import {
  makeOrder,
  orderHash,
  seaportAbi,
  verifyExchange,
  type SignedOrder,
} from "../src/lib/orders";
import { type Address, type Abi } from "viem";
import { exactSQK, stringify } from "../src/lib/logic";
const block = await verifiedBlock();
const token = await readToken(1n, block.number);
assert(token);
await verifyExchange(block.number);
await assertCanonical(block);
const components = await makeOrder(
  token.id,
  token.owner as Address,
  10000000000000000n,
  7,
);
const unsigned = {
  version: 1,
  chainId: 11155111,
  exchange: SEAPORT,
  components,
  signature: "0x",
} as SignedOrder;
const onchainHash = await client.readContract({
  address: SEAPORT,
  abi: seaportAbi as Abi,
  functionName: "getOrderHash",
  args: [components],
});
assert.equal(orderHash(unsigned), onchainHash);
const simulated = await client.simulateContract({
  account: token.owner as Address,
  address: addresses.nft,
  abi: abis.nft,
  functionName: "approve",
  args: [SEAPORT, BigInt(token.id)],
});
const output = {
  checkedAt: new Date().toISOString(),
  chain: 11155111,
  block: block.number.toString(),
  hash: block.hash,
  checks: {
    officialDeployment: "passed",
    canonicalHash: "passed",
    seaportVersion: "1.6",
    seaportOrderHash: "matches local EIP-712 struct hash",
    unsignedApproveSimulation: "passed",
  },
  token: {
    id: token.id,
    level: token.position.level,
    activePower: token.position.activeWeight.toString(),
    unclaimedSQK: exactSQK(token.position.accruedScaled),
  },
  transactionsSent: 0,
  signaturesRequested: 0,
};
console.log(stringify(output));
await writeFile("artifacts/live-check.json", stringify(output));
