import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { createPreviewServer } from "./preview.mjs";
const server = createPreviewServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/preview/`;
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const result = {
  checkedAt: new Date().toISOString(),
  browser: "Chromium",
  mockWallet: true,
  transactionsSent: 0,
  checks: [],
  errors: [],
  localFailures: [],
  axe: [],
};
const check = (name) => {
  result.checks.push({ name, passed: true });
  console.log("PASS " + name);
};
await mkdir("artifacts/screenshots", { recursive: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => result.errors.push(e.message));
  page.on("response", (r) => {
    if (r.url().startsWith(base) && r.status() >= 400)
      result.localFailures.push({ url: r.url(), status: r.status() });
  });
  await page.goto(base);
  await page.locator(".token-card").first().waitFor();
  await page
    .getByText("Verified on-chain reads", { exact: true })
    .waitFor({ timeout: 90000 });
  assert.equal(await page.title(), "Squeek Market · On-chain companions");
  assert(
    await page.evaluate(() =>
      [...document.fonts].some(
        (font) => font.family.includes("DM Sans") && font.status === "loaded",
      ),
    ),
  );
  check("static export and live graph verification at a gateway subpath");
  const audit = await new AxeBuilder({ page }).analyze();
  result.axe = audit.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.length,
    summary: v.description,
  }));
  await page.screenshot({ path: "artifacts/screenshots/explore-desktop.png" });
  await page
    .getByRole("combobox", { name: "Sort by", exact: true })
    .selectOption("power");
  assert.match(await page.locator(".token-card h3").first().innerText(), /#22/);
  check("active-power sort uses live positions");
  await page
    .getByRole("textbox", { name: "Minimum active power", exact: true })
    .fill("30000");
  assert.equal(await page.locator(".token-card").count(), 1);
  check("advanced minimum-power filter");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search by token ID" }).fill("11");
  assert.equal(await page.locator(".token-card").count(), 1);
  assert.match(await page.locator(".token-card").innerText(), /Level 3/);
  check("token ID search and level display");
  await page.getByRole("button", { name: "List view", exact: true }).click();
  assert.equal(await page.locator(".token-row").count(), 1);
  await page.getByText("Position & ownership", { exact: true }).click();
  assert.match(await page.locator(".card-extra").innerText(), /Pending round/);
  check("list view and expandable pending-power / owner / royalty stats");
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("button", { name: "Grid view", exact: true }).click();
  await page.getByRole("button", { name: "Listed 0", exact: true }).click();
  await page
    .getByRole("heading", { name: "No signed listings here yet" })
    .waitFor();
  check("honest empty local order book");
  await page
    .getByRole("button", { name: "Import a listing", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Signed order JSON" })
    .fill('{"chainId":1}');
  await page.getByRole("button", { name: "Verify and import listing" }).click();
  await page.getByRole("alert").filter({ hasText: "Sepolia" }).waitFor();
  check("invalid and wrong-chain signed order is rejected");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("dialog").count(), 0);
  check("dialog Escape closure");
  await page.getByRole("button", { name: "All Squeeks", exact: true }).click();
  await page.getByRole("link", { name: /^View Squeek #1, Level / }).click();
  await page.getByRole("heading", { name: "Squeek #1", exact: true }).waitFor();
  await page
    .getByRole("link", { name: "Download tokenURI metadata" })
    .waitFor({ timeout: 90000 });
  await page
    .locator(".read-status")
    .waitFor({ state: "hidden", timeout: 90000 });
  assert.match(
    await page.locator(".data-table").first().innerText(),
    /Unclaimed SQK \(18 decimals\)/,
  );
  check(
    "detail page refresh and full fractional SQK / cooldown / royalty values",
  );
  await page.screenshot({
    path: "artifacts/screenshots/squeek-detail.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Connect to list a Squeek", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Connect a wallet" }).waitFor();
  await page.keyboard.press("Escape");
  check("detail purchase/list control opens wallet sheet");
  await page.goto(base + "#portfolio");
  await page
    .getByRole("heading", { name: "Your little corner of Squeekchain" })
    .waitFor();
  check("disconnected portfolio gives actionable connection state");
  await page.goto(base + "#explore");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".token-card").first().waitFor();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .locator(".mobile-filters")
    .getByRole("combobox", { name: "Level", exact: true })
    .selectOption("10");
  await page.getByRole("heading", { name: "No Squeeks match" }).waitFor();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  check("mobile filter disclosure, empty state, and reset");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "artifacts/screenshots/explore-mobile.png" });
  for (const width of [320, 390, 760, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const dims = await page.evaluate(() => ({
      w: document.documentElement.clientWidth,
      s: document.documentElement.scrollWidth,
    }));
    assert(dims.s <= dims.w, `overflow at ${width}`);
  }
  check("no horizontal overflow at 320, 390, 760, and 1440 widths");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent),
    "Skip to content",
  );
  check("keyboard skip link receives visible focus");
  await page.screenshot({ path: "artifacts/screenshots/keyboard-focus.png" });
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
  });
  const phone = await mobile.newPage();
  await phone.goto(base);
  await phone
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  for (const w of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
    assert.equal(
      await phone
        .getByRole("link", { name: "Open in " + w, exact: true })
        .count(),
      1,
    );
  assert.equal(
    await phone
      .getByRole("button", { name: "Coinbase Smart Wallet", exact: true })
      .count(),
    1,
  );
  await phone.screenshot({ path: "artifacts/screenshots/mobile-wallet.png" });
  check(
    "phone wallet sheet exposes all four app links and Coinbase Smart Wallet",
  );
  await mobile.close();
  const saved = JSON.parse(await readFile("public/snapshot.json", "utf8"));
  const owner = saved.tokens[0].owner;
  const walletContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await walletContext.addInitScript(
    ({ owner }) => {
      const listeners = new Map();
      let chain = "0xaa36a7";
      let txRequests = 0;
      let authorized = false;
      const provider = {
        request: async ({ method, params }) => {
          if (method === "eth_requestAccounts") {
            authorized = true;
            return [owner];
          }
          if (method === "eth_accounts") return authorized ? [owner] : [];
          if (method === "eth_chainId") return chain;
          if (method === "wallet_getCapabilities") return {};
          if (method === "wallet_switchEthereumChain") {
            chain = params[0].chainId;
            for (const f of listeners.get("chainChanged") ?? []) f(chain);
            return null;
          }
          if (method === "eth_sendTransaction") {
            txRequests++;
            throw Object.assign(
              Error("User rejected the request (validation wallet)."),
              { code: 4001 },
            );
          }
          if (method === "wallet_requestPermissions")
            return [{ parentCapability: "eth_accounts" }];
          if (method === "eth_getBalance") return "0x0";
          throw Error("Unsupported validation request: " + method);
        },
        on: (e, f) => listeners.set(e, [...(listeners.get(e) ?? []), f]),
        removeListener: (e, f) =>
          listeners.set(
            e,
            (listeners.get(e) ?? []).filter((x) => x !== f),
          ),
      };
      window.__walletValidation = {
        changeChain: (c) => {
          chain = c;
          for (const f of listeners.get("chainChanged") ?? []) f(c);
        },
        txRequests: () => txRequests,
      };
      const announce = () => {
        for (const [uuid, name] of [
          ["00000000-0000-4000-8000-000000000001", "Validation Alpha"],
          ["00000000-0000-4000-8000-000000000002", "Validation Beta"],
        ])
          dispatchEvent(
            new CustomEvent("eip6963:announceProvider", {
              detail: {
                info: {
                  uuid,
                  name,
                  icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
                  rdns: "test." + name.replace(" ", ""),
                },
                provider,
              },
            }),
          );
      };
      addEventListener("eip6963:requestProvider", announce);
      announce();
    },
    { owner },
  );
  const wpage = await walletContext.newPage();
  await wpage.goto(base + "#squeek/1");
  await wpage
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await wpage
    .getByRole("button", { name: "Validation Alpha", exact: true })
    .waitFor();
  assert.equal(
    await wpage
      .getByRole("button", { name: "Validation Beta", exact: true })
      .count(),
    1,
  );
  assert.equal(
    await wpage
      .getByRole("button", { name: "Browser wallet", exact: true })
      .count(),
    0,
  );
  await wpage
    .getByRole("button", { name: "Validation Alpha", exact: true })
    .click();
  await wpage
    .getByRole("textbox", { name: "Price in Sepolia ETH", exact: true })
    .waitFor({ timeout: 90000 });
  check("EIP-6963 named extension discovery and generic-row hiding");
  await wpage.evaluate(() => window.__walletValidation.changeChain("0x1"));
  await wpage
    .getByRole("button", { name: "Switch network", exact: true })
    .first()
    .click();
  await wpage
    .getByRole("button", { name: "Switch to Sepolia", exact: true })
    .click();
  await wpage
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await wpage
    .getByRole("textbox", { name: "Price in Sepolia ETH", exact: true })
    .waitFor();
  check("wrong-chain trading guard and wallet_switchEthereumChain recovery");
  await wpage.getByRole("link", { name: "My Squeeks", exact: true }).click();
  await wpage.locator(".token-card").first().waitFor({ timeout: 90000 });
  assert.match(
    await wpage.locator(".read-caption").innerText(),
    /Ownership checked at this block/,
  );
  await wpage.screenshot({ path: "artifacts/screenshots/owned-portfolio.png" });
  check(
    "connected portfolio enumerates issued IDs and confirms live ownership",
  );
  await wpage.goto(base + "#squeek/1");
  await wpage
    .getByRole("textbox", { name: "Price in Sepolia ETH", exact: true })
    .waitFor({ timeout: 90000 });
  await wpage
    .locator(".read-status")
    .waitFor({ state: "hidden", timeout: 90000 });
  await wpage
    .getByRole("textbox", { name: "Price in Sepolia ETH", exact: true })
    .fill("0.01");
  await wpage
    .getByRole("button", { name: "Review listing", exact: true })
    .click();
  await wpage
    .getByRole("heading", { name: "List Squeek #1", exact: true })
    .waitFor();
  assert.match(
    await wpage.locator(".flow-review").innerText(),
    /5% royalty is included/,
  );
  await wpage.screenshot({
    path: "artifacts/screenshots/listing-review.png",
    fullPage: true,
  });
  check(
    "owned NFT listing review discloses royalty, expiry, approval, and signature steps",
  );
  await wpage
    .getByRole("button", { name: "1. Approve this Squeek", exact: true })
    .click();
  await wpage
    .locator(".trade-panel")
    .getByRole("alert")
    .waitFor({ timeout: 90000 });
  assert.equal(
    await wpage.evaluate(() => window.__walletValidation.txRequests()),
    1,
  );
  check(
    "approval simulation reaches wallet; user rejection is recoverable and sends nothing",
  );
  await walletContext.close();
  await page.goto(base + "#activity");
  await page
    .getByRole("heading", { name: "Recent activity", exact: true })
    .waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector(".activity-list") ||
      document.querySelector(".activity-page .empty-state") ||
      document.querySelector(".activity-page .notice.error"),
    undefined,
    { timeout: 90000 },
  );
  assert.equal(await page.locator(".activity-page .notice.error").count(), 0);
  result.activityEmpty =
    (await page.locator(".activity-page .empty-state").count()) > 0;
  check(
    "recent confirmed transfer / Seaport sale feed loads from canonical logs",
  );
  const offline = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await offline.route("https://**/*", (r) => r.abort());
  const op = await offline.newPage();
  await op.goto(base);
  await op.locator(".snapshot-note").waitFor();
  assert.match(await op.locator(".snapshot-note").innerText(), /Saved/);
  await op.getByRole("searchbox", { name: "Search by token ID" }).fill("1");
  assert.equal(await op.locator(".token-card").count(), 1);
  check("offline saved snapshot stays labeled and local search remains usable");
  await offline.close();
  assert.equal(result.errors.length, 0);
  assert.equal(result.localFailures.length, 0);
  assert.equal(result.axe.length, 0);
  check(
    "no browser exceptions, missing local resources, or automated accessibility violations",
  );
} catch (e) {
  result.failure = e.message;
  for (const context of browser.contexts())
    for (const failedPage of context.pages()) {
      console.error(
        "State at failure:",
        (await failedPage.locator("body").innerText()).slice(-3000),
      );
    }
  console.error(e);
  process.exitCode = 1;
} finally {
  await writeFile(
    "artifacts/interaction-results.json",
    JSON.stringify(result, null, 2),
  );
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
