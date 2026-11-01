import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCALE,
  SQK_UNIT,
  rewardBaseUnits,
  displaySQK,
  exactSQK,
  decimal,
  cooldown,
  filterTokens,
  initialFilters,
  decimalToUnits,
  safeImage,
  type Squeek,
} from "../src/lib/logic";
const token = (
  id: string,
  level: number,
  power: bigint,
  rewards: bigint,
  pendingRound = 0,
  nextMergeBlock = 100,
): Squeek => ({
  id,
  owner: "0xowner",
  position: {
    activeWeight: power,
    pendingWeight: pendingRound ? 7000n : 0n,
    pendingRound,
    nextMergeBlock,
    level,
    lastIndex: 0n,
    accruedScaled: rewards,
  },
  image: "",
  uri: "",
  name: "",
  description: "",
  attributes: [],
  royaltyReceiver: "",
  royaltyBps: 500n,
});
test("fractional SQK uses SCALE and token decimals separately", () => {
  const scaled = 1234567891234567890n * SCALE + SCALE / 3n;
  assert.equal(rewardBaseUnits(scaled), 1234567891234567890n);
  assert.equal(displaySQK(scaled), "1.234567");
  assert.equal(exactSQK(scaled), "1.234567891234567890");
});
test("sub-wei credit is retained separately and never rounded into a claim", () => {
  assert.equal(rewardBaseUnits(SCALE - 1n), 0n);
  assert.equal(exactSQK(SCALE - 1n), "0.000000000000000000");
  assert.equal(displaySQK(SCALE), "\u003c0.000001");
});
test("integer and tiny nonzero decimal displays keep the correct magnitude", () => {
  assert.equal(displaySQK(0n), "0");
  assert.equal(decimal(SQK_UNIT + 1n), "1");
  assert.equal(
    decimal(123456789012345678901234567890n),
    "123,456,789,012.345678",
  );
});
test("active power is read independently of level and pending replacement", () => {
  const t = token("1", 3, 3000n, 0n, 12);
  assert.equal(t.position.activeWeight, 3000n);
  assert.equal(
    filterTokens([t], { ...initialFilters, minPower: "4000" }, 200n, new Map())
      .length,
    0,
  );
  assert.equal(cooldown(t.position, 200n).label, "Power pending");
});
test("cooldowns compare completed Squeek blocks at the boundary", () => {
  const t = token("1", 2, 3000n, 0n);
  assert.equal(cooldown(t.position, 99n).remaining, 1n);
  assert.equal(cooldown(t.position, 100n).ready, true);
  assert.equal(cooldown({ ...t.position, level: 10 }, 500n).label, "Max level");
});
test("filters and sorts preserve precision for powers above 2^53", () => {
  const a = token("9", 2, 9007199254740993n, 2n * SQK_UNIT * SCALE);
  const b = token("10", 3, 9007199254740994n, 3n * SQK_UNIT * SCALE);
  const prices = new Map([
    ["9", 2n * SQK_UNIT],
    ["10", SQK_UNIT],
  ]);
  assert.deepEqual(
    filterTokens(
      [a, b],
      { ...initialFilters, sort: "power" },
      100n,
      prices,
    ).map((t) => t.id),
    ["10", "9"],
  );
  assert.deepEqual(
    filterTokens([a, b], { ...initialFilters, query: "#9" }, 100n, prices).map(
      (t) => t.id,
    ),
    ["9"],
  );
  assert.deepEqual(
    filterTokens(
      [a, b],
      {
        ...initialFilters,
        minRewards: "2.5",
        maxPrice: "1.5",
        listedOnly: true,
      },
      100n,
      prices,
    ).map((t) => t.id),
    ["10"],
  );
  assert.equal(
    filterTokens([a, b], { ...initialFilters, level: "1" }, 100n, prices)
      .length,
    0,
  );
});
test("decimal input uses exact integers and rejects scientific notation", () => {
  assert.equal(decimalToUnits("0.000000000000000001"), 1n);
  assert.equal(decimalToUnits("123.45"), 123450000000000000000n);
  for (const s of ["1e18", "-1", ".", "0.1234567890123456789"])
    assert.throws(() => decimalToUnits(s));
});
test("metadata images allow isolated data images and reject script or remote URLs", () => {
  assert.equal(safeImage("javascript:alert(1)"), "");
  assert.equal(safeImage("https://tracker.example/a.svg"), "");
  assert.equal(
    safeImage("data:image/svg+xml;base64,PHN2Zz4="),
    "data:image/svg+xml;base64,PHN2Zz4=",
  );
});
