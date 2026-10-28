// Screens Sites for the Detection test set: does the Site show a Consent Banner, and do the
// Bundled Rules (stock autoconsent, the extension's exact config) Decline it?
//   node screen.mjs <repoRoot> <domains.txt> <from> <count> <outDir>
// Writes <outDir>/results.jsonl (appends) and <outDir>/shots/<domain>.jpg.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const [, , repoRoot, domainsPath, fromText, countText, outDir] = process.argv;
const WS = process.env.PLAYWRIGHT_WS || 'ws://localhost:8080/';
const CONCURRENCY = Number(process.env.CONCURRENCY || 4);

const require = createRequire(path.join(repoRoot, 'package.json'));
const distDir = path.dirname(require.resolve('@duckduckgo/autoconsent'));
const BUNDLE = fs.readFileSync(path.join(distDir, 'autoconsent.playwright.js'), 'utf8');
const compactRules = require('@duckduckgo/autoconsent/rules/compact-rules.json');
const { filterCompactRules } = require('@duckduckgo/autoconsent');
const { injectIntoIsolatedWorld } = await import(pathToFileURL(path.join(distDir, '../playwright/isolated-world.mjs')).href);
const { DETECT_PATTERNS } = await import(pathToFileURL(path.join(distDir, 'heuristics.mjs')).href);
// DETECT_PATTERNS misses many CMP texts (e.g. Sourcepoint's "store and/or retrieve"), so add broad
// consent keywords; every kept miss is reviewed by screenshot anyway.
const EXTRA_PATTERNS = [
    /cookie/,
    /\b(consent|einwillig|zustimm|consentement|consenso|consentimiento|consentimento|toestemming|samtycke|samtykke|suostum|souhlas|súhlas|zgod[ay]|hozzájárul|συγκατάθεση|συναίνεση|acord(ul)?)\b/,
    /(datenschutz|privacy|confidentialit|privacidad|prywatnoś|adatvédelm|ochrana osobních|ochrana súkromia|απόρρητ)/,
];
const PATTERN_SOURCES = [...DETECT_PATTERNS, ...EXTRA_PATTERNS].map((p) => p.source);

// apps/extension/src/background/services/auto-consent-background.ts, verbatim
const EXTENSION_CONFIG = {
    enabled: true,
    autoAction: 'optOut',
    disabledCmps: [],
    enablePrehide: true,
    enableCosmeticRules: true,
    enableGeneratedRules: true,
    enableHeuristicDetection: false,
    enablePopupMutationObserver: false,
    detectRetries: 20,
    isMainWorld: false,
    prehideTimeout: 2000,
    visualTest: false,
    logs: { lifecycle: false, rulesteps: false, evals: false, errors: false, messages: false, detectionsteps: false, waits: false },
    performanceLoggingEnabled: false,
    heuristicPopupSearchTimeout: 100,
    heuristicMode: 'off',
};

const CONTEXT_OPTIONS = {
    viewport: { width: 1280, height: 800 },
    locale: 'en-GB',
    timezoneId: 'Europe/Bucharest',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
};

