"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import {
  WagmiProvider,
  useConnection,
  useConnect,
  useConnectors,
  useDisconnect,
  useSwitchChain,
  type Connector,
} from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Wallet, ArrowUpRight, LogOut, AlertCircle } from "lucide-react";
import { config } from "@/lib/wallet";
import { CHAIN, short } from "@/lib/contracts";
import { OPEN_IN, isMobileBrowser } from "@/lib/open-in";
import { Modal } from "./Modal";
const WalletUI = createContext(() => {});
export const useWalletUI = () => useContext(WalletUI);
function WalletLayer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false),
    [mobile, setMobile] = useState(false);
  const { isConnected, address, chainId } = useConnection();
  const { mutate: connect, isPending, variables, error } = useConnect();
  const connectors = useConnectors();
  const { mutate: disconnect } = useDisconnect();
  const {
    mutate: switchChain,
    error: switchError,
    isPending: switching,
  } = useSwitchChain();
  useEffect(() => {
    setMobile(isMobileBrowser());
  }, []);
  useEffect(() => {
    if (isConnected) setOpen(false);
  }, [isConnected]);
  const named = connectors.some(
    (c) => c.type === "injected" && c.id !== "injected",
  );
  const listed = [
    ...connectors.filter((c) => c.type === "injected"),
    ...connectors.filter((c) => c.type !== "injected"),
  ].filter((c) => !(c.id === "injected" && named));
  const label = (c: Connector) =>
    c.id === "injected"
      ? "Browser wallet"
      : c.id === "coinbaseWalletSDK" && mobile
        ? "Coinbase Smart Wallet"
        : c.name;
  return (
    <WalletUI.Provider value={() => setOpen(true)}>
      {children}
      {open && (
        <Modal
          title={isConnected ? "Your wallet" : "Connect a wallet"}
          onClose={() => setOpen(false)}
        >
          <p className="muted">
            Sepolia testnet only. Your wallet keeps your keys.
          </p>
          {isConnected && address ? (
            <>
              <p className="address">{address}</p>
              {chainId !== CHAIN.id && (
                <button
                  className="button primary full"
                  disabled={switching}
                  onClick={() => switchChain({ chainId: CHAIN.id })}
                >
                  {switching ? "Switching…" : "Switch to Sepolia"}
                </button>
              )}
              <button
                className="button full"
                onClick={() => {
                  disconnect();
                  setOpen(false);
                }}
              >
                <LogOut size={18} /> Disconnect
              </button>
            </>
          ) : (
            <div className="wallet-rows">
              {mobile &&
                OPEN_IN.map((w) => (
                  <a
                    key={w.id}
                    className="wallet-row"
                    href={w.href(location.href)}
                  >
                    <img
                      width="28"
                      height="28"
                      src={`./wallets/${w.id}.svg`}
                      alt=""
                    />
                    <span>Open in {w.name}</span>
                    <ArrowUpRight size={18} />
                  </a>
                ))}
              {listed
                .filter((c) => !mobile || c.type !== "injected")
                .map((c) => (
                  <button
                    type="button"
                    className="wallet-row"
                    key={c.uid}
                    disabled={isPending}
                    onClick={() => connect({ connector: c, chainId: CHAIN.id })}
                  >
                    {c.icon ? (
                      <img src={c.icon} width="28" height="28" alt="" />
                    ) : c.id === "coinbaseWalletSDK" ? (
                      <img
                        src="./wallets/coinbase.svg"
                        width="28"
                        height="28"
                        alt=""
                      />
                    ) : (
                      <Wallet size={24} />
                    )}
                    <span>
                      {label(c)}
                      {isPending && variables?.connector === c
                        ? " · opening…"
                        : ""}
                    </span>
                    <ArrowUpRight size={18} />
                  </button>
                ))}
            </div>
          )}
          {(error || switchError) && (
            <p role="alert" className="error-text">
              <AlertCircle size={18} />
              {(error || switchError)?.message.split("\n")[0]} Try again in your
              wallet.
            </p>
          )}
          <p className="fine muted">
            By connecting, you allow this site to read your address. Every
            signature and transaction needs your approval.
          </p>
        </Modal>
      )}
    </WalletUI.Provider>
  );
}
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <WalletLayer>{children}</WalletLayer>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
export function ConnectButton() {
  const open = useWalletUI();
  const { address, isConnected, chainId } = useConnection();
  return (
    <button
      type="button"
      className="button primary connect-button"
      onClick={open}
    >
      <Wallet size={17} />
      <span>
        {isConnected && address
          ? chainId !== CHAIN.id
            ? "Switch network"
            : short(address)
          : "Connect wallet"}
      </span>
    </button>
  );
}
