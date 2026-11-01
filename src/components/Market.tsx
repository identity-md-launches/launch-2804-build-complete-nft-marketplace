"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection } from "wagmi";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  Grid2X2,
  Heart,
  Info,
  List,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  Wallet,
  Zap,
  Clock3,
  Coins,
  X,
} from "lucide-react";
import { ConnectButton, useWalletUI } from "./Providers";
import { Modal } from "./Modal";
import { TradePanel } from "./TradePanel";
import { EXPLORER, addresses, same, short, client } from "@/lib/contracts";
import {
  loadSnapshot,
  loadPortfolio,
  loadActivity,
  type Activity,
} from "@/lib/reads";
import {
  cooldown,
  decimal,
  displaySQK,
  errorMessage,
  exactSQK,
  filterTokens,
  initialFilters,
  reviveSnapshot,
  type Squeek,
  type Snapshot,
  type Filters,
} from "@/lib/logic";
import {
  parseOrder,
  inspectOrder,
  orderToken,
  orderHash,
  orderPrice,
  savedOrders,
  storeOrders,
  OrderApprovalError,
  type SignedOrder,
} from "@/lib/orders";
type View = "explore" | "portfolio" | "activity";
function Empty({
  title,
  children,
  action,
  onAction,
}: {
  title: string;
  children: React.ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <img src="./squeek-mark.svg" width="64" height="64" alt="" />
      <h3>{title}</h3>
      <p className="muted">{children}</p>
      {action && (
        <button className="button" onClick={onAction}>
          {action}
          <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}
function TokenImage({
  token,
  large = false,
}: {
  token: Squeek;
  large?: boolean;
}) {
  return (
    <div className={`token-art ${large ? "large-art" : ""}`}>
      {token.image ? (
        <img
          src={token.image}
          alt={`On-chain DotGrid image for Squeek #${token.id}`}
          loading={large ? "eager" : "lazy"}
          decoding="async"
        />
      ) : (
        <span>Image unavailable</span>
      )}
    </div>
  );
}
function TokenCard({
  token,
  order,
  height,
  view,
}: {
  token: Squeek;
  order?: SignedOrder;
  height: bigint;
  view: string;
}) {
  const p = token.position,
    c = cooldown(p, height);
  return (
    <article className={`token-card ${view === "list" ? "token-row" : ""}`}>
      <a
        className="art-link"
        href={`#squeek/${token.id}`}
        aria-label={`View Squeek #${token.id}, Level ${token.position.level}`}
      >
        <TokenImage token={token} />
        <span className="level-tag">Level {p.level}</span>
      </a>
      <div className="card-content">
        <div className="card-heading">
          <h3>
            <a href={`#squeek/${token.id}`}>Squeek #{token.id}</a>
          </h3>
          <ShieldCheck size={16} aria-label="From the Squeeks contract" />
        </div>
        <dl className="card-stats">
          <div>
            <dt>
              <Zap size={14} /> Active power
            </dt>
            <dd>{p.activeWeight.toLocaleString()}</dd>
          </div>
          <div>
            <dt>
              <Coins size={14} /> Unclaimed SQK
            </dt>
            <dd title={exactSQK(p.accruedScaled)}>
              {displaySQK(p.accruedScaled)}
            </dd>
          </div>
        </dl>
        <div className="card-status">
          <span className={c.ready ? "status-ready" : "muted"}>
            {c.ready ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}{" "}
            {c.label}
          </span>
          <span
            className="muted"
            title={`Next merge at Squeek block ${p.nextMergeBlock}`}
          >
            #{p.nextMergeBlock}
          </span>
        </div>
        <details className="card-extra">
          <summary>
            Position & ownership <ChevronDown size={13} />
          </summary>
          <dl>
            <div>
              <dt>Owner</dt>
              <dd>
                <a
                  href={`${EXPLORER}/address/${token.owner}`}
                  target="_blank"
                  rel="noreferrer"
                  title={token.owner}
                >
                  {short(token.owner)}
                </a>
              </dd>
            </div>
            <div>
              <dt>Pending power</dt>
              <dd>{p.pendingWeight.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Pending round</dt>
              <dd>{p.pendingRound || "None"}</dd>
            </div>
            <div>
              <dt>Royalty</dt>
              <dd>{decimal(token.royaltyBps, 2, 2)}%</dd>
            </div>
          </dl>
        </details>
        <a href={`#squeek/${token.id}`} className="card-footer">
          <span>
            {order ? (
              <>
                <strong>{decimal(orderPrice(order), 18, 8)} ETH</strong>
                <span className="fine muted">Signed listing</span>
              </>
            ) : (
              <span className="muted">Not listed</span>
            )}
          </span>
          <span className="card-arrow">
            <ArrowUpRight size={18} />
          </span>
        </a>
      </div>
    </article>
  );
}
function FilterFields({
  filters,
  setFilters,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
}) {
  const update = (key: keyof Filters, value: string) =>
    setFilters({ ...filters, [key]: value });
  return (
    <>
      <div className="filter-title">
        <h3>Filters</h3>
        <button
          className="text-button"
          onClick={() => setFilters(initialFilters)}
        >
          Reset
        </button>
      </div>
      <label className="field">
        Level
        <select
          value={filters.level}
          onChange={(e) => update("level", e.target.value)}
        >
          <option value="all">All levels</option>
          {Array.from({ length: 10 }, (_, i) => (
            <option key={i} value={i + 1}>
              Level {i + 1}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Minimum active power
        <input
          inputMode="numeric"
          value={filters.minPower}
          onChange={(e) => {
            if (/^\d*$/.test(e.target.value))
              update("minPower", e.target.value);
          }}
          placeholder="Any power"
        />
      </label>
      <label className="field">
        Minimum unclaimed SQK
        <input
          inputMode="decimal"
          value={filters.minRewards}
          onChange={(e) => {
            if (/^\d*(\.\d{0,18})?$/.test(e.target.value))
              update("minRewards", e.target.value);
          }}
          placeholder="Any amount"
        />
      </label>
      <label className="field">
        Merge status
        <select
          value={filters.cooldown}
          onChange={(e) => update("cooldown", e.target.value)}
        >
          <option value="all">Any status</option>
          <option value="ready">Merge ready</option>
          <option value="waiting">Not ready</option>
        </select>
      </label>
      <label className="field">
        Maximum price in ETH
        <input
          inputMode="decimal"
          value={filters.maxPrice}
          onChange={(e) => {
            if (/^\d*(\.\d{0,18})?$/.test(e.target.value))
              update("maxPrice", e.target.value);
          }}
          placeholder="Any price"
        />
      </label>
      <div className="filter-note">
        <Info size={17} />
        <p>Power, rewards, and cooldown travel with each Squeek.</p>
      </div>
    </>
  );
}
export default function Market() {
  const { address } = useConnection();
  const connect = useWalletUI();
  const [view, setView] = useState<View>("explore"),
    [layout, setLayout] = useState("grid"),
    [filters, setFilters] = useState<Filters>(initialFilters),
    [mobileFilters, setMobileFilters] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot>(),
    [portfolio, setPortfolio] = useState<Snapshot>(),
    [loading, setLoading] = useState(true),
    [portfolioBusy, setPortfolioBusy] = useState(false),
    [error, setError] = useState(""),
    [limit, setLimit] = useState(24);
  const [selected, setSelected] = useState<Squeek>(),
    [selectedId, setSelectedId] = useState(""),
    [detailBusy, setDetailBusy] = useState(false),
    [detailError, setDetailError] = useState(""),
    [detailSnapshot, setDetailSnapshot] = useState<Snapshot>();
  const [orders, setOrders] = useState<SignedOrder[]>([]),
    [localOrders, setLocalOrders] = useState<SignedOrder[]>([]),
    [orderIssues, setOrderIssues] = useState<Record<string, string>>({}),
    [listedTokens, setListedTokens] = useState<Record<string, Squeek>>({}),
    [orderWarnings, setOrderWarnings] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false),
    [importText, setImportText] = useState(""),
    [importBusy, setImportBusy] = useState(false),
    [importError, setImportError] = useState("");
  const [activity, setActivity] = useState<Activity[]>([]),
    [activityRange, setActivityRange] = useState(""),
    [activityError, setActivityError] = useState(""),
    [activityBusy, setActivityBusy] = useState(false),
    [copied, setCopied] = useState(false);
  const snapshotRef = useRef<Snapshot | undefined>(undefined);
  const request = useRef(0),
    selectionRequest = useRef(0),
    portfolioRequest = useRef(0),
    orderRequest = useRef(0);
  const refresh = useCallback(async (count = 24) => {
    const req = ++request.current;
    setLoading(true);
    setError("");
    try {
      const data = await loadSnapshot({ limit: count });
      if (req !== request.current) return;
      setSnapshot(data);
      snapshotRef.current = data;
    } catch (e) {
      if (req === request.current) setError(errorMessage(e));
    } finally {
      if (req === request.current) setLoading(false);
    }
  }, []);
  const loadSelected = useCallback(async (id: string) => {
    const req = ++selectionRequest.current;
    setDetailBusy(true);
    setDetailError("");
    setDetailSnapshot(undefined);
    const cached = snapshotRef.current?.tokens.find((t) => t.id === id);
    setSelected(cached);
    try {
      const snap = await loadSnapshot({ id: BigInt(id) });
      if (req !== selectionRequest.current) return;
      if (!snap.tokens[0]) throw Error(`Squeek #${id} is burned or unminted.`);
      setSelected(snap.tokens[0]);
      setDetailSnapshot(snap);
    } catch (e) {
      if (req === selectionRequest.current) setDetailError(errorMessage(e));
    } finally {
      if (req === selectionRequest.current) setDetailBusy(false);
    }
  }, []);
  const addOrder = useCallback((o: SignedOrder | null, id?: string) => {
    // A refresh started before a sign/cancel must not restore stale orders.
    orderRequest.current++;
    const update = (prev: SignedOrder[]) => {
      const next = prev.filter(
        (p) => orderToken(p) !== (o ? orderToken(o) : id),
      );
      if (o) next.push(o);
      return next;
    };
    setOrders(update);
    // Persist the complete saved set, including temporarily unfillable orders.
    setLocalOrders((prev) => {
      const next = update(prev);
      try {
        storeOrders(next);
      } catch {
        setOrderWarnings([
          "Browser storage is unavailable. Export your order before leaving.",
        ]);
      }
      return next;
    });
  }, []);
  const validateSaved = useCallback(async () => {
    const req = ++orderRequest.current;
    const saved = savedOrders();
    setLocalOrders(saved);
    const valid: SignedOrder[] = [],
      read: Record<string, Squeek> = {},
      issues: Record<string, string> = {},
      warnings: string[] = [];
    for (const o of saved) {
      try {
        const { token } = await inspectOrder(o);
        valid.push(o);
        read[token.id] = token;
      } catch (e) {
        issues[orderHash(o)] =
          e instanceof OrderApprovalError
            ? "Approval revoked; order not cancelled"
            : "Saved order; availability unverified";
        warnings.push(`Squeek #${orderToken(o)}: ${errorMessage(e)}`);
      }
    }
    if (req !== orderRequest.current) return;
    setOrders(valid);
    setOrderIssues(issues);
    setListedTokens(read);
    setOrderWarnings(warnings);
  }, []);
  useEffect(() => {
    let alive = true;
    fetch("./snapshot.json")
      .then((r) => {
        if (!r.ok) throw Error("Saved snapshot unavailable");
        return r.json();
      })
      .then((raw) => {
        if (alive && !snapshotRef.current) {
          const data = reviveSnapshot(raw);
          setSnapshot(data);
          snapshotRef.current = data;
          const match = location.hash.match(/^#squeek\/(\d{1,20})$/);
          if (match)
            setSelected(
              (previous) =>
                previous ?? data.tokens.find((t) => t.id === match[1]),
            );
        }
      })
      .catch(() => {});
    void refresh();
    void validateSaved();
    const route = () => {
      const hash = location.hash;
      if (hash.startsWith("#order=")) {
        try {
          setImportText(atob(hash.slice(7)));
          setImportOpen(true);
          setImportError("");
        } catch {
          setImportError(
            "This listing link is damaged. Ask the seller to export the order file.",
          );
          setImportOpen(true);
        }
        setSelectedId("");
        return;
      }
      const m = hash.match(/^#squeek\/(\d{1,20})$/);
      if (m) {
        setSelectedId(m[1]);
        setView("explore");
        void loadSelected(m[1]);
        window.scrollTo(0, 0);
      } else {
        selectionRequest.current++;
        setSelectedId("");
        setSelected(undefined);
        setDetailSnapshot(undefined);
        setView(
          hash === "#portfolio"
            ? "portfolio"
            : hash === "#activity"
              ? "activity"
              : "explore",
        );
      }
    };
    route();
    addEventListener("hashchange", route);
    return () => {
      alive = false;
      removeEventListener("hashchange", route);
    };
  }, [refresh, loadSelected, validateSaved]);
  useEffect(() => {
    if (view !== "portfolio") return;
    const req = ++portfolioRequest.current;
    setPortfolio(undefined);
    if (!address) return;
    setPortfolioBusy(true);
    setError("");
    loadPortfolio(address, limit)
      .then((s) => {
        if (req === portfolioRequest.current) setPortfolio(s);
      })
      .catch((e) => {
        if (req === portfolioRequest.current) setError(errorMessage(e));
      })
      .finally(() => {
        if (req === portfolioRequest.current) setPortfolioBusy(false);
      });
    return () => {
      portfolioRequest.current++;
    };
  }, [view, address, limit]);
  const refreshActivity = useCallback(async () => {
    setActivityBusy(true);
    setActivityError("");
    try {
      const data = await loadActivity();
      setActivity(data.items);
      setActivityRange(`${data.from}–${data.through}`);
    } catch (e) {
      setActivityError(errorMessage(e));
    } finally {
      setActivityBusy(false);
    }
  }, []);
  useEffect(() => {
    if (view === "activity") void refreshActivity();
  }, [view, refreshActivity]);
  const prices = useMemo(
    () => new Map(orders.map((o) => [orderToken(o), orderPrice(o)])),
    [orders],
  );
  const current = view === "portfolio" ? portfolio : snapshot;
  const height = BigInt(current?.height || "0");
  const tokens = filters.listedOnly
    ? Object.values(listedTokens).filter(
        (t) => view !== "portfolio" || (!!address && same(t.owner, address)),
      )
    : (current?.tokens ?? []);
  const results = useMemo(() => {
    try {
      return filterTokens(tokens, filters, height, prices);
    } catch {
      return [];
    }
  }, [tokens, filters, height, prices]);
  const importOrder = async () => {
    setImportBusy(true);
    setImportError("");
    try {
      const order = parseOrder(importText);
      const { token } = await inspectOrder(order);
      setListedTokens((prev) => ({ ...prev, [token.id]: token }));
      addOrder(order);
      setImportOpen(false);
      location.hash = `squeek/${token.id}`;
    } catch (e) {
      setImportError(errorMessage(e));
    } finally {
      setImportBusy(false);
    }
  };
  const activeHashes = new Set(orders.map(orderHash));
  const inactiveOrders = localOrders.filter(
    (o) =>
      address && same(o.components.offerer, address) && !activeHashes.has(orderHash(o)),
  );
  const selectedOrder = orders.find((o) => orderToken(o) === selectedId)
    ?? inactiveOrders.find((o) => orderToken(o) === selectedId);
  const selectedOrderIssue = selectedOrder && !activeHashes.has(orderHash(selectedOrder))
    ? orderIssues[orderHash(selectedOrder)] ?? "Saved order; availability unverified"
    : undefined;
  const navigate = (next: View) => {
    setFilters(initialFilters);
    location.hash = next === "explore" ? "explore" : next;
  };
  const refreshAll = () => {
    void refresh(limit);
    void validateSaved();
    if (selectedId) void loadSelected(selectedId);
    if (view === "portfolio" && address) {
      setPortfolioBusy(true);
      loadPortfolio(address, limit)
        .then(setPortfolio)
        .catch((e) => setError(errorMessage(e)))
        .finally(() => setPortfolioBusy(false));
    }
  };
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          const main = document.getElementById("main-content");
          main?.focus({ preventScroll: true });
          main?.scrollIntoView();
        }}
      >
        Skip to content
      </a>
      <aside className="testnet-strip" aria-label="Network notice">
        <span className="network-dot" /> Sepolia testnet{" "}
        <span className="testnet-explanation">
          · Test assets have no monetary value
        </span>
        <a
          href="https://docs.squeekchain.com/developers/"
          target="_blank"
          rel="noreferrer"
        >
          Contract docs <ArrowUpRight size={13} />
        </a>
      </aside>
      <header className="site-header">
        <a className="brand" href="#explore" aria-label="Squeek Market home">
          <img src="./squeek-mark.svg" width="38" height="38" alt="" />
          <span>
            squeek<span className="brand-suffix"> market</span>
          </span>
        </a>
        <nav className="desktop-nav" aria-label="Main navigation">
          <a
            href="#explore"
            aria-current={view === "explore" ? "page" : undefined}
          >
            Explore
          </a>
          <a
            href="#portfolio"
            aria-current={view === "portfolio" ? "page" : undefined}
          >
            My Squeeks
          </a>
          <a
            href="#activity"
            aria-current={view === "activity" ? "page" : undefined}
          >
            Activity
          </a>
        </nav>
        <ConnectButton />
      </header>
      <main id="main-content" className="page-container" tabIndex={-1}>
        {selectedId ? (
          <>
            <button
              className="back-link"
              onClick={() => {
                location.hash = "explore";
              }}
            >
              <ArrowLeft size={16} /> All Squeeks
            </button>
            {detailBusy && (
              <p className="read-status" role="status">
                <RefreshCw size={14} /> Verifying contracts and reading Squeek #
                {selectedId}…
              </p>
            )}
            {detailError && (
              <div className="notice error" role="alert">
                <Info size={18} />
                <div>
                  <strong>Could not refresh this Squeek</strong>
                  <p>{detailError}</p>
                  <button
                    className="text-button"
                    onClick={() => loadSelected(selectedId)}
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}
            {selected ? (
              <>
                <div className="detail-layout">
                  <TokenImage token={selected} large />
                  <div className="detail-info">
                    <div className="collection-label">
                      <img
                        src="./squeek-mark.svg"
                        width="22"
                        height="22"
                        alt=""
                      />{" "}
                      Squeeks <ShieldCheck size={16} />
                    </div>
                    <h1>Squeek #{selected.id}</h1>
                    <p className="detail-description">
                      A little character with an on-chain life.
                    </p>
                    <div className="detail-badges">
                      <span className="badge">
                        Level {selected.position.level}
                      </span>
                      <span
                        className={`badge ${cooldown(selected.position, BigInt(detailSnapshot?.height || snapshot?.height || "0")).ready ? "green" : ""}`}
                      >
                        {
                          cooldown(
                            selected.position,
                            BigInt(
                              detailSnapshot?.height || snapshot?.height || "0",
                            ),
                          ).label
                        }
                      </span>
                    </div>
                    <p className="owner-label">
                      Owned by{" "}
                      <a
                        href={`${EXPLORER}/address/${selected.owner}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {address && same(address, selected.owner)
                          ? "you"
                          : short(selected.owner)}{" "}
                        <ExternalLink size={13} />
                      </a>
                      <button
                        className="icon-button small"
                        aria-label="Copy owner address"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(selected.owner);
                            setCopied(true);
                          } catch {
                            setDetailError(
                              "Clipboard unavailable. The full owner address is shown below.",
                            );
                          }
                        }}
                      >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </p>
                    <dl className="detail-stats">
                      <div>
                        <dt>
                          <Zap size={17} /> Active power
                        </dt>
                        <dd>
                          {selected.position.activeWeight.toLocaleString()}
                        </dd>
                      </div>
                      <div>
                        <dt>
                          <Coins size={17} /> Unclaimed SQK
                        </dt>
                        <dd>{displaySQK(selected.position.accruedScaled)}</dd>
                      </div>
                    </dl>
                    <TradePanel
                      key={`${selectedId}-${address ?? ""}`}
                      token={selected}
                      order={selectedOrder}
                      inactiveReason={selectedOrderIssue}
                      onOrder={(o) => {
                        addOrder(o, selectedId);
                        if (o)
                          setListedTokens((prev) => ({
                            ...prev,
                            [selected.id]: selected,
                          }));
                        else
                          setListedTokens((prev) => {
                            const next = { ...prev };
                            delete next[selectedId];
                            return next;
                          });
                      }}
                      onRefresh={refreshAll}
                    />
                  </div>
                </div>
                <div className="detail-bottom">
                  <section>
                    <h2>The whole position comes along</h2>
                    <p className="muted">
                      The NFT carries its level, rewards, pending power, and
                      merge cooldown to its next owner. These are chain reads,
                      not a promised yield.
                    </p>
                    <dl className="data-table">
                      <div>
                        <dt>Token ID</dt>
                        <dd>{selected.id}</dd>
                      </div>
                      <div>
                        <dt>Level</dt>
                        <dd>{selected.position.level}</dd>
                      </div>
                      <div>
                        <dt>Active weight</dt>
                        <dd>
                          {selected.position.activeWeight.toLocaleString()}
                        </dd>
                      </div>
                      <div>
                        <dt>Pending weight</dt>
                        <dd>
                          {selected.position.pendingWeight.toLocaleString()}
                        </dd>
                      </div>
                      <div>
                        <dt>Pending round</dt>
                        <dd>{selected.position.pendingRound || "None"}</dd>
                      </div>
                      <div>
                        <dt>Next merge Squeek block</dt>
                        <dd>
                          {selected.position.nextMergeBlock.toLocaleString()}
                        </dd>
                      </div>
                      <div>
                        <dt>Completed Squeek blocks</dt>
                        <dd>
                          {BigInt(
                            detailSnapshot?.height || snapshot?.height || "0",
                          ).toLocaleString()}
                        </dd>
                      </div>
                      <div>
                        <dt>Unclaimed SQK (18 decimals)</dt>
                        <dd className="break-value">
                          {exactSQK(selected.position.accruedScaled)}
                        </dd>
                      </div>
                      <div>
                        <dt>Scaled fractional remainder</dt>
                        <dd className="break-value">
                          {(
                            selected.position.accruedScaled %
                            (1n << 128n)
                          ).toString()}{" "}
                          / 2¹²⁸ base unit
                        </dd>
                      </div>
                      <div>
                        <dt>ERC-2981 royalty</dt>
                        <dd>{decimal(selected.royaltyBps, 2, 2)}%</dd>
                      </div>
                      <div>
                        <dt>Royalty receiver</dt>
                        <dd className="break-value">
                          <a
                            href={`${EXPLORER}/address/${selected.royaltyReceiver}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {selected.royaltyReceiver}
                          </a>
                        </dd>
                      </div>
                      <div>
                        <dt>Owner</dt>
                        <dd className="break-value">{selected.owner}</dd>
                      </div>
                    </dl>
                  </section>
                  <section>
                    <h2>On-chain details</h2>
                    <p className="muted">
                      The DotGrid image and metadata come from the NFT’s
                      tokenURI. Images render in an isolated image element.
                    </p>
                    <dl className="data-table">
                      <div>
                        <dt>Network</dt>
                        <dd>Sepolia · 11155111</dd>
                      </div>
                      <div>
                        <dt>Collection</dt>
                        <dd className="break-value">
                          <a
                            href={`${EXPLORER}/address/${addresses.nft}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {addresses.nft}
                          </a>
                        </dd>
                      </div>
                      <div>
                        <dt>Read at Ethereum block</dt>
                        <dd>
                          {detailSnapshot?.block ||
                            snapshot?.block ||
                            "Saved snapshot"}
                        </dd>
                      </div>
                      <div>
                        <dt>Read status</dt>
                        <dd>
                          {detailBusy
                            ? "Refreshing"
                            : detailError
                              ? "Saved values"
                              : "Verified graph"}
                        </dd>
                      </div>
                    </dl>
                    {selected.uri && (
                      <a
                        className="button"
                        href={selected.uri}
                        download={`squeek-${selected.id}-metadata.json`}
                      >
                        Download tokenURI metadata <ArrowUpRight size={16} />
                      </a>
                    )}
                    {selected.attributes.length > 0 && (
                      <>
                        <h3 className="section-subtitle">Metadata traits</h3>
                        <dl className="data-table">
                          {selected.attributes.map((a, i) => (
                            <div key={i}>
                              <dt>{a.trait_type}</dt>
                              <dd>{a.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </>
                    )}
                    <p className="fine muted">
                      Cooldown counts completed Squeek blocks, not Ethereum
                      blocks or minutes. Pending weight replaces active weight
                      from its pending round.
                    </p>
                    <button
                      className="button"
                      disabled={detailBusy}
                      onClick={() => loadSelected(selectedId)}
                    >
                      <RefreshCw size={16} /> Refresh live position
                    </button>
                  </section>
                </div>
              </>
            ) : !detailBusy ? (
              <Empty
                title="Squeek unavailable"
                action="Back to collection"
                onAction={() => {
                  location.hash = "explore";
                }}
              >
                Check the token ID or retry the live read.
              </Empty>
            ) : (
              <div className="detail-skeleton" aria-label="Loading Squeek" />
            )}
          </>
        ) : (
          <>
            <section className="collection-intro">
              <div className="intro-copy">
                <div className="collection-identity">
                  <span className="collection-avatar">
                    <img
                      src="./squeek-mark.svg"
                      width="45"
                      height="45"
                      alt=""
                    />
                  </span>
                  <span>
                    Squeekchain’s original collection <ShieldCheck size={16} />
                  </span>
                </div>
                <h1>Meet your next Squeek.</h1>
                <p>
                  On-chain companions. Their power and rewards come with them.
                </p>
                <div className="intro-actions">
                  <button
                    className="button"
                    onClick={() => {
                      navigate("portfolio");
                      if (!address) connect();
                    }}
                  >
                    List a Squeek <ArrowUpRight size={16} />
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setImportOpen(true)}
                  >
                    <Upload size={15} /> Import listing
                  </button>
                </div>
              </div>
              <div className="intro-art" aria-hidden="true">
                {snapshot?.tokens.slice(0, 3).map((t, i) => (
                  <div key={t.id} className={`mini-art mini-${i}`}>
                    <img src={t.image} alt="" />
                  </div>
                ))}
              </div>
            </section>
            <div className="collection-facts">
              <div>
                <span className="muted">
                  {snapshot?.source === "live" ? "Live supply" : "Saved supply"}
                </span>
                <strong>
                  {snapshot
                    ? BigInt(snapshot.totalSupply).toLocaleString()
                    : "Reading…"}
                </strong>
              </div>
              <div>
                <span className="muted">Level range</span>
                <strong>1–10</strong>
              </div>
              <div>
                <span className="muted">Creator royalty</span>
                <strong>
                  {snapshot?.tokens[0]
                    ? `${decimal(snapshot.tokens[0].royaltyBps, 2, 2)}%`
                    : "Reading…"}
                </strong>
              </div>
              <div>
                <span className="muted">Artwork</span>
                <strong>100% on-chain</strong>
              </div>
            </div>
            <div className="market-nav">
              <nav aria-label="Collection views">
                <button
                  aria-current={view === "explore" ? "page" : undefined}
                  onClick={() => navigate("explore")}
                >
                  Explore
                </button>
                <button
                  aria-current={view === "portfolio" ? "page" : undefined}
                  onClick={() => navigate("portfolio")}
                >
                  My Squeeks
                </button>
                <button
                  aria-current={view === "activity" ? "page" : undefined}
                  onClick={() => navigate("activity")}
                >
                  Activity
                </button>
              </nav>
              <span className="reads-indicator">
                <span
                  className={`network-dot ${snapshot?.source === "live" ? "live" : ""}`}
                />
                {loading
                  ? "Verifying live reads"
                  : snapshot?.source === "live"
                    ? "Verified on-chain reads"
                    : "Saved snapshot"}
              </span>
            </div>
            {view === "activity" ? (
              <section className="activity-page">
                <div className="section-heading">
                  <div>
                    <h2>Recent activity</h2>
                    <p className="muted">
                      Confirmed sales and NFT transfers. A transfer alone is not
                      a sale.
                    </p>
                  </div>
                  <button
                    className="button"
                    disabled={activityBusy}
                    onClick={refreshActivity}
                  >
                    <RefreshCw size={16} />
                    {activityBusy ? "Reading…" : "Refresh"}
                  </button>
                </div>
                {activityError ? (
                  <div className="notice error" role="alert">
                    <p>{activityError}</p>
                    <button className="button" onClick={refreshActivity}>
                      Retry activity
                    </button>
                  </div>
                ) : activityBusy ? (
                  <p role="status" className="loading-message">
                    Reading the last 10,000 confirmed Ethereum blocks…
                  </p>
                ) : activity.length ? (
                  <>
                    <p className="fine muted">
                      Ethereum blocks {activityRange}. Rebuilt from canonical
                      logs on every refresh.
                    </p>
                    <div className="activity-list">
                      {activity.map((a) => (
                        <div className="activity-row" key={a.id}>
                          <span className="activity-symbol">
                            <ArrowUpRight size={20} />
                          </span>
                          <div>
                            <a href={`#squeek/${a.tokenId}`}>
                              Squeek #{a.tokenId}
                            </a>
                            <span className="fine muted">
                              {a.type}
                              {a.price
                                ? ` · ${decimal(BigInt(a.price), 18, 8)} ETH`
                                : ""}{" "}
                              · block {a.block}
                            </span>
                          </div>
                          <div className="activity-address">
                            <span className="fine muted">From → to</span>
                            <span title={`${a.from} → ${a.to}`}>
                              {short(a.from)} → {short(a.to)}
                            </span>
                          </div>
                          <a
                            className="icon-button"
                            href={`${EXPLORER}/tx/${a.hash}`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`View ${a.type.toLowerCase()} transaction for Squeek ${a.tokenId}`}
                          >
                            <ExternalLink size={17} />
                          </a>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <Empty
                    title="No transfers in this window"
                    action="Refresh activity"
                    onAction={refreshActivity}
                  >
                    The feed covers the last 10,000 confirmed Ethereum blocks.
                  </Empty>
                )}
              </section>
            ) : (
              <>
                {view === "portfolio" && !address ? (
                  <Empty
                    title="Your little corner of Squeekchain"
                    action="Connect wallet"
                    onAction={connect}
                  >
                    Connect to see the Squeeks you own and list one for sale.
                  </Empty>
                ) : (
                  <>
                    <h2 className="sr-only">
                      {view === "portfolio"
                        ? "Owned and listed Squeeks"
                        : "Explore the collection"}
                    </h2>
                    <div className="browse-toolbar">
                      <div className="search-field">
                        <Search size={18} />
                        <input
                          aria-label="Search by token ID"
                          type="search"
                          inputMode="numeric"
                          placeholder="Search by token ID"
                          value={filters.query}
                          onChange={(e) => {
                            if (/^#?\d*$/.test(e.target.value))
                              setFilters({ ...filters, query: e.target.value });
                          }}
                        />
                        {filters.query && (
                          <button
                            className="icon-button small"
                            onClick={() =>
                              setFilters({ ...filters, query: "" })
                            }
                            aria-label="Clear search"
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                      <button
                        className="button mobile-filter-button"
                        aria-expanded={mobileFilters}
                        onClick={() => setMobileFilters(!mobileFilters)}
                      >
                        <SlidersHorizontal size={17} /> Filters
                      </button>
                      <div className="sort-control">
                        <label htmlFor="sort">Sort by</label>
                        <select
                          id="sort"
                          value={filters.sort}
                          onChange={(e) =>
                            setFilters({ ...filters, sort: e.target.value })
                          }
                        >
                          <option value="id">Token ID</option>
                          <option value="price">Price: low to high</option>
                          <option value="power">Highest active power</option>
                          <option value="rewards">Most unclaimed SQK</option>
                          <option value="level">Highest level</option>
                        </select>
                      </div>
                      <div className="view-toggle" aria-label="Display layout">
                        <button
                          aria-label="Grid view"
                          aria-pressed={layout === "grid"}
                          onClick={() => setLayout("grid")}
                        >
                          <Grid2X2 size={18} />
                        </button>
                        <button
                          aria-label="List view"
                          aria-pressed={layout === "list"}
                          onClick={() => setLayout("list")}
                        >
                          <List size={19} />
                        </button>
                      </div>
                    </div>
                    {mobileFilters && (
                      <div className="mobile-filters">
                        <FilterFields
                          filters={filters}
                          setFilters={setFilters}
                        />
                      </div>
                    )}
                    <div className="browse-layout">
                      <aside
                        className="filter-sidebar"
                        aria-label="Filter Squeeks"
                      >
                        <FilterFields
                          filters={filters}
                          setFilters={setFilters}
                        />
                      </aside>
                      <section
                        className="results-section"
                        aria-label={
                          view === "portfolio"
                            ? "Your Squeeks"
                            : "Browse Squeeks"
                        }
                      >
                        <div className="result-header">
                          <div className="availability-tabs">
                            <button
                              aria-pressed={!filters.listedOnly}
                              onClick={() =>
                                setFilters({ ...filters, listedOnly: false })
                              }
                            >
                              {view === "portfolio" ? "Owned" : "All Squeeks"}
                            </button>
                            <button
                              aria-pressed={filters.listedOnly}
                              onClick={() =>
                                setFilters({ ...filters, listedOnly: true })
                              }
                            >
                              Listed{" "}
                              <span>
                                {view === "portfolio"
                                  ? orders.filter(
                                      (o) =>
                                        address &&
                                        same(o.components.offerer, address),
                                    ).length
                                  : orders.length}
                              </span>
                            </button>
                          </div>
                          <button
                            className="icon-button"
                            disabled={loading || portfolioBusy}
                            aria-label="Refresh Squeeks"
                            onClick={refreshAll}
                          >
                            <RefreshCw size={16} />
                          </button>
                        </div>
                        <p className="result-count" role="status">
                          {portfolioBusy
                            ? "Checking Squeek ownership on-chain…"
                            : !current && !filters.listedOnly
                              ? loading
                                ? "Reading Squeeks…"
                                : "Squeeks unavailable"
                              : `${results.length} Squeeks${filters.listedOnly ? " with signed orders in this browser" : current?.partial ? " in this loaded page" : ""}`}
                        </p>
                        {error && (
                          <div className="notice error" role="alert">
                            <Info size={18} />
                            <div>
                              <strong>Live reads unavailable</strong>
                              <p>{error}</p>
                              <button
                                className="text-button"
                                onClick={refreshAll}
                              >
                                Retry live reads
                              </button>
                            </div>
                          </div>
                        )}
                        {current?.source === "saved" && (
                          <p className="snapshot-note">
                            <Info size={14} /> Saved{" "}
                            {new Date(current.timestamp).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              },
                            )}{" "}
                            · block {current.block}.{" "}
                            {loading
                              ? "Refreshing…"
                              : "Refresh before trading."}
                          </p>
                        )}
                        {filters.listedOnly && (
                          <p className="listing-note">
                            Signed orders are saved in this browser. Import a
                            seller’s link or file to add a listing. There is no
                            shared order book.
                          </p>
                        )}
                        {filters.listedOnly && inactiveOrders.length > 0 && (
                          <section className="inactive-orders" aria-labelledby="inactive-orders-heading">
                            <h3 id="inactive-orders-heading">Your inactive orders</h3>
                            <p className="fine muted">
                              These saved orders are excluded from active listings.
                              Revoking approval does not cancel an order. Cancel it
                              on-chain before approving Seaport again.
                            </p>
                            <dl className="data-table">
                              {inactiveOrders.map((o) => (
                                <div key={orderHash(o)}>
                                  <dt>
                                    <a className="text-link" href={`#squeek/${orderToken(o)}`}>
                                      Manage Squeek #{orderToken(o)} <ArrowRight size={14} />
                                    </a>
                                  </dt>
                                  <dd className="warning-text">
                                    {orderIssues[orderHash(o)] ?? "Saved order; availability unverified"}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </section>
                        )}
                        {orderWarnings.length > 0 && filters.listedOnly && (
                          <details className="order-warnings">
                            <summary>
                              {orderWarnings.length} orders could not be
                              verified
                            </summary>
                            {orderWarnings.map((w, i) => (
                              <p key={i}>{w}</p>
                            ))}
                          </details>
                        )}
                        {portfolioBusy ? (
                          <div className="loading-message" role="status">
                            Checking live ownership. This can take a moment for
                            large portfolios.
                          </div>
                        ) : results.length ? (
                          <div
                            className={`token-grid ${layout === "list" ? "list-layout" : ""}`}
                          >
                            {results.map((t) => (
                              <TokenCard
                                key={t.id}
                                token={t}
                                order={orders.find(
                                  (o) => orderToken(o) === t.id,
                                )}
                                height={height}
                                view={layout}
                              />
                            ))}
                          </div>
                        ) : loading && !snapshot ? (
                          <div
                            className="skeleton-grid"
                            aria-label="Loading Squeeks"
                          >
                            {[1, 2, 3, 4].map((i) => (
                              <div className="card-skeleton" key={i} />
                            ))}
                          </div>
                        ) : !current && error && !filters.listedOnly ? null : (
                          <Empty
                            title={
                              filters.listedOnly
                                ? "No signed listings here yet"
                                : "No Squeeks match"
                            }
                            action={
                              filters.listedOnly
                                ? "Import a listing"
                                : "Clear filters"
                            }
                            onAction={() =>
                              filters.listedOnly
                                ? setImportOpen(true)
                                : setFilters(initialFilters)
                            }
                          >
                            {filters.listedOnly
                              ? "Get a signed order link or file from a Squeek owner."
                              : "Try another level, power range, or token ID."}
                          </Empty>
                        )}
                        {filters.query &&
                          !results.length &&
                          !loading &&
                          !filters.listedOnly &&
                          /^#?\d+$/.test(filters.query) && (
                            <button
                              className="button full"
                              onClick={() => {
                                location.hash = `squeek/${filters.query.replace("#", "")}`;
                              }}
                            >
                              Look up Squeek {filters.query} on-chain{" "}
                              <ArrowUpRight size={16} />
                            </button>
                          )}
                        {current?.partial &&
                          !filters.listedOnly &&
                          !filters.query && (
                            <div className="load-more">
                              <button
                                className="button"
                                disabled={loading || portfolioBusy}
                                onClick={() => {
                                  const next = limit + 24;
                                  setLimit(next);
                                  if (view === "explore") void refresh(next);
                                }}
                              >
                                {loading
                                  ? "Loading more Squeeks…"
                                  : "Load more Squeeks"}
                                <ChevronDown size={16} />
                              </button>
                            </div>
                          )}
                        {current && (
                          <div className="read-caption">
                            <ShieldCheck size={15} />
                            <span>
                              {current?.source === "live"
                                ? "Verified at"
                                : "Saved at"}{" "}
                              Ethereum block {current?.block || "…"}.{" "}
                              {current.source === "saved"
                                ? "Historical snapshot. Refresh to read confirmed state."
                                : view === "portfolio"
                                  ? "Ownership checked at this block."
                                  : "Read with 12 confirmations at refresh time."}
                            </span>
                          </div>
                        )}
                      </section>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>
      <footer className="site-footer">
        <div className="footer-brand">
          <img src="./squeek-mark.svg" width="25" height="25" alt="" />
          <strong>squeek market</strong>
          <span>A little more character.</span>
        </div>
        <div>
          <a
            href="https://docs.squeekchain.com/rewards/squeekfi/"
            target="_blank"
            rel="noreferrer"
          >
            About Squeeks <ArrowUpRight size={13} />
          </a>
          <a
            href={`${EXPLORER}/address/${addresses.nft}`}
            target="_blank"
            rel="noreferrer"
          >
            View collection <ArrowUpRight size={13} />
          </a>
          <button className="text-button" onClick={() => setImportOpen(true)}>
            Import order
          </button>
        </div>
      </footer>
      {importOpen && (
        <Modal
          title="Import a signed listing"
          onClose={() => {
            if (!importBusy) {
              setImportOpen(false);
              if (location.hash.startsWith("#order="))
                location.hash = "explore";
            }
          }}
        >
          <p className="muted">
            Paste an exported Seaport order or choose its JSON file. Ownership,
            signature, approval, royalty, and expiry are checked on Sepolia.
          </p>
          <label className="file-label">
            Choose order file
            <input
              type="file"
              accept=".json,application/json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) {
                  if (f.size > 24000) {
                    setImportError("Choose an order file smaller than 24 KB.");
                    return;
                  }
                  setImportText(await f.text());
                }
              }}
            />
          </label>
          <label className="field">
            Signed order JSON
            <textarea
              rows={7}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              maxLength={24000}
              placeholder="Paste a Squeek Market signed order"
              spellCheck={false}
            />
          </label>
          {importError && (
            <p className="error-text" role="alert">
              {importError}
            </p>
          )}
          <button
            className="button primary full"
            disabled={importBusy}
            onClick={importOrder}
          >
            {importBusy
              ? "Verifying the signed order…"
              : "Verify and import listing"}
          </button>
          <p className="fine muted">
            Listings stay in this browser. Export or share your signed order to
            make it available elsewhere.
          </p>
        </Modal>
      )}
    </>
  );
}
