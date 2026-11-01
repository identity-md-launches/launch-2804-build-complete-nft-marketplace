"use client";
import { useState } from "react";
import { useConnection, useWalletClient } from "wagmi";
import { Check, ExternalLink, Copy, Download, ShieldCheck } from "lucide-react";
import {
  zeroHash,
  encodeFunctionData,
  type Address,
  type Hash,
  type Abi,
} from "viem";
import {
  client,
  addresses,
  abis,
  CHAIN,
  SEAPORT,
  EXPLORER,
  same,
} from "@/lib/contracts";
import {
  type Squeek,
  displaySQK,
  exactSQK,
  decimal,
  decimalToUnits,
  stringify,
} from "@/lib/logic";
import {
  type SignedOrder,
  approvalNeeded,
  freshOwner,
  makeOrder,
  inspectOrder,
  orderHash,
  orderPrice,
  orderTypes,
  domain,
  parameters,
  seaportAbi,
  orderUrl,
} from "@/lib/orders";
import { useWalletUI } from "./Providers";
export function TradePanel({
  token,
  order,
  onOrder,
  onRefresh,
}: {
  token: Squeek;
  order?: SignedOrder;
  onOrder: (o: SignedOrder | null) => void;
  onRefresh: () => void;
}) {
  const { address, chainId } = useConnection();
  const { data: wallet } = useWalletClient();
  const connect = useWalletUI();
  const [price, setPrice] = useState(""),
    [days, setDays] = useState("7"),
    [stage, setStage] = useState<"idle" | "review" | "confirm-buy">("idle"),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [hash, setHash] = useState<Hash>(),
    [fresh, setFresh] = useState<Squeek>(),
    [copied, setCopied] = useState(false);
  const mine = !!address && same(token.owner, address),
    wrong = !!address && chainId !== CHAIN.id;
  const ready = () => {
    if (!address || !wallet) throw Error("Connect your wallet first.");
    if (chainId !== CHAIN.id) throw Error("Switch your wallet to Sepolia.");
    return { account: address as Address, wallet };
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setHash(undefined);
    try {
      await fn();
    } catch (e) {
      setStatus("");
      setStage("idle");
      setError(
        e instanceof Error
          ? (e as { shortMessage?: string }).shortMessage || e.message
          : "Action failed. Refresh and try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const send = async (request: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
    value?: bigint;
    gas?: bigint;
  }) => {
    const { account, wallet } = ready();
    setStatus("Confirm the transaction in your wallet.");
    const h = await wallet.sendTransaction({
      account,
      chain: CHAIN,
      to: request.address,
      data: encodeFunctionData({
        abi: request.abi,
        functionName: request.functionName,
        args: request.args,
      }),
      value: request.value ?? 0n,
      ...(request.gas ? { gas: request.gas } : {}),
    });
    setHash(h);
    setStatus("Waiting for two Sepolia confirmations…");
    const receipt = await client.waitForTransactionReceipt({
      hash: h,
      confirmations: 2,
    });
    if (receipt.status !== "success")
      throw Error(
        "The transaction reverted. No change was made. Refresh before retrying.",
      );
    setStatus("Transaction confirmed.");
    onRefresh();
  };
  const approve = () =>
    run(async () => {
      const { account } = ready();
      await freshOwner(token.id, account);
      const { request } = await client.simulateContract({
        account,
        address: addresses.nft,
        abi: abis.nft,
        functionName: "approve",
        args: [SEAPORT, BigInt(token.id)],
      });
      await send(request);
      setStatus(
        "Seaport is approved for this Squeek. You can now sign a listing.",
      );
    });
  const sign = () =>
    run(async () => {
      const { account, wallet } = ready();
      const amount = decimalToUnits(price);
      if (await approvalNeeded(token.id, account))
        throw Error("Approve this Squeek for Seaport before signing.");
      setStatus("Checking ownership, royalty, and expiry…");
      const components = await makeOrder(
        token.id,
        account,
        amount,
        Number(days),
      );
      setStatus("Review the fixed-price listing in your wallet.");
      const signature = await wallet.signTypedData({
        account,
        domain,
        types: orderTypes,
        primaryType: "OrderComponents",
        message: components,
      });
      const signed: SignedOrder = {
        version: 1,
        chainId: 11155111,
        exchange: SEAPORT,
        components,
        signature,
      };
      await client.simulateContract({
        account,
        address: SEAPORT,
        abi: seaportAbi as Abi,
        functionName: "validate",
        args: [[{ parameters: parameters(signed), signature }]],
      });
      await inspectOrder(signed);
      onOrder(signed);
      setStage("idle");
      setStatus(
        "Listing signed and saved in this browser. Share it with a buyer.",
      );
    });
  const reviewBuy = () =>
    run(async () => {
      ready();
      if (!order) throw Error("Import a signed listing first.");
      setStatus("Checking the seller, signature, royalty, and live position…");
      const { token: f } = await inspectOrder(order);
      if (address && same(f.owner, address))
        throw Error("You already own this Squeek.");
      const { account } = ready();
      await client.simulateContract({
        account,
        address: SEAPORT,
        abi: seaportAbi as Abi,
        functionName: "fulfillOrder",
        args: [
          { parameters: parameters(order), signature: order.signature },
          zeroHash,
        ],
        value: orderPrice(order),
      });
      setFresh(f);
      setStage("confirm-buy");
      setStatus("Simulation passed. Review what travels with the NFT.");
    });
  const buy = () =>
    run(async () => {
      const { account } = ready();
      if (!order) throw Error("No listing selected.");
      await inspectOrder(order);
      const { request } = await client.simulateContract({
        account,
        address: SEAPORT,
        abi: seaportAbi as Abi,
        functionName: "fulfillOrder",
        args: [
          { parameters: parameters(order), signature: order.signature },
          zeroHash,
        ],
        value: orderPrice(order),
      });
      await send(request);
      onOrder(null);
      setStage("idle");
      setStatus(
        "Purchase confirmed. The Squeek and its position are now yours.",
      );
    });
  const cancel = () =>
    run(async () => {
      const { account } = ready();
      if (!order || !same(order.components.offerer, account))
        throw Error("Only the seller can cancel this listing.");
      await freshOwner(token.id, account);
      const { request } = await client.simulateContract({
        account,
        address: SEAPORT,
        abi: seaportAbi as Abi,
        functionName: "cancel",
        args: [[order.components]],
      });
      await send(request);
      onOrder(null);
      setStatus(
        "Listing cancelled on Seaport. Previously shared copies can no longer fill.",
      );
    });
  const download = () => {
    if (!order) return;
    const url = URL.createObjectURL(
      new Blob([stringify(order)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `squeek-${token.id}-order.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const shown = fresh ?? token;
  return (
    <section className="trade-panel" aria-label="Trade this Squeek">
      <h2 className="sr-only">Trade Squeek #{token.id}</h2>
      <div className="trade-top">
        <span className="muted">{order ? "Asking price" : "Availability"}</span>
        <strong>
          {order ? `${decimal(orderPrice(order), 18, 8)} ETH` : "Not listed"}
        </strong>
      </div>
      {!address ? (
        <button className="button primary full" onClick={connect}>
          Connect to {order ? "buy" : "list a Squeek"}
        </button>
      ) : wrong ? (
        <>
          <p className="warning-text">Switch to Sepolia before trading.</p>
          <button className="button primary full" onClick={connect}>
            Switch network
          </button>
        </>
      ) : mine ? (
        <>
          {order ? (
            <>
              <button className="button full" onClick={download}>
                <Download size={17} /> Export signed order
              </button>
              <button
                className="button full"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(orderUrl(order));
                    setCopied(true);
                  } catch {
                    setError(
                      "Clipboard unavailable. Export the order file instead.",
                    );
                  }
                }}
              >
                <Copy size={17} />
                {copied ? "Link copied" : "Copy listing link"}
              </button>
              <button
                className="button danger full"
                disabled={busy}
                onClick={cancel}
              >
                Cancel listing on-chain
              </button>
            </>
          ) : (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setError("");
                  try {
                    if (decimalToUnits(price) <= 0n)
                      throw Error("Enter a price greater than zero.");
                    setStage("review");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <label className="field">
                  Price in Sepolia ETH
                  <input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                    inputMode="decimal"
                    placeholder="0.01"
                    aria-invalid={!!error}
                  />
                </label>
                <label className="field">
                  Listing expires
                  <select
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                  >
                    <option value="1">In 1 day</option>
                    <option value="7">In 7 days</option>
                    <option value="30">In 30 days</option>
                  </select>
                </label>
                <button
                  className={`button ${stage === "review" ? "" : "primary"} full`}
                  disabled={busy}
                  type="submit"
                >
                  Review listing
                </button>
              </form>
              {stage === "review" && (
                <div className="flow-review">
                  <h3>List Squeek #{token.id}</h3>
                  <p>
                    Buyer pays {price} Sepolia ETH. The{" "}
                    {decimal(token.royaltyBps, 2, 2)}% royalty is included. No
                    marketplace fee.
                  </p>
                  <p>
                    First approve this NFT for Seaport, then sign the listing.
                    Sharing the order makes it available to anyone.
                  </p>
                  <button
                    className="button full"
                    disabled={busy}
                    onClick={approve}
                  >
                    1. Approve this Squeek
                  </button>
                  <button
                    className="button primary full"
                    disabled={busy}
                    onClick={sign}
                  >
                    2. Sign listing
                  </button>
                </div>
              )}
            </>
          )}
        </>
      ) : order ? (
        <>
          {stage === "confirm-buy" ? (
            <div className="flow-review">
              <h3>What you will receive</h3>
              <dl className="receive-stats">
                <div>
                  <dt>Level</dt>
                  <dd>{shown.position.level}</dd>
                </div>
                <div>
                  <dt>Active power</dt>
                  <dd>{shown.position.activeWeight.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Unclaimed SQK</dt>
                  <dd title={exactSQK(shown.position.accruedScaled)}>
                    {displaySQK(shown.position.accruedScaled)}
                  </dd>
                </div>
                <div>
                  <dt>Next merge block</dt>
                  <dd>{shown.position.nextMergeBlock.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Pending power / round</dt>
                  <dd>
                    {shown.position.pendingWeight.toLocaleString()} /{" "}
                    {shown.position.pendingRound.toLocaleString()}
                  </dd>
                </div>
              </dl>
              <p className="warning-text">
                These values can change before execution. Seaport transfers the
                position at execution and does not lock rewards or level. The
                seller can still claim or merge.
              </p>
              <button
                className="button primary full"
                disabled={busy}
                onClick={buy}
              >
                Confirm purchase · {decimal(orderPrice(order), 18, 8)} ETH
              </button>
              <button
                className="button full"
                disabled={busy}
                onClick={() => setStage("idle")}
              >
                Back
              </button>
            </div>
          ) : (
            <button
              className="button primary full"
              disabled={busy}
              onClick={reviewBuy}
            >
              Review purchase
            </button>
          )}
        </>
      ) : (
        <p className="muted">
          This Squeek has no signed listing in your browser. Import an order
          from its owner to buy.
        </p>
      )}
      <p role="status" className="status-text">
        {status && (
          <>
            <ShieldCheck size={18} />
            {status}
          </>
        )}
      </p>
      {busy && (
        <p className="fine muted">
          Keep this page open. Your wallet signs and submits.
        </p>
      )}
      {hash && (
        <a
          className="text-link"
          href={`${EXPLORER}/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
        >
          View transaction <ExternalLink size={14} />
        </a>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <p className="fine muted">
        Sepolia testnet only. Test assets have no monetary value. You pay
        network gas for on-chain actions.
      </p>
    </section>
  );
}