// Script hosts → CMP, for the "CMP if known" column. First match wins.
const CMP_HOSTS = [
    [/cookiebot\.(com|eu)|consent\.cookiebot/, 'Cookiebot'],
    [/cookielaw\.org|onetrust\.(com|eu)/, 'OneTrust'],
    [/didomi\.io|privacy-center\.org/, 'Didomi'],
    [/usercentrics\.(eu|com)/, 'Usercentrics'],
    [/quantcast|cmp\.inmobi\.com|choice\.inmobi/, 'InMobi Choice'],
    [/sourcepoint|sp-prod\.net|privacy-mgmt\.com/, 'Sourcepoint'],
    [/trustarc|truste\.com/, 'TrustArc'],
    [/iubenda\.com/, 'iubenda'],
    [/cookieyes\.com/, 'CookieYes'],
    [/consentmanager\.(net|de)|consensu\.org/, 'consentmanager'],
    [/axept\.io|axeptio/, 'Axeptio'],
    [/tarteaucitron/, 'tarteaucitron'],
    [/cookiefirst\.com/, 'CookieFirst'],
    [/osano\.com/, 'Osano'],
    [/termly\.io/, 'Termly'],
    [/cookie-script\.com/, 'Cookie-Script'],
    [/fundingchoicesmessages\.google\.com/, 'Google Funding Choices'],
    [/sirdata\.(com|io|net)/, 'Sirdata'],
    [/ogury|lemonpi/, 'Ogury'],
    [/tagcommander|commander[s1]\.|trustcommander/, 'Commanders Act'],
    [/cmp\.seznam\.cz/, 'Seznam CMP'],
    [/ezoic|ezojs/, 'Ezoic'],
    [/clickio|consent\.clickio/, 'Clickio'],
    [/admiral|getadmiral/, 'Admiral'],
    [/evidon|crownpeak/, 'Crownpeak'],
    [/cookiehub\.(net|eu)/, 'CookieHub'],
    [/complianz/, 'Complianz'],
    [/borlabs/, 'Borlabs'],
    [/klaro/, 'Klaro'],
    [/consentframework|appconsent|sfbx/, 'AppConsent'],
    [/gdpr\.(cmp\.)?(gemius|wp\.pl)|cmp\.wp\.pl|wpimg/, 'WP CMP'],
    [/cookieinformation\.com|policy\.app\.cookieinformation/, 'Cookie Information'],
    [/piano\.io|tinypass/, 'Piano'],
];

// Runs in every frame: popup-like elements (fixed/sticky/high z-index, visible) whose text matches
// autoconsent's own multi-language DETECT_PATTERNS. Walks open shadow roots. Child frames match on
// body text, since the banner inside a CMP iframe usually isn't positioned itself.
function scanFrame({ sources, isMain }) {
    const patterns = sources.map((s) => new RegExp(s, 'i'));
    const matches = (text) => !!text && text.length < 8000 && patterns.some((p) => p.test(text));
    const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 80 && r.height > 30 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05
            && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    };
    const hits = [];
    const walk = (root, inShadow) => {
        for (const el of root.querySelectorAll('*')) {
            if (el.shadowRoot) walk(el.shadowRoot, true);
            const s = getComputedStyle(el);
            const positioned = s.position === 'fixed' || s.position === 'sticky' || (s.position === 'absolute' && Number(s.zIndex) >= 100);
            if (!positioned || !visible(el)) continue;
            const text = (el.innerText || el.shadowRoot?.textContent || '').trim();
            if (matches(text)) {
                const r = el.getBoundingClientRect();
                hits.push({ inShadow, area: Math.round(r.width * r.height), text: text.replace(/\s+/g, ' ').slice(0, 200) });
            }
        }
    };
    walk(document, false);
    if (!isMain && hits.length === 0) {
        const text = (document.body?.innerText || '').trim();
        if (matches(text) && innerWidth > 80 && innerHeight > 30) hits.push({ inShadow: false, area: innerWidth * innerHeight, text: text.replace(/\s+/g, ' ').slice(0, 200) });
    }
    const challenge = /just a moment|verify you are human|checking your browser|attention required|access denied/i.test(document.title + ' ' + (document.body?.innerText || '').slice(0, 500));
    return { hits, lang: document.documentElement.lang || null, title: document.title, challenge };
}

async function scanPage(page) {
    const main = page.mainFrame();
    const found = [];
    let meta = { lang: null, title: '', challenge: false };
    for (const frame of page.frames()) {
        const isMain = frame === main;
        if (!isMain) {
            const box = await frame.frameElement().then((h) => h.boundingBox()).catch(() => null);
            if (!box || box.width < 80 || box.height < 30) continue;
        }
        const result = await frame.evaluate(scanFrame, { sources: PATTERN_SOURCES, isMain }).catch(() => null);
        if (!result) continue;
        if (isMain) meta = result;
        const origin = (u) => {
            try {
                return new URL(u).origin;
            } catch {
                return null;
            }
        };
        const crossOrigin = !isMain && origin(frame.url()) !== origin(main.url());
        for (const hit of result.hits) found.push({ ...hit, frame: isMain ? 'top' : crossOrigin ? 'cross-origin-iframe' : 'same-origin-iframe', frameUrl: isMain ? undefined : frame.url() });
    }
    found.sort((a, b) => b.area - a.area);
    return { banner: found[0] ?? null, hits: found.length, ...meta };
}

