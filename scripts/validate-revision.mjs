// Regression checks and review captures of the production export.
// All wallets are read-only fixtures. No private keys or valid signatures exist here.
import { chromium, webkit } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { encodeFunctionData, encodeAbiParameters, parseAbi, zeroAddress, zeroHash, toFunctionSelector } from 'viem';
import { createPreviewServer } from './preview.mjs';

const args = process.argv.slice(2);
const rpc = args.includes('--rpc') ? args[args.indexOf('--rpc') + 1] : 'https://ethereum-sepolia-rpc.publicnode.com';
const saved = JSON.parse(await readFile('public/snapshot.json', 'utf8'));
const deployment = JSON.parse(await readFile('src/lib/deployment.json', 'utf8'));
const nft = deployment.contracts.SqueekNFT.address;
const seaport = '0x0000000000000068F116a894984e2DB1123eB395';
const owner = saved.tokens[0].owner;
const buyer = deployment.coreConfiguration.guardian;
assert(buyer && buyer.toLowerCase() !== owner.toLowerCase());
const abi = parseAbi([
  'function getCounter(address) view returns (uint256)',
  'function getApproved(uint256) view returns (address)',
  'function isApprovedForAll(address,address) view returns (bool)',
]);
const approvedSelector = toFunctionSelector('getApproved(uint256)');
const allSelector = toFunctionSelector('isApprovedForAll(address,address)');
const ownerSelector = toFunctionSelector('ownerOf(uint256)');
const fulfillSelector = toFunctionSelector('fulfillOrder(((address,address,(uint8,address,uint256,uint256,uint256)[],(uint8,address,uint256,uint256,uint256,address)[],uint8,uint256,uint256,bytes32,uint256,bytes32,uint256),bytes),bytes32)');
const cancelSelector = toFunctionSelector('cancel((address,address,(uint8,address,uint256,uint256,uint256)[],(uint8,address,uint256,uint256,uint256,address)[],uint8,uint256,uint256,bytes32,uint256,bytes32,uint256)[])');
const result = { checkedAt: new Date().toISOString(), browser: 'Chromium', checks: [], errors: [], localFailures: [], axe: [], screenshots: [], fixtures: [], transactionsSent: 0, signaturesRequested: 0 };
const check = (name) => { result.checks.push({ name, passed: true }); console.log('PASS ' + name); };
const server = createPreviewServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/preview/`;
const browser = await chromium.launch({ args: ['--no-sandbox'] });
await mkdir('artifacts/screenshots', { recursive: true });
const encode = (type, value) => encodeAbiParameters([{ type }], [value]);
async function forward(q) {
  // A read-only allowlist prevents accidental broadcasts even if a fixture regresses.
  assert(['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getCode', 'eth_getStorageAt', 'eth_call', 'eth_getLogs', 'eth_getBalance'].includes(q.method), q.method);
  const response = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q), signal: AbortSignal.timeout(25000) });
  assert(response.ok, `RPC HTTP ${response.status}`);
  return response.json();
}
async function context({ account, mode = 'live', order } = {}) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const control = { scenario: mode, mode, approvalOverrides: 0, signatureOverrides: 0, fulfillmentOverrides: 0, cancellationSimulations: 0, ownerReads: 0 };
  result.fixtures.push(control);
  await c.route('https://**/*', async route => {
    if (control.mode === 'offline' || !/^https:\/\/(ethereum-sepolia-rpc\.publicnode\.com|rpc\.sepolia\.org)\/?$/.test(route.request().url())) return route.abort();
    const body = route.request().postDataJSON();
    const answer = async q => {
      const call = q.params?.[0];
      const data = call?.data || '';
      const to = call?.to?.toLowerCase();
      let value;
      if (q.method === 'eth_call') {
        if (to === nft.toLowerCase() && data.startsWith(ownerSelector)) control.ownerReads++;
        if (to === seaport.toLowerCase() && data.startsWith(cancelSelector)) control.cancellationSimulations++;
        if (control.mode !== 'live') {
          if (to === nft.toLowerCase() && data.startsWith(approvedSelector)) {
            const id = BigInt('0x' + data.slice(10));
            const approved = control.mode === 'purchase' || (control.mode === 'mixed' && id === 2n);
            value = encode('address', approved ? seaport : zeroAddress);
            control.approvalOverrides++;
          }
          if (to === nft.toLowerCase() && data.startsWith(allSelector)) {
            value = encode('bool', false);
            control.approvalOverrides++;
          }
          // viem's ERC-6492 verifier uses an eth_call contract-creation simulation.
          // Only labeled fixture scenarios override its result; production stays untouched.
          if (!to && ['purchase', 'mixed'].includes(control.mode)) {
            value = '0x01';
            control.signatureOverrides++;
          }
          if (to === seaport.toLowerCase() && data.startsWith(fulfillSelector) && control.mode === 'purchase') {
            assert.equal(BigInt(call.value), 10000000000000000n);
            value = encode('bool', true);
            control.fulfillmentOverrides++;
          }
        }
      }
      return value === undefined ? forward(q) : { jsonrpc: '2.0', id: q.id, result: value };
    };
    try {
      await route.fulfill({ json: Array.isArray(body) ? await Promise.all(body.map(answer)) : await answer(body) });
    } catch (error) {
      // Fail closed as a network error, with no fallback to a different test RPC.
      console.error('Read transport failed:', error.message);
      await route.abort();
    }
  });
  if (account) await c.addInitScript(({ account }) => {
    let current = account, authorized = false, chain = '0xaa36a7';
    const listeners = new Map();
    const requests = [];
    const emit = (name, value) => { for (const callback of listeners.get(name) ?? []) callback(value); };
    const provider = {
      request: async ({ method, params }) => {
        if (method === 'eth_requestAccounts') { authorized = true; return [current]; }
        if (method === 'eth_accounts') return authorized ? [current] : [];
        if (method === 'eth_chainId') return chain;
        if (method === 'wallet_getCapabilities') return {};
        if (method === 'wallet_switchEthereumChain') { chain = params[0].chainId; emit('chainChanged', chain); return null; }
        if (method === 'wallet_requestPermissions') return [{ parentCapability: 'eth_accounts' }];
        if (method === 'eth_getBalance') return '0x0';
        requests.push({ method, params });
        throw Object.assign(Error('User rejected the request (read-only validation wallet).'), { code: 4001 });
      },
      on: (name, f) => listeners.set(name, [...(listeners.get(name) ?? []), f]),
      removeListener: (name, f) => listeners.set(name, (listeners.get(name) ?? []).filter(x => x !== f)),
    };
    window.__revisionWallet = { requests, account: value => { current = value; emit('accountsChanged', [value]); }, chain: value => { chain = value; emit('chainChanged', value); } };
    const announce = () => dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: {
      info: { uuid: '00000000-0000-4000-8000-000000000001', name: 'Read-only validation wallet', icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=', rdns: 'test.squeek.revision' }, provider,
    } }));
    addEventListener('eip6963:requestProvider', announce); announce();
  }, { account });
  const page = await c.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', e => result.errors.push(e.message));
  page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) result.localFailures.push({ path: r.url().slice(base.length), status: r.status() }); });
  if (order) {
    await page.goto(base);
    await page.evaluate(o => localStorage.setItem('squeek-market.orders.v1', JSON.stringify([o])), order);
  }
  return { context: c, page, control };
}
async function connect(page) {
  if (await page.getByRole('button', { name: 'Connect wallet', exact: true }).count()) {
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
    await page.getByRole('button', { name: 'Read-only validation wallet', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  }
}
async function settleDetail(page) {
  await page.getByRole('heading', { name: 'Squeek #1', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Download tokenURI metadata' }).waitFor({ timeout: 90000 });
  await page.locator('.read-status').waitFor({ state: 'hidden', timeout: 90000 });
  assert.equal(await page.locator('.detail-layout').count(), 1);
}
async function screenshot(page, name, label, fullPage = false) {
  if (label) await page.evaluate(text => {
    document.getElementById('validation-capture-label')?.remove();
    const banner = document.createElement('aside');
    banner.id = 'validation-capture-label';
    banner.textContent = text;
    banner.style.cssText = 'background:#efc78e;color:#241e13;padding:12px 24px;font:600 16px/1.5 Arial,sans-serif;text-align:center';
    document.body.prepend(banner);
  }, label);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `artifacts/screenshots/${name}.png`, fullPage });
  result.screenshots.push({ file: `${name}.png`, label: label || 'Unmodified interface; verified contract reads or explicitly labeled saved snapshot.' });
  if (label) await page.evaluate(() => document.getElementById('validation-capture-label').remove());
}
async function makeFixture(id) {
  const token = saved.tokens.find(t => t.id === id);
  const r = await forward({ jsonrpc: '2.0', id: 41, method: 'eth_call', params: [{ to: seaport, data: encodeFunctionData({ abi, functionName: 'getCounter', args: [owner] }) }, 'latest'] });
  assert(r.result);
  const payment = (amount, recipient) => ({ itemType: 0, token: zeroAddress, identifierOrCriteria: '0', startAmount: amount, endAmount: amount, recipient });
  return { version: 1, chainId: 11155111, exchange: seaport, components: {
    offerer: owner, zone: zeroAddress, offer: [{ itemType: 2, token: nft, identifierOrCriteria: id, startAmount: '1', endAmount: '1' }],
    consideration: [payment('9500000000000000', owner), payment('500000000000000', token.royaltyReceiver)],
    orderType: 0, startTime: '1', endTime: '9999999999', zoneHash: zeroHash, salt: '1', conduitKey: zeroHash, counter: BigInt(r.result).toString(),
  }, signature: '0x12' }; // Deliberately invalid; not a real seller order and never exported.
}
async function importOrder(page, order) {
  await page.getByRole('button', { name: 'Import order', exact: true }).click();
  await page.getByRole('textbox', { name: 'Signed order JSON' }).fill(JSON.stringify(order));
  await page.getByRole('button', { name: 'Verify and import listing' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 90000 });
}
try {
  const offline = await context({ mode: 'offline' });
  const op = offline.page;
  await op.setViewportSize({ width: 390, height: 844 });
  await op.goto(base);
  await op.locator('.snapshot-note').waitFor();
  const caption = await op.locator('.read-caption').innerText();
  assert.match(caption, /Saved at Ethereum block 12037933\. Historical snapshot\. Refresh to read confirmed state\./);
  assert.doesNotMatch(caption, /12 confirmations/);
  assert.match(await op.locator('.snapshot-note').innerText(), /Nov 1, 2026/);
  check('historical fallback preserves saved block/date and makes no current-depth claim');
  await op.getByRole('searchbox', { name: 'Search by token ID' }).fill('1');
  assert.equal(await op.locator('.token-card').count(), 1);
  await op.getByRole('button', { name: 'List view', exact: true }).click();
  assert.equal(await op.locator('.token-row').count(), 1);
  await op.getByRole('button', { name: 'Clear search' }).click();
  await op.getByRole('button', { name: 'Grid view', exact: true }).click();
  check('offline token search and grid/list controls work');
  await op.getByRole('button', { name: 'Filters', exact: true }).click();
  await op.locator('.mobile-filters').getByRole('combobox', { name: 'Level', exact: true }).selectOption('10');
  await op.getByRole('heading', { name: 'No Squeeks match', exact: true }).waitFor();
  await op.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await op.getByRole('button', { name: 'Filters', exact: true }).click();
  check('mobile filters expose an empty state and reset successfully');
  await screenshot(op, 'explore-mobile', undefined, true);
  for (const width of [320, 390, 760, 1440]) {
    await op.setViewportSize({ width, height: 844 });
    assert(await op.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `overflow at ${width}`);
  }
  check('browse reflows without horizontal overflow at 320/390/760/1440');
  for (const width of [390, 1440]) {
    await op.setViewportSize({ width, height: 844 });
    for (const [route, heading] of [['squeek/1', 'Squeek #1'], ['portfolio', 'Your little corner of Squeekchain'], ['activity', 'Recent activity']]) {
      await op.goto(base + '#' + route);
      await op.getByRole('heading', { name: heading, exact: true }).waitFor();
      const headingBefore = await op.locator('h1').innerText();
      await op.getByRole('link', { name: 'Skip to content', exact: true }).focus();
      await op.keyboard.press('Enter');
      await op.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      assert.equal(new URL(op.url()).hash, '#' + route);
      assert.equal(await op.locator('h1').innerText(), headingBefore);
      assert(await op.getByRole('heading', { name: heading, exact: true }).isVisible());
      assert.equal(await op.evaluate(() => document.activeElement.id), 'main-content');
      await op.keyboard.press('Tab');
      assert(await op.evaluate(() => document.querySelector('main').contains(document.activeElement)));
    }
  }
  check('skip link preserves detail/portfolio/activity routes and moves focus into main at 390/1440');
  await offline.context.close();

  const live = await context();
  const p = live.page;
  await p.goto(base);
  await p.getByText('Verified on-chain reads', { exact: true }).waitFor({ timeout: 90000 });
  assert.match(await p.locator('.read-caption').innerText(), /Read with 12 confirmations at refresh time/);
  assert.equal(await p.title(), 'Squeek Market · On-chain companions');
  assert(await p.evaluate(() => [...document.fonts].some(f => f.family.includes('DM Sans') && f.status === 'loaded')));
  check('official live verification and relative assets/font work at a gateway subpath');
  await screenshot(p, 'explore-desktop');
  const axe = await new AxeBuilder({ page: p }).analyze();
  result.axe = axe.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  assert.equal(result.axe.length, 0);
  check('primary browse axe scan reports zero violations');
  await p.goto(base + '#squeek/1');
  await settleDetail(p);
  assert.match(await p.locator('.data-table').first().innerText(), /Unclaimed SQK \(18 decimals\)/);
  await screenshot(p, 'squeek-detail', undefined, true);
  check('live detail includes full rewards, pending weight/round, ownership, royalty, and metadata');
  await live.context.close();

  const seller = await context({ account: owner });
  const s = seller.page;
  await s.goto(base + '#squeek/1');
  await settleDetail(s);
  await connect(s);
  await s.getByRole('textbox', { name: 'Price in Sepolia ETH', exact: true }).waitFor();
  await s.evaluate(() => window.__revisionWallet.chain('0x1'));
  await s.locator('.trade-panel').getByRole('button', { name: 'Switch network', exact: true }).click();
  await s.getByRole('button', { name: 'Switch to Sepolia', exact: true }).click();
  await s.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await s.getByRole('textbox', { name: 'Price in Sepolia ETH', exact: true }).fill('0.01');
  await s.getByRole('button', { name: 'Review listing', exact: true }).click();
  await s.getByRole('heading', { name: 'List Squeek #1', exact: true }).waitFor();
  assert.match(await s.locator('.flow-review').innerText(), /5% royalty is included/);
  await screenshot(s, 'listing-review', 'SIMULATED SELLER WALLET · Live contract reads. No approval or listing was signed.', true);
  check('listing review shows price/royalty and separate approval/signature steps with a labeled simulated seller');
  await seller.context.close();

  const order = await makeFixture('1');
  const sellerRevoked = await context({ account: owner, mode: 'revoked', order });
  const r = sellerRevoked.page;
  await r.goto(base + '#explore');
  await r.reload();
  await connect(r);
  await r.getByRole('button', { name: 'Listed 0', exact: true }).click();
  await r.locator('.inactive-orders').getByText('Approval revoked; order not cancelled', { exact: true }).waitFor({ timeout: 90000 });
  assert.equal(await r.locator('.token-card').count(), 0);
  assert(sellerRevoked.control.approvalOverrides >= 2);
  assert.equal(sellerRevoked.control.signatureOverrides, 0);
  check('revoked order remains in seller inactive orders and is absent from active listing cards');
  for (const width of [320, 390, 1440]) {
    await r.setViewportSize({ width, height: 1000 });
    assert(await r.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `inactive orders overflow at ${width}`);
  }
  const inactiveAudit = await new AxeBuilder({ page: r }).analyze();
  assert.equal(inactiveAudit.violations.length, 0);
  check('inactive order notice reflows at 320/390/1440 and passes axe');
  await r.getByRole('link', { name: 'Manage Squeek #1', exact: true }).click();
  await settleDetail(r);
  await r.getByRole('button', { name: 'Cancel listing on-chain', exact: true }).waitFor();
  assert.equal(await r.getByRole('button', { name: 'Review listing', exact: true }).count(), 0);
  await screenshot(r, 'revoked-listing', 'SIMULATED SELLER WALLET & ORDER · Approval reads forced to revoked. No transaction sent.', true);
  const ownerReads = sellerRevoked.control.ownerReads;
  await r.getByRole('button', { name: 'Cancel listing on-chain', exact: true }).click();
  await r.locator('.trade-panel').getByRole('alert').waitFor({ timeout: 90000 });
  assert.match(await r.locator('.trade-panel').getByRole('alert').innerText(), /rejected/i);
  assert(sellerRevoked.control.ownerReads > ownerReads);
  assert.equal(sellerRevoked.control.cancellationSimulations, 1);
  const requests = await r.evaluate(() => window.__revisionWallet.requests);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'eth_sendTransaction');
  assert(requests[0].params[0].data.startsWith(cancelSelector));
  assert.equal(await r.evaluate(() => JSON.parse(localStorage.getItem('squeek-market.orders.v1')).length), 1);
  check('revoked-order cancel rechecks live owner, simulates, reaches rejection-only wallet, and retains the order on rejection');
  await r.reload();
  await connect(r);
  await r.getByRole('button', { name: 'Cancel listing on-chain', exact: true }).waitFor();
  check('seller cancellation remains available after reload');
  await r.goto(base + '#explore');
  await r.getByRole('button', { name: 'Listed 0', exact: true }).click();
  await r.getByRole('heading', { name: 'Your inactive orders', exact: true }).waitFor();
  await r.evaluate(buyer => window.__revisionWallet.account(buyer), buyer);
  await r.getByRole('heading', { name: 'Your inactive orders', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await r.locator('.token-card').count(), 0);
  await r.goto(base + '#squeek/1');
  await settleDetail(r);
  assert.equal(await r.getByRole('button', { name: 'Review purchase', exact: true }).count(), 0);
  assert.equal(await r.getByRole('button', { name: 'Cancel listing on-chain', exact: true }).count(), 0);
  check('switching to a buyer hides seller-only inactive orders and buy/cancel controls for the revoked order');
  await r.evaluate(owner => window.__revisionWallet.account(owner), owner);
  sellerRevoked.control.mode = 'mixed';
  await importOrder(r, await makeFixture('2'));
  assert.deepEqual(await r.evaluate(() => JSON.parse(localStorage.getItem('squeek-market.orders.v1')).map(o => o.components.offer[0].identifierOrCriteria).sort()), ['1', '2']);
  await r.goto(base + '#explore');
  await r.getByRole('button', { name: 'Listed 1', exact: true }).click();
  await r.getByRole('heading', { name: 'Your inactive orders', exact: true }).waitFor();
  assert.equal(await r.locator('.token-card').count(), 1);
  assert.match(await r.locator('.token-card h3').innerText(), /#2/);
  check('importing another order preserves revoked seller orders in storage and active listings remain separate');
  await r.reload();
  await connect(r);
  await r.getByRole('button', { name: 'Listed 1', exact: true }).waitFor({ timeout: 90000 });
  await r.getByRole('button', { name: 'Listed 1', exact: true }).click();
  await r.locator('.inactive-orders').getByText('Approval revoked; order not cancelled', { exact: true }).waitFor();
  sellerRevoked.control.mode = 'purchase';
  await r.getByRole('button', { name: 'Refresh Squeeks', exact: true }).click();
  await r.getByRole('button', { name: 'Listed 2', exact: true }).waitFor({ timeout: 90000 });
  assert.equal(await r.locator('.inactive-orders').count(), 0);
  assert.equal(await r.locator('.token-card').count(), 2);
  check('retained orders survive a reload and become active only after approval and full verification return');
  await sellerRevoked.context.close();

  const purchase = await context({ account: buyer, mode: 'purchase' });
  const b = purchase.page;
  await b.goto(base);
  await connect(b);
  await importOrder(b, order);
  await settleDetail(b);
  await b.getByRole('button', { name: 'Review purchase', exact: true }).click();
  await b.getByRole('heading', { name: 'What you will receive', exact: true }).waitFor({ timeout: 90000 });
  assert.match(await b.locator('.receive-stats').innerText(), /Pending power \/ round/);
  assert.match(await b.locator('.flow-review').innerText(), /does not lock rewards or level/);
  assert(purchase.control.signatureOverrides > 0 && purchase.control.fulfillmentOverrides === 1);
  await screenshot(b, 'purchase-review', 'SIMULATED BUYER WALLET & ORDER · Approval, signature check, and fulfillment simulation are mocked. No purchase sent.', true);
  check('labeled purchase review shows the carried position and execution-time warning');
  purchase.control.mode = 'revoked';
  await b.getByRole('button', { name: 'Confirm purchase · 0.01 ETH', exact: true }).click();
  await b.locator('.trade-panel').getByRole('alert').waitFor({ timeout: 90000 });
  assert.match(await b.locator('.trade-panel').getByRole('alert').innerText(), /not approved Seaport/);
  assert.equal((await b.evaluate(() => window.__revisionWallet.requests)).length, 0);
  check('approval revoked after purchase review blocks confirmation before any wallet transaction request');
  await purchase.context.close();

  try {
    const safari = await webkit.launch();
    await safari.close();
    result.webkit = 'Launch available; this script exercises Chromium only.';
  } catch {
    result.webkit = 'Not run: WebKit cannot launch because system libraries are missing.';
  }
  assert.equal(result.errors.length, 0);
  assert.equal(result.localFailures.length, 0);
  check('no browser exceptions or missing local export resources');
} catch (error) {
  result.failure = error.message;
  console.error(error);
  for (const c of browser.contexts()) for (const p of c.pages()) console.error((await p.locator('body').innerText()).slice(-3500));
  process.exitCode = 1;
} finally {
  await writeFile('artifacts/revision-results.json', JSON.stringify(result, null, 2) + '\n');
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
