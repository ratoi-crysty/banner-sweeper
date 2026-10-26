// Prototype for research ticket #8: run the real autoconsent library inside a Playwright page
// reached through `chromium.connect()` (Playwright protocol, like PLAYWRIGHT_HOST), with either
// only the bundled rules (stock check) or only ONE candidate rule (Verification).
//
// It never talks to PLAYWRIGHT_HOST: it starts a local browser server with `chromium.launchServer()`
// and connects to its ws endpoint, which exercises the same client/server protocol path.
//
//   CHROMIUM_PATH=/usr/bin/brave OUT_DIR=/tmp/ac-proto node docs/research/autoconsent-in-playwright/prototype.mjs
//
// Fixture: two local origins (127.0.0.1 and localhost are different sites, so the iframe is an
// out-of-process iframe under site isolation). The top page sends `script-src 'self'` CSP (no eval),
// contains a hidden Klaro marker (a code-based "dynamic" CMP that autoconsent always loads), and a
// fake banner whose Reject button sets a cookie + localStorage and a main-world global
// `window.Cookiebot = { declined: true }`, which the candidate rule's `test` step checks via the
// bundled `EVAL_COOKIEBOT_5` snippet (so a passing self-test proves the main-world eval bridge works).

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
// `exports` only exposes ".", "./heuristics" and the rules JSON, so locate dist/ via the main entry.
const distDir = path.dirname(require.resolve('@duckduckgo/autoconsent'));
const PLAYWRIGHT_BUNDLE = fs.readFileSync(path.join(distDir, 'autoconsent.playwright.js'), 'utf8');
const compactRules = require('@duckduckgo/autoconsent/rules/compact-rules.json');
const { filterCompactRules } = require('@duckduckgo/autoconsent');
// The npm tarball ships the repo's playwright/ folder (no "files" whitelist); a real implementation should vendor it.
const { injectIntoIsolatedWorld } = await import(pathToFileURL(path.join(distDir, '../playwright/isolated-world.mjs')).href);
const AUTOCONSENT_VERSION = require(path.join(distDir, '../package.json')).version;

// lib/cmps/all.ts (16.60.0): code-based CMPs that AutoConsent's constructor ALWAYS registers.
const DYNAMIC_CMP_NAMES = [
    'TrustArc-top', 'Cybotcookiebot', 'Sourcepoint-frame', 'consentmanager.net', 'Evidon',
    'Onetrust', 'Klaro', 'Uniconsent', 'Conversant', 'tiktok.com', 'Admiral',
];

const OUT_DIR = process.env.OUT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'ac-proto-'));
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || undefined;

// ---------------------------------------------------------------- fixture servers

const BANNER_JS = `
(() => {
  const banner = document.getElementById('bs-banner');
  const consented = document.cookie.includes('bs_consent=') || localStorage.getItem('bs_consent');
  if (consented) { window.Cookiebot = { declined: true }; return; }
  setTimeout(() => { banner.hidden = false; }, 300); // banners usually appear asynchronously
  document.getElementById('bs-reject').addEventListener('click', () => {
    document.cookie = 'bs_consent=rejected; path=/; max-age=3600; SameSite=None; Secure';
    document.cookie = 'bs_consent=rejected; path=/; max-age=3600';
    localStorage.setItem('bs_consent', 'rejected');
    sessionStorage.setItem('bs_seen', '1');
    window.Cookiebot = { declined: true };
    banner.hidden = true;
  });
})();`;

const bannerHtml = (label) => `
<div id="bs-banner" hidden style="position:fixed;bottom:0;left:0;right:0;padding:24px;background:#222;color:#fff">
  <p>${label}: we use cookies</p><button id="bs-accept">Accept all</button> <button id="bs-reject">Reject all</button>
</div>
<script src="/banner.js"></script>`;