class Bridge {
    constructor() {
        this.received = [];
        this.waiters = [];
    }
    handler() {
        return async (msg, target) => {
            this.received.push({ msg, at: Date.now() });
            this.waiters = this.waiters.filter((w) => !(w.match(msg) && (w.resolve(msg), true)));
            if (msg.type === 'init') {
                const compact = filterCompactRules(compactRules, { url: msg.url, mainFrame: target.isMainFrame });
                await target.send({ type: 'initResp', config: EXTENSION_CONFIG, rules: { autoconsent: [], compact } }).catch(() => {});
            } else if (msg.type === 'eval') {
                // Like the extension: only bundled snippets run, ignore anything else
                const result = msg.snippetId ? await target.evalInMainWorld(msg.code).catch(() => false) : false;
                await target.send({ type: 'evalResp', id: msg.id, result: result === true }).catch(() => {});
            }
        };
    }
    waitFor(match, ms) {
        const hit = this.received.find((r) => match(r.msg));
        if (hit) return Promise.resolve(hit.msg);
        return new Promise((resolve) => {
            const w = { match, resolve };
            this.waiters.push(w);
            setTimeout(() => {
                this.waiters = this.waiters.filter((x) => x !== w);
                resolve(null);
            }, ms);
        });
    }
    reset() {
        this.received = [];
    }
    log() {
        return this.received
            .map((r) => r.msg)
            .filter((m) => !['init', 'eval', 'report', 'visualDelay'].includes(m.type))
            .map((m) => `${m.type}${m.cmp ? `:${m.cmp}` : ''}${'result' in m ? `=${m.result}` : ''}${'isCosmetic' in m ? ` cosmetic=${m.isCosmetic}` : ''}`);
    }
    lifecycle() {
        const reports = this.received.filter((r) => r.msg.type === 'report');
        return reports.at(-1)?.msg.state?.lifecycle ?? null;
    }
}

const settle = async (page) => {
    await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(5000);
};

async function open(page, domain) {
    for (const url of [`https://www.${domain}/`, `https://${domain}/`]) {
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            return page.url();
        } catch (e) {
            var lastError = e;
        }
    }
    throw lastError;
}

async function lookPass(browser, domain, shotsDir) {
    const context = await browser.newContext(CONTEXT_OPTIONS);
    try {
        const page = await context.newPage();
        const hosts = new Set();
        page.on('request', (r) => {
            try {
                hosts.add(new URL(r.url()).host);
            } catch {}
        });
        const url = await open(page, domain);
        await settle(page);
        const scan = await scanPage(page);
        const shot = path.join(shotsDir, `${domain}.jpg`);
        await page.screenshot({ path: shot, type: 'jpeg', quality: 50, scale: 'css', timeout: 5000 });
        const hostList = [...hosts];
        const cmp = CMP_HOSTS.find(([re]) => hostList.some((h) => re.test(h)))?.[1] ?? null;
        return { url, cmpByHost: cmp, ...scan };
    } finally {
        await context.close().catch(() => {});
    }
}

