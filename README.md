# Squeek Market

A static, wallet-connected marketplace for Squeekchain’s Squeeks on **Sepolia only (11155111)**. Browse real DotGrid NFTs, inspect the whole mining position, find owned Squeeks, and trade with signed Seaport 1.6 orders. Test assets have no monetary value.

The deliverable is `dist/index.html` and its local assets, with the Next.js App Router / TypeScript / Tailwind source, lockfile, tests, and [key-flow screenshots](artifacts/screenshots/README.md) alongside it. Hosting and the public repository URL are assigned by the delivery platform; this build does not claim an external deployment URL.

## Install, run, and rebuild

Use Node.js 22 or newer and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Next.js. No API keys, environment files, wallet project IDs, or backend are required.

```sh
npm run typecheck
npm test
npm run build
npm run preview -- 4387
```

Preview the production export at `http://localhost:4387/preview/`. `npm run build` runs Next’s production webpack build, exports to `out/`, and creates the complete `dist/` bundle. The export script fixes relative CSS font URLs, copies required public assets, and excludes source maps and server/build caches. Serve **the contents of `dist/`** over HTTP(S), including at a subpath. Routes use hashes, so no server rewrite is needed. Do not open it with `file://`.

`npm run snapshot` optionally refreshes the eight-token, explicitly labeled offline fallback after verifying the official deployment. It makes public RPC reads only. `npx tsx scripts/live-check.ts` rechecks deployment identities, canonical block hashes, Seaport order hashing, and an unsigned approval simulation; it sends no transactions and requests no signatures.

## Trading

1. Explore the collection or open `#squeek/ID`. All cards disclose live active power, unclaimed SQK, level, merge status, and expandable pending power, pending round, owner, and royalty.
2. Connect a wallet. Named extensions use EIP-6963 discovery. Phones can open this page in MetaMask, Coinbase Wallet, Rabby, or Phantom. Coinbase Smart Wallet is available without a relay or project ID. Wrong-network actions offer a Sepolia switch.
3. **List:** open an owned Squeek, enter a fixed total price in Sepolia ETH, choose an expiry, and review. Approve **that individual NFT** for Seaport, then sign the EIP-712 order. The royalty is included in the entered total; the marketplace fee is zero. The NFT stays with its owner.
4. Export the order JSON or copy its share link. The recipient uses **Import listing**, which verifies the seller signature, current owner, approval, counter, order status, expiry, and current royalty.
5. **Buy:** review the refreshed position and simulated fulfillment, then confirm the purchase in your wallet. Seller and royalty payments settle atomically with the NFT transfer through Seaport.
6. **Cancel:** the seller selects **Cancel listing on-chain** and confirms the simulated Seaport cancellation in their wallet. Previously shared copies then fail on-chain. Saved orders remain available to their seller when approval is revoked; find them under **Listed → Your inactive orders** or on the Squeek detail. They stay out of active listings. Cancel before approving Seaport again, since renewed approval can reactivate an uncancelled order.

Signed orders are stored **only in the current browser**. There is no global order book, server, OpenSea API integration, fake liquidity, or seeded listing. Other visitors see an order after importing its link/file. Clearing browser storage does not cancel an order: use the on-chain cancellation first. The supported order format is one Squeek, a full-open fixed-price native-ETH order, and the current ERC-2981 royalty. Criteria, auctions, bundles, offers, and other collections are rejected.

The purchase review is an estimate: Seaport transfers the position **at execution**. The seller can claim rewards, merge, transfer, or cancel after a quote; the app refreshes and simulates immediately before requesting the transaction, but the signed order does not bind a minimum level or reward balance. That limitation appears next to purchase confirmation. A bespoke audited exchange would be needed to enforce such minimums atomically.

## Contract integration

