import {
  zeroAddress,
  zeroHash,
  hashStruct,
  parseAbi,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import { SeaportABI } from "./abi/Seaport";
import { addresses, abis, CHAIN, SEAPORT, client, same } from "./contracts";
import { assertCanonical, verifiedBlock } from "./verify";
import { readToken } from "./reads";
import { type Squeek } from "./logic";
export const seaportAbi = SeaportABI;
export const orderTypes = {
  OrderComponents: [
    { name: "offerer", type: "address" },
    { name: "zone", type: "address" },
    { name: "offer", type: "OfferItem[]" },
    { name: "consideration", type: "ConsiderationItem[]" },
    { name: "orderType", type: "uint8" },
    { name: "startTime", type: "uint256" },
    { name: "endTime", type: "uint256" },
    { name: "zoneHash", type: "bytes32" },
    { name: "salt", type: "uint256" },
    { name: "conduitKey", type: "bytes32" },
    { name: "counter", type: "uint256" },
  ],
  OfferItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
  ],
  ConsiderationItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
    { name: "recipient", type: "address" },
  ],
} as const;
export const domain = {
  name: "Seaport",
  version: "1.6",
  chainId: CHAIN.id,
  verifyingContract: SEAPORT,
} as const;
export type OfferItem = {
  itemType: number;
  token: Address;
  identifierOrCriteria: bigint;
  startAmount: bigint;
  endAmount: bigint;
};
export type ConsiderationItem = OfferItem & { recipient: Address };
export type Components = {
  offerer: Address;
  zone: Address;
  offer: OfferItem[];
  consideration: ConsiderationItem[];
  orderType: number;
  startTime: bigint;
  endTime: bigint;
  zoneHash: Hex;
  salt: bigint;
  conduitKey: Hex;
  counter: bigint;
};
export type SignedOrder = {
  version: 1;
  chainId: 11155111;
  exchange: Address;
  components: Components;
  signature: Hex;
};
export const orderHash = (o: SignedOrder) =>
  hashStruct({
    data: o.components,
    primaryType: "OrderComponents",
    types: orderTypes,
  });
export const orderToken = (o: SignedOrder) =>
  o.components.offer[0].identifierOrCriteria.toString();
export const orderPrice = (o: SignedOrder) =>
  o.components.consideration.reduce((n, x) => n + x.startAmount, 0n);