function startServer(handler) {
    return new Promise((resolve) => {
        const server = http.createServer(handler);
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

const frameServer = await startServer((req, res) => {
    if (req.url.startsWith('/banner.js')) {
        res.writeHead(200, { 'content-type': 'text/javascript' }).end(BANNER_JS);
    } else {
        res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><body style="background:#eef">frame${bannerHtml('IFRAME')}</body>`);
    }
});
const FRAME_ORIGIN = `http://localhost:${frameServer.address().port}`;

const topServer = await startServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/banner.js') {
        res.writeHead(200, { 'content-type': 'text/javascript' }).end(BANNER_JS);
        return;
    }
    const inFrame = url.searchParams.get('scenario') === 'frame';
    res.writeHead(200, {
        'content-type': 'text/html',
        // No 'unsafe-eval' and no inline scripts: eval snippets must still run in the main world.
        'content-security-policy': "script-src 'self'",
    }).end(`<!doctype html><body><h1>Fixture</h1>
<div class="klaro"><div class="cookie-notice" style="display:none"></div></div>
${inFrame ? `<iframe src="${FRAME_ORIGIN}/frame.html" style="width:600px;height:300px"></iframe>` : bannerHtml('TOP')}
</body>`);
});
const TOP_ORIGIN = `http://127.0.0.1:${topServer.address().port}`;

// ---------------------------------------------------------------- candidate rules (autoconsent JSON)

const candidateRule = (name, runContext) => ({
    name,
    runContext,
    detectCmp: [{ exists: '#bs-banner' }],
    detectPopup: [{ visible: '#bs-banner' }],
    optOut: [{ waitForThenClick: '#bs-reject' }],
    optIn: [{ waitForThenClick: '#bs-accept' }],
    test: [{ eval: 'EVAL_COOKIEBOT_5' }], // window.Cookiebot.declined === true, main world only
});

// ---------------------------------------------------------------- the "background" stand-in

function baseConfig(overrides) {
    return {
        enabled: true,
        autoAction: null, // wait for us: screenshot "before", then send { type: 'optOut' }
        disabledCmps: [],
        enablePrehide: false, // prehide would hide the banner from the "before" screenshot
        enableCosmeticRules: true,
        enableGeneratedRules: true,
        enableHeuristicDetection: false,
        enablePopupMutationObserver: false,
        detectRetries: 20,
        isMainWorld: false,
        prehideTimeout: 2000,
        visualTest: false,
        logs: { lifecycle: false, rulesteps: false, detectionsteps: false, evals: false, errors: true, messages: false, waits: false },
        performanceLoggingEnabled: false,
        heuristicPopupSearchTimeout: 100,
        heuristicMode: 'off',
        ...overrides,
    };
}

class Bridge {
    constructor(rulesFor, config) {
        this.rulesFor = rulesFor;
        this.config = config;
        this.received = []; // { msg, target, at }
        this.evalTimings = [];
        this.waiters = [];
    }

    handler() {
        return async (msg, target) => {
            this.received.push({ msg, target, at: Date.now() });
            this.waiters = this.waiters.filter((w) => !(w.match(msg) && (w.resolve({ msg, target }), true)));
            switch (msg.type) {
                case 'init':
                    await target.send({ type: 'initResp', config: this.config, rules: this.rulesFor(msg.url, target.isMainFrame) });
                    break;
                case 'eval': {
                    const started = Date.now();
                    let result = false;
                    try {
                        result = await target.evalInMainWorld(msg.code);
                    } catch (e) {
                        this.evalError = String(e.message).split('\n')[0];
                    }
                    this.evalTimings.push({ snippetId: msg.snippetId, ms: Date.now() - started, result });
                    await target.send({ type: 'evalResp', id: msg.id, result });
                    break;
                }
            }
        };
    }

    waitFor(match, timeoutMs) {
        const hit = this.received.find((r) => match(r.msg));
        if (hit) return Promise.resolve(hit);
        return new Promise((resolve) => {
            const waiter = { match, resolve };
            this.waiters.push(waiter);
            setTimeout(() => {
                this.waiters = this.waiters.filter((w) => w !== waiter);
                resolve(null);
            }, timeoutMs);
        });
    }

    reset() {
        this.received = [];
        this.waiters = [];
    }

    summary() {
        return this.received
            .map((r) => r.msg)
            .filter((m) => !['report', 'init', 'eval'].includes(m.type))
            .map((m) => `${m.type}${m.cmp ? `:${m.cmp}` : ''}${'result' in m ? `=${m.result}` : ''}${m.url ? ` @${new URL(m.url).host}` : ''}`);
    }
}

async function wire(page, mode, bridge) {
    const handle = bridge.handler();
    if (mode === 'isolated') {
        // Same as autoconsent's own runner on Chromium: CDP isolated world per frame, incl. OOPIF sessions.
        await injectIntoIsolatedWorld(
            page,
            (transport) => (msg, frameRef) =>
                handle(msg, {
                    send: (m) => transport.sendToContentScript(frameRef, m),
                    evalInMainWorld: (code) => transport.evalInMainWorld(frameRef, code),
                    isMainFrame: transport.isMainFrame(frameRef),
                    frameRef,
                }),
            PLAYWRIGHT_BUNDLE,
        );
    } else {
        // Main-world variant: binding + init script; both apply to every frame (incl. cross-origin).
        await page.exposeBinding('autoconsentSendMessage', ({ frame }, msg) =>
            handle(msg, {
                send: (m) => frame.evaluate((mm) => window.autoconsentReceiveMessage(mm), m).catch(() => {}),
                evalInMainWorld: (code) => frame.evaluate(code),
                isMainFrame: frame.parentFrame() === null,
                frameRef: frame.url(),
            }),
        );
        await page.addInitScript({ content: PLAYWRIGHT_BUNDLE });
    }
}

// ---------------------------------------------------------------- snapshots + diff

async function snapshot(page, context, name) {
    const file = path.join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: file }); // `path` is written by the client process, also over connect()
    const state = await context.storageState({ indexedDB: true });
    const sessionStorage = {};
    for (const frame of page.frames()) {
        try {
            sessionStorage[new URL(frame.url()).origin] = await frame.evaluate(() => ({ ...window.sessionStorage }));
        } catch {
            // detached frame or opaque origin
        }
    }
    return { file, cookies: state.cookies, origins: state.origins, sessionStorage };
}

function diffSnapshots(a, b) {
    const key = (c) => `${c.name}|${c.domain}|${c.path}`;
    const before = new Map(a.cookies.map((c) => [key(c), c.value]));
    const after = new Map(b.cookies.map((c) => [key(c), c.value]));
    const cookies = {
        added: [...after.keys()].filter((k) => !before.has(k)),
        removed: [...before.keys()].filter((k) => !after.has(k)),
        changed: [...after.keys()].filter((k) => before.has(k) && before.get(k) !== after.get(k)),
    };
    const ls = (s) => Object.fromEntries(s.origins.map((o) => [o.origin, Object.fromEntries(o.localStorage.map((e) => [e.name, e.value]))]));
    const lsA = ls(a);
    const lsB = ls(b);
    const localStorage = {};
    for (const origin of new Set([...Object.keys(lsA), ...Object.keys(lsB)])) {
        const x = lsA[origin] || {};
        const y = lsB[origin] || {};
        const changes = Object.keys({ ...x, ...y }).filter((k) => x[k] !== y[k]);
        if (changes.length) localStorage[origin] = changes.map((k) => `${k}: ${x[k] ?? '∅'} -> ${y[k] ?? '∅'}`);
    }
    const sessionStorage = {};
    for (const origin of new Set([...Object.keys(a.sessionStorage), ...Object.keys(b.sessionStorage)])) {
        const x = a.sessionStorage[origin] || {};
        const y = b.sessionStorage[origin] || {};
        const changes = Object.keys({ ...x, ...y }).filter((k) => x[k] !== y[k]);
        if (changes.length) sessionStorage[origin] = changes;
    }
    return { cookies, localStorage, sessionStorage };
}

// ---------------------------------------------------------------- runs

async function stockRun(browser, mode) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const bridge = new Bridge(
        (url, mainFrame) => ({ autoconsent: [], compact: filterCompactRules(compactRules, { url, mainFrame }) }),
        baseConfig({ autoAction: 'optOut' }),
    );
    await wire(page, mode, bridge);
    await page.goto(`${TOP_ORIGIN}/top.html?scenario=top`, { waitUntil: 'domcontentloaded' });
    await bridge.waitFor((m) => m.type === 'popupFound', 6000);
    const result = { mode, run: 'stock', messages: bridge.summary() };
    await context.close();
    return result;
}