| Contract | Sepolia address |
| --- | --- |
| SqueekNFT | `0x0eAF3E0d40A0a8E5a6Ac030b2459E9FB0B7905c6` |
| SqueekMining | `0x3beE588fC20dE788Bac17d33b41Da7346cb27EC4` |
| SqueekCore | `0x74665dAecA35A2303e767E76a2FF1FB6F93e119f` |
| SqueekToken (SQK) | `0x6872bfa5ccc3e9e440c6c16e5ffdabb8dba4cc76` |
| Seaport 1.6 | `0x0000000000000068F116a894984e2DB1123eB395` |

The [published Squeekchain deployment](https://docs.squeekchain.com/assets/deployments/sepolia.json) and its four ABIs are pinned in `src/lib/`. The integration follows the [official verification method](https://docs.squeekchain.com/developers/quickstart/): at one Ethereum block, check chain ID, EIP-1967 implementation/admin slots, implementation runtime hashes, versions 3/6, layout digests, ProxyAdmin governance owners, launch configuration, and the contract graph. Any mismatch stops reads and actions. Additional NFT/mining/token bindings and SQK’s 18 decimals are checked. See [contract source hashes](artifacts/contract-sources.json).

Seaport’s address comes from [OpenSea’s published Sepolia deployment](https://github.com/ProjectOpenSea/seaport#deployments). Its published ABI is pinned at commit `589c6b8f2a2fac2e3c14b7049bbd990082d17488`; the app checks deployed code exists and `information()` reports 1.6. Zero addresses/hashes in order construction are Seaport’s specified native currency, no-zone, and direct-transfer sentinels, not configurable recipient placeholders.

Public RPCs: `https://ethereum-sepolia-rpc.publicnode.com` and `https://rpc.sepolia.org`, configured in `src/lib/contracts.ts`. No machine-specific endpoint or secret is bundled.

### Display correctness and reorgs

- `activeWeight` is read directly from `position(0, id)`, never inferred from level. `pendingWeight` is a full replacement at `pendingRound`.
- All amounts and weights stay as `bigint`. SQK base units are `accruedScaled / 2^128`; SQK then uses 18 decimals. Cards show a truncated six-decimal value; the detail table shows all 18 decimals and the remaining sub-base-unit fraction separately. This avoids pretending that fractional credit is already claimable.
- Merge cooldown compares `nextMergeBlock` with SqueekCore’s **completed Squeek block height**, not Ethereum height or elapsed time. Pending power and maximum level can also make a merge unavailable.
- Browsing and portfolio snapshots read one block, 12 confirmations behind latest, and verify that block’s hash again after all reads. Loading more re-reads the expanded page at one new block rather than mixing blocks.
- Portfolio discovery uses the documented public/reserve issuance ranges and direct `ownerOf` multicalls, with `balanceOf` for the complete owned total. It loads metadata only for the requested page. This avoids historical log restrictions on public RPCs. Every call uses the same verified block; no persisted ownership index exists to become stale after a reorg.
- Activity rebuilds the last 10,000 confirmed Ethereum blocks on every refresh. Event identities include chain ID, block hash, transaction hash, and log index. Transfers are labeled as sales only when correlated with a Seaport `OrderFulfilled` event; other venues are displayed as transfers. Bundle-level native consideration is the transaction’s order total, not a per-NFT allocation.
- Every owner action checks `ownerOf` again at a verified latest block, every transaction is simulated, and only the visitor’s wallet signs/submits. Receipts wait for two confirmations; browsing retains the more conservative 12-confirmation policy. No private key or seed phrase is requested or handled.
- JSON metadata stays data. On-chain SVGs are isolated in `<img>` elements, never inserted into the DOM. Remote metadata image URLs are rejected. Full tokenURI metadata can be downloaded from a successful live detail read.

For the reproducible Chromium interaction and accessibility run:

```sh
npx playwright install chromium
npm run check:revision
```

The revision script starts and closes its own static preview at a subpath, checks the actual export, and writes `artifacts/revision-results.json` plus the screenshots below. It accepts an optional `--rpc <Sepolia endpoint>` for read transport. Wallet discovery, switching, and rejection use a read-only mock provider. The purchase capture also mocks approval, signature verification, and fulfillment simulation; these overrides are limited to the test browser and visibly labeled in the image. No signing key is generated, no real listing is created, and no transaction is broadcast. Browser binaries are development tools and are not part of the export. The earlier general interaction suite remains available as `npm run check:browser`; its live-data expectations may change with chain state.

## Scope and limitations

Explore loads 24 issued IDs at a time (burned IDs are omitted); its filters and sorting apply to the loaded page. Search offers an explicit on-chain lookup for IDs outside that page. **Listed** includes all locally imported and verified orders, including tokens outside the loaded explorer page. Scanning a large collection for a wallet’s owned IDs or loading many tokenURI images can be slow on public RPCs. Refresh is explicit; displayed positions do not promise continuous streaming updates.

The built-in fallback contains eight genuine tokens captured at Ethereum block 12,037,933, including its hash and timestamp. It is marked **Saved**, is never used to authorize a trade, and cannot prove current ownership or listing availability. Network failures are shown with a retry. Changing RPC URLs is a source configuration change, not a request for credentials.

No escrow contract is deployed: the optional on-chain path uses existing Seaport fulfillment and cancellation. Minting, claims, and merges are not marketplace actions provided by this UI. No funded real wallet was supplied for transaction execution during validation. Physical wallet apps, passkey creation, and real purchase/cancel receipts require owner testing; no transaction was sent during this work.

## Recorded check results

The revision production build and standalone typecheck passed. All 15 existing logic/order/reorg tests, 19 Chromium regression checks, and all 16 taste@1 design checks passed. Browse and inactive-order axe scans reported zero violations. Official deployment verification, Seaport order-hash comparison, and an unsigned approval simulation passed. Revoked-order cancellation rechecked the live owner and passed a real unsigned simulation before a read-only wallet rejected submission.

WebKit could not launch because required system libraries were absent. Real wallet signing, purchase/cancel execution and receipts, physical app launches, screen-reader use, and native zoom remain unverified. The purchase review screenshot demonstrates a simulated wallet/order state, not a successful on-chain purchase.

## Key-flow screenshots

These captures are included in the repository, not just generated on demand. The desktop captures use a 1440px viewport; the mobile capture is 390px wide.

| Flow | Capture | Data and wallet state |
| --- | --- | --- |
| Browse | [Desktop](artifacts/screenshots/explore-desktop.png) · [Mobile](artifacts/screenshots/explore-mobile.png) | Desktop uses verified chain reads; mobile shows the labeled historical fallback. |
| Squeek details | [Full detail](artifacts/screenshots/squeek-detail.png) | Verified on-chain DotGrid image, position, owner, royalty, and metadata. |
| List for sale | [Listing review](artifacts/screenshots/listing-review.png) | Simulated seller wallet, live contract reads; nothing signed. |
| Buy | [Purchase review](artifacts/screenshots/purchase-review.png) | Simulated buyer wallet and order, with approval/signature/simulation overrides disclosed in the capture. |
| Cancel after revocation | [Revoked listing](artifacts/screenshots/revoked-listing.png) | Simulated seller/order and revoked approval; cancellation remains available. |

## Validation and design

See [the validation report](artifacts/validation.md), [live checks](artifacts/live-check.json), [regression results](artifacts/revision-results.json), [screenshots](artifacts/screenshots/README.md), and [DESIGN.md](DESIGN.md). The report records actual commands, corrected findings, six-domain Better Interface coverage, and browser limitations. It is worker-side evidence, not independent certification.

Design guidance: Jakub Krehel’s Better Interface (MIT), adapted from commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`; documentation method: Paul Bakaus’s Impeccable (Apache-2.0), commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. [Notices and license texts](artifacts/DESIGN-GUIDANCE-LICENSE) are retained. DM Sans is bundled under its [OFL](public/fonts/OFL.txt). Wallet marks come from RainbowKit under its [MIT license](artifacts/WALLET-MARKS-LICENSE); Seaport’s [license](artifacts/SEAPORT-LICENSE) is retained. The official Squeekchain developer documentation is used as reference data; contract and wallet configuration are unchanged in this revision.
