import { type Hex, type Abi, parseAbiItem } from "viem";
import { abis, addresses, SEAPORT, client as defaultClient } from "./contracts";
import { SeaportABI } from "./abi/Seaport";
import { assertCanonical, verifiedBlock } from "./verify";
import { safeImage, type Squeek, type Snapshot, type Position } from "./logic";
export async function readToken(
  id: bigint,
  blockNumber: bigint,
  client = defaultClient,
): Promise<Squeek | null> {
  const position = (await client.readContract({
    address: addresses.mining,
    abi: abis.mining,
    functionName: "position",
    args: [0, id],
    blockNumber,
  })) as Position;
  if (position.level === 0) return null;
  const [owner, uri, royalty] = (await Promise.all([
    client.readContract({
      address: addresses.nft,
      abi: abis.nft,
      functionName: "ownerOf",
      args: [id],
      blockNumber,
    }),
    client.readContract({
      address: addresses.nft,
      abi: abis.nft,
      functionName: "tokenURI",
      args: [id],
      blockNumber,
    }),
    client.readContract({
      address: addresses.nft,
      abi: abis.nft,
      functionName: "royaltyInfo",
      args: [id, 10000n],
      blockNumber,
    }),
  ])) as [string, string, [string, bigint]];
  let meta: {
    image?: unknown;
    name?: unknown;
    description?: unknown;
    attributes?: unknown;
  } = {};
  if (uri.startsWith("data:application/json;base64,")) {
    const bin = atob(uri.split(",")[1]);
    meta = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))),
    );
  } else if (uri.startsWith("data:application/json,"))
    meta = JSON.parse(decodeURIComponent(uri.split(",").slice(1).join(",")));
  else
    throw Error(
      `Squeek #${id}: unsupported metadata URI. No remote content was loaded.`,
    );
  return {
    id: id.toString(),
    owner,
    position,
    uri,
    image: safeImage(meta.image),
    name: typeof meta.name === "string" ? meta.name : `Squeek #${id}`,
    description: typeof meta.description === "string" ? meta.description : "",
    attributes: Array.isArray(meta.attributes)
      ? meta.attributes.filter(
          (a) =>
            a &&
            typeof a.trait_type === "string" &&
            ["string", "number"].includes(typeof a.value),
        )
      : [],
    royaltyReceiver: royalty[0],
    royaltyBps: royalty[1],
  };
}
export async function loadSnapshot(
  options: { offset?: number; limit?: number; id?: bigint } = {},
  client = defaultClient,
): Promise<Snapshot> {
  const block = await verifiedBlock(client);
  const blockNumber = block.number;
  const read = { address: addresses.nft, abi: abis.nft, blockNumber };
  const [
    state,
    totalSupply,
    totalIssued,
    nextPublic,
    nextReserve,
    publicAllocation,
  ] = (await Promise.all([
    client.readContract({
      address: addresses.core,
      abi: abis.core,
      functionName: "state",
      blockNumber,
    }),
    client.readContract({ ...read, functionName: "totalSupply" }),
    client.readContract({ ...read, functionName: "totalIssued" }),
    client.readContract({ ...read, functionName: "nextPublicTokenId" }),
    client.readContract({ ...read, functionName: "nextReserveTokenId" }),
    client.readContract({ ...read, functionName: "PUBLIC_ALLOCATION" }),
  ])) as [
    {
      blockHeight: bigint;
      cumulativeBlockUnits: bigint;
      blockProgress: bigint;
    },
    bigint,
    bigint,
    bigint,
    bigint,
    number,
  ];
  const units = BigInt(1000000000);
  if (
    state.blockHeight !== state.cumulativeBlockUnits / units ||
    state.blockProgress !== state.cumulativeBlockUnits % units
  )
    throw Error("Inconsistent Squeek block height. Reads stopped.");
  const ids: bigint[] = [];
  for (let id = 1n; id < nextPublic; id++) ids.push(id);
  for (let id = BigInt(publicAllocation) + 1n; id < nextReserve; id++)
    ids.push(id);
  const page =
    options.id !== undefined
      ? [options.id]
      : ids.slice(
          options.offset ?? 0,
          (options.offset ?? 0) + (options.limit ?? 24),
        );
  const tokens: Squeek[] = [];
  for (let i = 0; i < page.length; i += 4) {
    const batch = await Promise.all(
      page.slice(i, i + 4).map((id) => readToken(id, blockNumber, client)),
    );
    tokens.push(...batch.filter((t): t is Squeek => t !== null));
  }
  await assertCanonical(block, client);
  return {
    block: blockNumber.toString(),
    hash: block.hash,
    timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
    height: state.blockHeight.toString(),
    totalSupply: totalSupply.toString(),
    totalIssued: totalIssued.toString(),
    maximumLevel: 10,
    tokens,
    partial:
      options.id !== undefined ||
      ids.length > (options.offset ?? 0) + page.length,
    source: "live",
  };
}
export type Activity = {
  id: string;
  tokenId: string;
  from: string;
  to: string;
  hash: Hex;
  block: string;
  type: "Transfer" | "Mint" | "Burn" | "Sale";
  price?: string;
};
export async function loadActivity(): Promise<{
  items: Activity[];
  from: string;
  through: string;
}> {
  const block = await verifiedBlock();
  const from = block.number - 9999n;
  const event = parseAbiItem(
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  );
  const [logs, sales] = await Promise.all([
    defaultClient.getLogs({
      address: addresses.nft,
      event,
      fromBlock: from,
      toBlock: block.number,
    }),
    defaultClient.getContractEvents({
      address: SEAPORT,
      abi: SeaportABI as Abi,
      eventName: "OrderFulfilled",
      fromBlock: from,
      toBlock: block.number,
    }),
  ]);
  await assertCanonical(block);
  type Spent = {
    itemType: number;
    token: string;
    identifier: bigint;
    amount: bigint;
  };
  type Received = Spent & { recipient: string };
  const saleByToken = new Map<
    string,
    { price?: string; offerer: string; recipient: string }
  >();
  for (const l of sales) {
    if (l.removed) continue;
    const args = l.args as unknown as {
      offerer: string;
      recipient: string;
      offer: Spent[];
      consideration: Received[];
    };
    const native = args.consideration.every((i) => i.itemType === 0);
    const price = native
      ? args.consideration.reduce((n, i) => n + i.amount, 0n).toString()
      : undefined;
    for (const i of args.offer) {
      if (
        i.itemType === 2 &&
        i.token.toLowerCase() === addresses.nft.toLowerCase()
      )
        saleByToken.set(`${l.transactionHash}:${i.identifier}`, {
          price,
          offerer: args.offerer,
          recipient: args.recipient,
        });
    }
  }
  const zero = "0x0000000000000000000000000000000000000000";
  const items: Activity[] = logs
    .filter((l) => !l.removed)
    .reverse()
    .slice(0, 80)
    .map((l) => {
      const sale = saleByToken.get(`${l.transactionHash}:${l.args.tokenId}`);
      return {
        id: `11155111:${l.blockHash}:${l.transactionHash}:${l.logIndex}`,
        tokenId: l.args.tokenId!.toString(),
        from: l.args.from!,
        to: l.args.to!,
        hash: l.transactionHash,
        block: l.blockNumber.toString(),
        type: sale
          ? "Sale"
          : l.args.from === zero
            ? "Mint"
            : l.args.to === zero
              ? "Burn"
              : "Transfer",
        ...(sale?.price ? { price: sale.price } : {}),
      };
    });
  return { from: from.toString(), through: block.number.toString(), items };
}
export async function loadPortfolio(
  account: `0x${string}`,
  limit = 24,
): Promise<Snapshot> {
  const block = await verifiedBlock();
  const blockNumber = block.number;
  const read = { address: addresses.nft, abi: abis.nft, blockNumber };
  const [balance, nextPublic, nextReserve, allocation, state] =
    (await Promise.all([
      defaultClient.readContract({
        ...read,
        functionName: "balanceOf",
        args: [account],
      }),
      defaultClient.readContract({
        ...read,
        functionName: "nextPublicTokenId",
      }),
      defaultClient.readContract({
        ...read,
        functionName: "nextReserveTokenId",
      }),
      defaultClient.readContract({
        ...read,
        functionName: "PUBLIC_ALLOCATION",
      }),
      defaultClient.readContract({
        address: addresses.core,
        abi: abis.core,
        functionName: "state",
        blockNumber,
      }),
    ])) as [bigint, bigint, bigint, number, { blockHeight: bigint }];
  const ids: bigint[] = [];
  for (let id = 1n; id < nextPublic; id++) ids.push(id);
  for (let id = BigInt(allocation) + 1n; id < nextReserve; id++) ids.push(id);
  const owned: bigint[] = [];
  // Direct, bounded reads avoid public RPC providers' historical-log restrictions.
  // balanceOf supplies the full total; only this page's matching IDs need metadata.
  for (
    let cursor = 0;
    cursor < ids.length &&
    owned.length < limit &&
    BigInt(owned.length) < balance;
    cursor += 400
  ) {
    const groups: Array<bigint[]> = [];
    for (let n = 0; n < 4; n++) {
      const batch = ids.slice(cursor + n * 100, cursor + (n + 1) * 100);
      if (batch.length) groups.push(batch);
    }
    const pages = await Promise.all(
      groups.map((batch) =>
        defaultClient.multicall({
          contracts: batch.map((id) => ({
            address: addresses.nft,
            abi: abis.nft,
            functionName: "ownerOf",
            args: [id],
          })),
          blockNumber,
          allowFailure: true,
        }),
      ),
    );
    pages.forEach((results, g) =>
      results.forEach((r, n) => {
        if (
          r.status === "success" &&
          typeof r.result === "string" &&
          r.result.toLowerCase() === account.toLowerCase()
        )
          owned.push(groups[g][n]);
      }),
    );
  }
  const tokens: Squeek[] = [];
  for (let i = 0; i < Math.min(owned.length, limit); i += 4) {
    const page = await Promise.all(
      owned
        .slice(i, Math.min(i + 4, limit))
        .map((id) => readToken(id, blockNumber)),
    );
    tokens.push(...page.filter((t): t is Squeek => t !== null));
  }
  if (BigInt(tokens.length) < balance && tokens.length < limit)
    throw Error(
      "The RPC did not return a complete ownership page. Refresh to try again.",
    );
  await assertCanonical(block);
  return {
    block: blockNumber.toString(),
    hash: block.hash,
    timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
    height: state.blockHeight.toString(),
    totalSupply: balance.toString(),
    totalIssued: balance.toString(),
    maximumLevel: 10,
    tokens,
    partial: balance > BigInt(tokens.length),
    source: "live",
  };
}
