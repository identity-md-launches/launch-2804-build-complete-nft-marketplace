import { getAddress, keccak256, parseAbi, type Address, type Hex } from "viem";
import {
  addresses,
  abis,
  deployment,
  same,
  client as defaultClient,
} from "./contracts";
const IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const identityAbi = parseAbi([
  "function implementationCodeAddress() view returns (address)",
  "function implementationCodeVersion() view returns (uint64)",
  "function implementationStorageLayoutDigest() view returns (bytes32)",
  "function owner() view returns (address)",
]);
function slotAddress(word: Hex | undefined) {
  if (!word || word.length !== 66) throw Error("Missing proxy slot");
  return getAddress(`0x${word.slice(-40)}`);
}
export async function verifyGraph(blockNumber: bigint, client = defaultClient) {
  if ((await client.getChainId()) !== deployment.chainId)
    throw Error("RPC is not Sepolia. Reads stopped.");
  for (const name of ["SqueekCore", "SqueekMining"] as const) {
    const expected = deployment.contracts[name],
      address = expected.address as Address;
    const [implementationWord, adminWord] = await Promise.all([
      client.getStorageAt({ address, slot: IMPLEMENTATION_SLOT, blockNumber }),
      client.getStorageAt({ address, slot: ADMIN_SLOT, blockNumber }),
    ]);
    const implementation = slotAddress(implementationWord),
      admin = slotAddress(adminWord);
    const read = { address, abi: identityAbi, blockNumber } as const;
    const [code, reported, version, layout, owner] = await Promise.all([
      client.getCode({ address: implementation, blockNumber }),
      client.readContract({
        ...read,
        functionName: "implementationCodeAddress",
      }),
      client.readContract({
        ...read,
        functionName: "implementationCodeVersion",
      }),
      client.readContract({
        ...read,
        functionName: "implementationStorageLayoutDigest",
      }),
      client.readContract({
        address: admin,
        abi: identityAbi,
        functionName: "owner",
        blockNumber,
      }),
    ]);
    if (
      !same(implementation, expected.implementation) ||
      !same(reported, implementation) ||
      !code ||
      !same(keccak256(code), expected.implementationRuntimeHash) ||
      !same(admin, expected.proxyAdmin) ||
      !same(layout, expected.storageLayoutDigest) ||
      !same(owner, deployment.operational.governanceTimelock.address) ||
      version !== BigInt(expected.implementationVersion)
    )
      throw Error(
        `${name} identity differs from the pinned deployment. Reads stopped.`,
      );
  }
  const [
    miningCore,
    tokenMining,
    policy,
    config,
    miningConfig,
    nftMining,
    nftCore,
    decimals,
  ] = (await Promise.all([
    client.readContract({
      address: addresses.mining,
      abi: abis.mining,
      functionName: "core",
      blockNumber,
    }),
    client.readContract({
      address: addresses.token,
      abi: abis.token,
      functionName: "mining",
      blockNumber,
    }),
    client.readContract({
      address: addresses.mining,
      abi: abis.mining,
      functionName: "collectionPolicy",
      args: [0],
      blockNumber,
    }),
    client.readContract({
      address: addresses.core,
      abi: abis.core,
      functionName: "configuration",
      blockNumber,
    }),
    client.readContract({
      address: addresses.mining,
      abi: abis.mining,
      functionName: "configuration",
      blockNumber,
    }),
    client.readContract({
      address: addresses.nft,
      abi: abis.nft,
      functionName: "mining",
      blockNumber,
    }),
    client.readContract({
      address: addresses.nft,
      abi: abis.nft,
      functionName: "sqkCore",
      blockNumber,
    }),
    client.readContract({
      address: addresses.token,
      abi: abis.token,
      functionName: "decimals",
      blockNumber,
    }),
  ])) as [
    string,
    string,
    { nft: string; maximumLevel: number },
    Record<string, unknown>,
    { token: string; genesisCollection: string },
    string,
    string,
    number,
  ];
  if (
    !same(miningCore, addresses.core) ||
    !same(tokenMining, addresses.mining) ||
    !same(policy.nft, addresses.nft) ||
    !same(miningConfig.token, addresses.token) ||
    !same(miningConfig.genesisCollection, addresses.nft) ||
    !same(nftMining, addresses.mining) ||
    !same(nftCore, addresses.core) ||
    decimals !== 18
  )
    throw Error("Contract bindings or SQK decimals differ. Reads stopped.");
  for (const [key, value] of Object.entries(deployment.coreConfiguration)) {
    const actual = config[key];
    if (
      typeof value === "string"
        ? typeof actual !== "string" || !same(actual, value)
        : BigInt(actual as bigint) !== BigInt(value)
    )
      throw Error(`Launch configuration mismatch: ${key}. Reads stopped.`);
  }
  return {
    blockNumber,
    release: deployment.release,
    maximumLevel: policy.maximumLevel,
  };
}
export async function verifiedBlock(client = defaultClient, latest = false) {
  const block = await client.getBlock(
    latest
      ? { blockTag: "latest" }
      : { blockNumber: (await client.getBlockNumber({ cacheTime: 0 })) - 12n },
  );
  await verifyGraph(block.number, client);
  return block;
}
export async function assertCanonical(
  block: { number: bigint; hash: Hex },
  client = defaultClient,
) {
  if (
    (await client.getBlock({ blockNumber: block.number })).hash !== block.hash
  )
    throw Error("Chain reorganized during this read. Refresh to try again.");
}