async function stockPass(browser, url) {
    const context = await browser.newContext(CONTEXT_OPTIONS);
    try {
        const page = await context.newPage();
        const bridge = new Bridge();
        const handle = bridge.handler();
        await injectIntoIsolatedWorld(
            page,
            (transport) => (msg, frameRef) =>
                handle(msg, {
                    send: (m) => transport.sendToContentScript(frameRef, m),
                    evalInMainWorld: (code) => transport.evalInMainWorld(frameRef, code),
                    isMainFrame: transport.isMainFrame(frameRef),
                }),
            BUNDLE,
        );
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const out = {};
        const detected = await bridge.waitFor((m) => m.type === 'cmpDetected', 25000);
        out.cmpDetected = detected?.cmp ?? null;
        const popup = detected ? await bridge.waitFor((m) => m.type === 'popupFound', 25000) : null;
        out.popupFound = popup?.cmp ?? null;
        if (popup) {
            const optOut = await bridge.waitFor((m) => m.type === 'optOutResult', 45000);
            out.optOutResult = optOut?.result ?? null;
            const done = optOut?.result ? await bridge.waitFor((m) => m.type === 'autoconsentDone', 45000) : null;
            out.cosmetic = done ? done.isCosmetic : null;
        }
        out.log = bridge.log();
        if (out.optOutResult && out.cosmetic === false) {
            await page.waitForTimeout(1500);
            out.afterScan = (await scanPage(page)).banner;
            bridge.reset();
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
            const again = await bridge.waitFor((m) => m.type === 'cmpDetected', 10000);
            // Only the CMP that Declined counts; unrelated cosmetic rules may still pop up on reload
            out.reloadPopupFound = !!(await bridge.waitFor((m) => m.type === 'popupFound' && m.cmp === popup.cmp, again ? 7000 : 1000));
            await settle(page);
            out.reloadScan = (await scanPage(page)).banner;
            out.reloadLog = bridge.log();
        }
        out.lifecycle = bridge.lifecycle();
        return out;
    } finally {
        await context.close().catch(() => {});
    }
}

// The same banner, not just any consent-ish text (sticky navs with a "Privacy" link match too)
const sameBanner = (a, b) => !!a && !!b && a.text.slice(0, 60) === b.text.slice(0, 60);

function classify(stock, lookBanner) {
    if (!stock.cmpDetected) return 'nothingDetected';
    if (!stock.popupFound) return 'detectedNoPopup';
    if (!stock.optOutResult) return 'optOutFailed';
    if (stock.cosmetic !== false) return 'cosmeticOnly';
    if (sameBanner(stock.afterScan, lookBanner)) return 'stillVisible';
    if (stock.reloadPopupFound || sameBanner(stock.reloadScan, lookBanner)) return 'reappeared';
    return 'covered';
}

const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), ms))]);

async function screen(browser, domain, shotsDir) {
    const row = { domain, screenedAt: new Date().toISOString() };
    try {
        row.look = await withTimeout(lookPass(browser, domain, shotsDir), 90000, 'look');
        if (row.look.challenge) return { ...row, verdict: 'blocked' };
        if (!row.look.banner) return { ...row, verdict: 'noBanner' };
        row.stock = await withTimeout(stockPass(browser, row.look.url), 180000, 'stock');
        const outcome = classify(row.stock, row.look.banner);
        return { ...row, verdict: outcome === 'covered' ? 'covered' : 'miss', missReason: outcome === 'covered' ? undefined : outcome };
    } catch (e) {
        return { ...row, verdict: 'error', error: String(e.message).split('\n')[0] };
    }
}

const domains = fs.readFileSync(domainsPath, 'utf8').split('\n').filter(Boolean).slice(Number(fromText), Number(fromText) + Number(countText));
const shotsDir = path.join(outDir, 'shots');
fs.mkdirSync(shotsDir, { recursive: true });
const browser = await chromium.connect(WS);
const queue = [...domains];
const tally = {};
await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length) {
            const domain = queue.shift();
            const row = await screen(browser, domain, shotsDir);
            fs.appendFileSync(path.join(outDir, 'results.jsonl'), JSON.stringify(row) + '\n');
            tally[row.verdict] = (tally[row.verdict] || 0) + 1;
            console.log(`${row.verdict.padEnd(9)} ${row.missReason ?? ''} ${domain}`);
        }
    }),
);
await browser.close();
console.log(JSON.stringify(tally));