async function verificationRun(browser, mode, scenario) {
    const rule =
        scenario === 'top'
            ? candidateRule('bs-candidate-top', { main: true, frame: false })
            : candidateRule('bs-candidate-frame', { main: false, frame: true, urlPattern: `^${FRAME_ORIGIN}/` });
    const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const page = await context.newPage();
    const bridge = new Bridge(() => ({ autoconsent: [rule] }), baseConfig({ disabledCmps: DYNAMIC_CMP_NAMES }));
    await wire(page, mode, bridge);
    const t0 = Date.now();
    await page.goto(`${TOP_ORIGIN}/top.html?scenario=${scenario}`, { waitUntil: 'domcontentloaded' });

    const out = { mode, run: `verify-${scenario}`, rule: rule.name };
    const popup = await bridge.waitFor((m) => m.type === 'popupFound' && m.cmp === rule.name, 20000);
    out.popupFoundMs = popup ? Date.now() - t0 : null;
    if (!popup) {
        out.messages = bridge.summary();
        await context.close();
        return out;
    }
    const before = await snapshot(page, context, `${mode}-${scenario}-before`);

    await popup.target.send({ type: 'optOut' }); // sent to the exact frame that found the popup
    const optOut = await bridge.waitFor((m) => m.type === 'optOutResult', 15000);
    out.optOutResult = optOut?.msg.result ?? null;
    const done = await bridge.waitFor((m) => m.type === 'autoconsentDone', 5000);
    out.autoconsentDone = !!done;
    if (optOut?.msg.scheduleSelfTest) {
        await optOut.target.send({ type: 'selfTest' });
        const selfTest = await bridge.waitFor((m) => m.type === 'selfTestResult', 10000);
        out.selfTestResult = selfTest?.msg.result ?? null;
    }
    const after = await snapshot(page, context, `${mode}-${scenario}-after`);
    out.diff = diffSnapshots(before, after);
    out.evalTimings = bridge.evalTimings;
    if (bridge.evalError) out.evalError = bridge.evalError;
    out.messages = bridge.summary();

    // Reload in the same context: the content script is re-injected automatically by both wirings.
    bridge.reset();
    await page.reload({ waitUntil: 'domcontentloaded' });
    const detected = await bridge.waitFor((m) => m.type === 'cmpDetected' && m.cmp === rule.name, 10000);
    // detectPopup polls 10 x 500ms after detection; give it the whole window before declaring "gone".
    const reappeared = await bridge.waitFor((m) => m.type === 'popupFound', detected ? 7000 : 1000);
    await snapshot(page, context, `${mode}-${scenario}-after-reload`);
    out.afterReload = { cmpDetected: !!detected, popupFound: !!reappeared, messages: bridge.summary() };
    await context.close();
    return out;
}

// ---------------------------------------------------------------- main

const server = await chromium.launchServer({ executablePath: CHROMIUM_PATH, headless: true });
const browser = await chromium.connect(server.wsEndpoint()); // same API as chromium.connect(PLAYWRIGHT_HOST)
console.log(`autoconsent ${AUTOCONSENT_VERSION}, browser ${browser.version()}, out ${OUT_DIR}`);
try {
    const results = [];
    for (const mode of ['main', 'isolated']) {
        results.push(await stockRun(browser, mode));
        results.push(await verificationRun(browser, mode, 'top'));
        results.push(await verificationRun(browser, mode, 'frame'));
    }
    console.log(JSON.stringify(results, null, 2));
} finally {
    await browser.close();
    await server.close();
    topServer.close();
    frameServer.close();
}
