import {
  createPublicClient,
  http,
  fallback,
  type Abi,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import core from "./abi/SqueekCore.json";
import mining from "./abi/SqueekMining.json";
import nft from "./abi/SqueekNFT.json";
import token from "./abi/SqueekToken.json";
import deployment from "./deployment.json";
export { deployment };
export const CHAIN = sepolia;
export const RPC_URLS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://rpc.sepolia.org",
];
export const addresses = {
  core: deployment.contracts.SqueekCore.address as Address,
  mining: deployment.contracts.SqueekMining.address as Address,
  nft: deployment.contracts.SqueekNFT.address as Address,
  token: deployment.contracts.SqueekToken.address as Address,
};
export const abis = {
  core: core as Abi,
  mining: mining as Abi,
  nft: nft as Abi,
  token: token as Abi,
};
export function makeClient(url?: string) {
  return createPublicClient({
    chain: CHAIN,
    transport: url
      ? http(url, { timeout: 15000, retryCount: 0 })
      : fallback(
          RPC_URLS.map((u) => http(u, { timeout: 12000, retryCount: 0 })),
          { retryCount: 0 },
        ),
    batch: { multicall: false },
  });
}
export const client = makeClient();
export const EXPLORER = "https://eth-sepolia.blockscout.com";
export const SEAPORT = "0x0000000000000068F116a894984e2DB1123eB395" as Address;
export const same = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase();
export const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