export const parameters = (o: SignedOrder) => {
  const { counter: _, ...c } = o.components;
  return {
    ...c,
    totalOriginalConsiderationItems: BigInt(c.consideration.length),
  };
};
export function parseOrder(text: string): SignedOrder {
  if (text.length > 24000)
    throw Error("Order file is too large. Use one exported Squeek order.");
  const raw = JSON.parse(text);
  const c = raw?.components;
  if (
    raw?.version !== 1 ||
    raw?.chainId !== CHAIN.id ||
    typeof raw.exchange !== "string" ||
    !same(raw.exchange, SEAPORT) ||
    !c ||
    !Array.isArray(c.offer) ||
    !Array.isArray(c.consideration) ||
    c.offer.length !== 1 ||
    c.consideration.length < 1 ||
    c.consideration.length > 2
  )
    throw Error("Use a Sepolia Squeek Market order for Seaport 1.6.");
  const address = (x: unknown): Address => {
    if (typeof x !== "string" || !/^0x[0-9a-f]{40}$/i.test(x))
      throw Error("Invalid order address.");
    return x as Address;
  };
  const uint = (x: unknown) => {
    if (
      typeof x !== "string" ||
      !/^\d{1,78}$/.test(x) ||
      BigInt(x) >= 2n ** 256n
    )
      throw Error("Invalid order integer.");
    return BigInt(x);
  };
  const bytes = (x: unknown, len: number): Hex => {
    if (
      typeof x !== "string" ||
      !new RegExp(`^0x[0-9a-f]{${len}}$`, "i").test(x)
    )
      throw Error("Invalid order bytes.");
    return x as Hex;
  };
  const item = (x: Record<string, unknown>): OfferItem => ({
    itemType: Number(x.itemType),
    token: address(x.token),
    identifierOrCriteria: uint(x.identifierOrCriteria),
    startAmount: uint(x.startAmount),
    endAmount: uint(x.endAmount),
  });
  const components: Components = {
    offerer: address(c.offerer),
    zone: address(c.zone),
    offer: c.offer.map(item),
    consideration: c.consideration.map((x: Record<string, unknown>) => ({
      ...item(x),
      recipient: address(x.recipient),
    })),
    orderType: c.orderType,
    startTime: uint(c.startTime),
    endTime: uint(c.endTime),
    zoneHash: bytes(c.zoneHash, 64),
    salt: uint(c.salt),
    conduitKey: bytes(c.conduitKey, 64),
    counter: uint(c.counter),
  };
  const offer = components.offer[0];
  if (
    offer.itemType !== 2 ||
    !same(offer.token, addresses.nft) ||
    offer.startAmount !== 1n ||
    offer.endAmount !== 1n ||
    offer.identifierOrCriteria < 1n ||
    components.orderType !== 0 ||
    !same(components.zone, zeroAddress) ||
    components.zoneHash !== zeroHash ||
    components.conduitKey !== zeroHash ||
    components.startTime >= components.endTime
  )
    throw Error(
      "Only fixed-price, full-open orders for one Squeek are supported.",
    );
  if (
    components.consideration.some(
      (x) =>
        x.itemType !== 0 ||
        !same(x.token, zeroAddress) ||
        x.identifierOrCriteria !== 0n ||
        x.startAmount <= 0n ||
        x.startAmount !== x.endAmount,
    ) ||
    !same(components.consideration[0].recipient, components.offerer)
  )
    throw Error(
      "The order must pay a fixed amount of Sepolia ETH to the seller and royalty receiver.",
    );
  if (
    typeof raw.signature !== "string" ||
    !/^0x[0-9a-f]{2,8192}$/i.test(raw.signature) ||
    raw.signature.length % 2 !== 0
  )
    throw Error("Invalid order signature.");
  return {
    version: 1,
    chainId: 11155111,
    exchange: SEAPORT,
    components,
    signature: raw.signature,
  };
}
export async function verifyExchange(blockNumber: bigint) {
  const code = await client.getCode({ address: SEAPORT, blockNumber });
  if (!code || code === "0x")
    throw Error("Seaport is unavailable on this network.");
  const info = (await client.readContract({
    address: SEAPORT,
    abi: seaportAbi,
    functionName: "information",
    blockNumber,
  })) as [string, Hex, Address];
  if (info[0] !== "1.6") throw Error("Unexpected Seaport version.");
}
export class OrderApprovalError extends Error {
  constructor() {
    super("The seller has not approved Seaport for this Squeek.");
    this.name = "OrderApprovalError";
  }
}
export async function inspectOrder(
  o: SignedOrder,
): Promise<{
  token: Squeek;
  block: Awaited<ReturnType<typeof verifiedBlock>>;
}> {
  const block = await verifiedBlock(client, true);
  await verifyExchange(block.number);
  const token = await readToken(BigInt(orderToken(o)), block.number);
  if (!token) throw Error("This Squeek was burned or has no live position.");
  const c = o.components;
  if (!same(token.owner, c.offerer))
    throw Error("The seller no longer owns this Squeek.");
  if (block.timestamp < c.startTime || block.timestamp >= c.endTime)
    throw Error("This listing is not active or has expired.");
  const [counter, status, approved, approvedAll, royalty] = (await Promise.all([
    client.readContract({
      address: SEAPORT,
      abi: seaportAbi,
      functionName: "getCounter",
      args: [c.offerer],
      blockNumber: block.number,
    }),
    client.readContract({
      address: SEAPORT,
      abi: seaportAbi,
      functionName: "getOrderStatus",
      args: [orderHash(o)],
      blockNumber: block.number,
    }),
    client.readContract({
      address: addresses.nft,
      abi: abis.nft,
      functionName: "getApproved",
      args: [BigInt(token.id)],
      blockNumber: block.number,
    }),
    client.readContract({
      address: addresses.nft,
      abi: abis.nft,
      functionName: "isApprovedForAll",
      args: [c.offerer, SEAPORT],
      blockNumber: block.number,
    }),
    client.readContract({
      address: addresses.nft,
      abi: abis.nft,
      functionName: "royaltyInfo",
      args: [BigInt(token.id), orderPrice(o)],
      blockNumber: block.number,
    }),
  ])) as [
    bigint,
    [boolean, boolean, bigint, bigint],
    string,
    boolean,
    [string, bigint],
  ];
  if (counter !== c.counter || status[1] || status[2] > 0n)
    throw Error("This listing was filled or cancelled.");
  if (!same(approved, SEAPORT) && !approvedAll)
    throw new OrderApprovalError();
  const royaltyPaid = c.consideration
    .slice(1)
    .filter((x) => same(x.recipient, royalty[0]))
    .reduce((n, x) => n + x.startAmount, 0n);
  if (
    royaltyPaid !== royalty[1] ||
    c.consideration.slice(1).some((x) => !same(x.recipient, royalty[0]))
  )
    throw Error("The order does not match the current ERC-2981 royalty.");
  const valid = await client.verifyTypedData({
    address: c.offerer,
    domain,
    types: orderTypes,
    primaryType: "OrderComponents",
    message: c,
    signature: o.signature,
    blockNumber: block.number,
  });
  if (!valid) throw Error("The seller signature is invalid.");
  await assertCanonical(block);
  return { token, block };
}
export async function freshOwner(id: string, account: Address) {
  const block = await verifiedBlock(client, true);
  const owner = (await client.readContract({
    address: addresses.nft,
    abi: abis.nft,
    functionName: "ownerOf",
    args: [BigInt(id)],
    blockNumber: block.number,
  })) as string;
  if (!same(owner, account))
    throw Error(`The connected wallet no longer owns Squeek #${id}.`);
  await verifyExchange(block.number);
  await assertCanonical(block);
  return block;
}
export async function makeOrder(
  id: string,
  account: Address,
  price: bigint,
  days: number,
): Promise<Components> {
  const block = await freshOwner(id, account);
  if (price <= 0n) throw Error("Enter a price greater than zero.");
  const [counter, royalty] = (await Promise.all([
    client.readContract({
      address: SEAPORT,
      abi: seaportAbi,
      functionName: "getCounter",
      args: [account],
      blockNumber: block.number,
    }),
    client.readContract({
      address: addresses.nft,
      abi: abis.nft,
      functionName: "royaltyInfo",
      args: [BigInt(id), price],
      blockNumber: block.number,
    }),
  ])) as [bigint, [Address, bigint]];
  if (royalty[1] >= price) throw Error("Price must exceed the royalty.");
  const payment = (amount: bigint, recipient: Address): ConsiderationItem => ({
    itemType: 0,
    token: zeroAddress,
    identifierOrCriteria: 0n,
    startAmount: amount,
    endAmount: amount,
    recipient,
  });
  return {
    offerer: account,
    zone: zeroAddress,
    offer: [
      {
        itemType: 2,
        token: addresses.nft,
        identifierOrCriteria: BigInt(id),
        startAmount: 1n,
        endAmount: 1n,
      },
    ],
    consideration: [
      payment(price - royalty[1], account),
      ...(royalty[1] > 0n ? [payment(royalty[1], royalty[0])] : []),
    ],
    orderType: 0,
    startTime: block.timestamp,
    endTime: block.timestamp + BigInt(days) * 86400n,
    zoneHash: zeroHash,
    salt: BigInt(
      `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("")}`,
    ),
    conduitKey: zeroHash,
    counter,
  };
}
export async function approvalNeeded(id: string, account: Address) {
  const block = await freshOwner(id, account);
  const approved = (await client.readContract({
    address: addresses.nft,
    abi: abis.nft,
    functionName: "getApproved",
    args: [BigInt(id)],
    blockNumber: block.number,
  })) as string;
  return !same(approved, SEAPORT);
}
export function orderUrl(o: SignedOrder) {
  const base = location.href.split("#")[0];
  return `${base}#order=${btoa(JSON.stringify(o, (_k, v) => (typeof v === "bigint" ? v.toString() : v)))}`;
}
export const STORAGE_KEY = "squeek-market.orders.v1";
export function savedOrders(): SignedOrder[] {
  try {
    const a = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(a)
      ? a.slice(0, 100).map((x: unknown) => parseOrder(JSON.stringify(x)))
      : [];
  } catch {
    return [];
  }
}
export function storeOrders(orders: SignedOrder[]) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(orders, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
  );
}
