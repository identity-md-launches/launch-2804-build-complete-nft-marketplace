export const SCALE = 1n << 128n;
export function errorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "shortMessage" in error &&
    typeof error.shortMessage === "string"
  )
    return error.shortMessage;
  return error instanceof Error
    ? error.message.split("\n")[0]
    : "The chain read failed. Try again.";
}
export const SQK_UNIT = 10n ** 18n;
/** Integer division occurs once at the base-unit boundary, never in floating point. */
export const rewardBaseUnits = (scaled: bigint) => scaled / SCALE;
export function decimal(value: bigint, decimals = 18, places = 6): string {
  const unit = 10n ** BigInt(decimals),
    whole = value / unit,
    rem = value % unit;
  if (rem === 0n) return whole.toLocaleString("en-US");
  const fraction = rem
    .toString()
    .padStart(decimals, "0")
    .slice(0, places)
    .replace(/0+$/, "");
  return fraction
    ? `${whole.toLocaleString("en-US")}.${fraction}`
    : whole > 0n
      ? whole.toLocaleString("en-US")
      : `<${(1 / 10 ** places).toFixed(places)}`;
}
export function exactSQK(scaled: bigint) {
  const n = rewardBaseUnits(scaled);
  const whole = n / SQK_UNIT,
    rem = n % SQK_UNIT;
  return `${whole}.${rem.toString().padStart(18, "0")}`;
}
export const displaySQK = (scaled: bigint) => decimal(rewardBaseUnits(scaled));
export function cooldown(
  p: { level: number; pendingRound: number; nextMergeBlock: number },
  height: bigint,
  max = 10,
) {
  if (p.level >= max)
    return { label: "Max level", ready: false, remaining: 0n };
  if (p.pendingRound > 0)
    return { label: "Power pending", ready: false, remaining: 0n };
  const remaining =
    BigInt(p.nextMergeBlock) > height ? BigInt(p.nextMergeBlock) - height : 0n;
  return {
    label:
      remaining > 0n
        ? `${remaining.toLocaleString()} blocks left`
        : "Merge ready",
    ready: remaining === 0n,
    remaining,
  };
}
export type Position = {
  activeWeight: bigint;
  pendingWeight: bigint;
  pendingRound: number;
  nextMergeBlock: number;
  level: number;
  lastIndex: bigint;
  accruedScaled: bigint;
};
export type Squeek = {
  id: string;
  owner: string;
  position: Position;
  uri: string;
  image: string;
  name: string;
  description: string;
  attributes: { trait_type: string; value: string | number }[];
  royaltyReceiver: string;
  royaltyBps: bigint;
};
export type Snapshot = {
  block: string;
  hash: string;
  timestamp: string;
  height: string;
  totalSupply: string;
  totalIssued: string;
  maximumLevel: number;
  tokens: Squeek[];
  partial: boolean;
  source: "live" | "saved";
};
export const stringify = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x), 2);
export function reviveSnapshot(raw: Snapshot): Snapshot {
  return {
    ...raw,
    tokens: raw.tokens.map((t) => ({
      ...t,
      royaltyBps: BigInt(t.royaltyBps),
      position: {
        ...t.position,
        activeWeight: BigInt(t.position.activeWeight),
        pendingWeight: BigInt(t.position.pendingWeight),
        lastIndex: BigInt(t.position.lastIndex),
        accruedScaled: BigInt(t.position.accruedScaled),
      },
    })),
  };
}
export type Filters = {
  query: string;
  level: string;
  minPower: string;
  minRewards: string;
  cooldown: string;
  maxPrice: string;
  sort: string;
  listedOnly: boolean;
};
export const initialFilters: Filters = {
  query: "",
  level: "all",
  minPower: "",
  minRewards: "",
  cooldown: "all",
  maxPrice: "",
  sort: "id",
  listedOnly: false,
};
export function filterTokens(
  tokens: Squeek[],
  f: Filters,
  height: bigint,
  prices: Map<string, bigint>,
) {
  const minR = decimalToUnits(f.minRewards || "0"),
    maxP = f.maxPrice ? decimalToUnits(f.maxPrice) : undefined;
  return tokens
    .filter((t) => {
      const p = t.position,
        price = prices.get(t.id);
      return (
        (!f.query || t.id === f.query.replace(/^#/, "")) &&
        (f.level === "all" || p.level === Number(f.level)) &&
        (!f.minPower || p.activeWeight >= BigInt(f.minPower)) &&
        rewardBaseUnits(p.accruedScaled) >= minR &&
        (f.cooldown === "all" ||
          (f.cooldown === "ready") === cooldown(p, height).ready) &&
        (!f.listedOnly || price !== undefined) &&
        (maxP === undefined || (price !== undefined && price <= maxP))
      );
    })
    .sort((a, b) => {
      const cmp = (x: bigint, y: bigint) => (x < y ? -1 : x > y ? 1 : 0);
      if (f.sort === "power")
        return cmp(b.position.activeWeight, a.position.activeWeight);
      if (f.sort === "rewards")
        return cmp(b.position.accruedScaled, a.position.accruedScaled);
      if (f.sort === "level") return b.position.level - a.position.level;
      if (f.sort === "price")
        return cmp(
          prices.get(a.id) ?? 2n ** 255n,
          prices.get(b.id) ?? 2n ** 255n,
        );
      return cmp(BigInt(a.id), BigInt(b.id));
    });
}
export function decimalToUnits(s: string): bigint {
  if (!/^\d*(\.\d{0,18})?$/.test(s) || !s || s === ".")
    throw Error("Enter a positive amount with at most 18 decimals.");
  const [a, b = ""] = s.split(".");
  return BigInt(a || "0") * SQK_UNIT + BigInt(b.padEnd(18, "0"));
}
export function safeImage(url: unknown): string {
  return typeof url === "string" &&
    /^data:image\/(svg\+xml|png|jpeg|webp);(base64,|utf8,|charset=utf-8,)/i.test(
      url,
    )
    ? url
    : "";
}
