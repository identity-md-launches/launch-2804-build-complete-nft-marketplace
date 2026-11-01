import { createConfig, http, fallback } from "wagmi";
import { injected } from "wagmi/connectors/injected";
import { coinbaseWallet } from "wagmi/connectors/coinbaseWallet";
import { CHAIN, RPC_URLS } from "./contracts";
export const config = createConfig({
  chains: [CHAIN],
  ssr: true,
  multiInjectedProviderDiscovery: true,
  connectors: [
    injected(),
    coinbaseWallet({
      appName: "Squeek Market",
      preference: { options: "all" },
    }),
  ],
  transports: { [CHAIN.id]: fallback(RPC_URLS.map((url) => http(url))) },
});
