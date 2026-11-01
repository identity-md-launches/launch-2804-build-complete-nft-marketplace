import { test } from "node:test";
import assert from "node:assert/strict";
import { zeroAddress, zeroHash } from "viem";
import { addresses, SEAPORT } from "../src/lib/contracts";
import { parseOrder, orderPrice, parameters } from "../src/lib/orders";
// Shape fixtures only. These orders carry invalid signatures and are never exported as listings.
const fixture = () => ({
  version: 1,
  chainId: 11155111,
  exchange: SEAPORT,
  components: {
    offerer: addresses.core,
    zone: zeroAddress,
    offer: [
      {
        itemType: 2,
        token: addresses.nft,
        identifierOrCriteria: "1",
        startAmount: "1",
        endAmount: "1",
      },
    ],
    consideration: [
      {
        itemType: 0,
        token: zeroAddress,
        identifierOrCriteria: "0",
        startAmount: "100",
        endAmount: "100",
        recipient: addresses.core,
      },
    ],
    orderType: 0,
    startTime: "1",
    endTime: "9999999999",
    zoneHash: zeroHash,
    salt: "1",
    conduitKey: zeroHash,
    counter: "0",
  },
  signature: "0x12",
});
test("order parser round-trips bigint fields without floats", () => {
  const o = parseOrder(JSON.stringify(fixture()));
  assert.equal(orderPrice(o), 100n);
  assert.equal(parameters(o).totalOriginalConsiderationItems, 1n);
  assert.equal(o.components.offer[0].identifierOrCriteria, 1n);
});
test("orders from other chains and exchanges are rejected", () => {
  const o = fixture();
  o.chainId = 1;
  assert.throws(() => parseOrder(JSON.stringify(o)), /Sepolia/);
  const p = fixture();
  p.exchange = addresses.core;
  assert.throws(() => parseOrder(JSON.stringify(p)));
});
test("unlimited approvals, other NFTs, dynamic prices, and restricted orders cannot be imported", () => {
  for (const mutate of [
    (o: ReturnType<typeof fixture>) =>
      (o.components.offer[0].token = addresses.token),
    (o: ReturnType<typeof fixture>) =>
      (o.components.offer[0].startAmount = "2"),
    (o: ReturnType<typeof fixture>) =>
      (o.components.consideration[0].endAmount = "999"),
    (o: ReturnType<typeof fixture>) => (o.components.orderType = 2),
  ]) {
    const o = fixture();
    mutate(o);
    assert.throws(() => parseOrder(JSON.stringify(o)));
  }
});
test("malformed JSON and oversized orders fail closed", () => {
  assert.throws(() => parseOrder("{"));
  assert.throws(() => parseOrder("x".repeat(24001)));
  const o = fixture();
  o.components.counter = "-1";
  assert.throws(() => parseOrder(JSON.stringify(o)));
});
