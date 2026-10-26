import { chromium } from 'playwright-core';
const [url, buttonRe] = process.argv.slice(2);
const b = await chromium.connect('ws://localhost:8080/');
const c = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-GB', timezoneId: 'Europe/Bucharest' });
const p = await c.newPage();
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(6000);
const re = new RegExp(buttonRe, 'i');
let clicked = null;
for (const f of p.frames()) {
  const btn = f.getByText(re).first();
  if (await btn.isVisible().catch(() => false)) { clicked = await btn.innerText(); await btn.click(); break; }
}
console.log('clicked:', clicked);
await p.waitForTimeout(3000);
const cookies = (await c.cookies()).map((k) => k.name);
console.log('cookies:', cookies.join(', '));
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(6000);
let again = false;
for (const f of p.frames()) if (await f.getByText(re).first().isVisible().catch(() => false)) again = true;
console.log('reject button visible after reload:', again);
await p.screenshot({ path: process.argv[4], type: 'jpeg', quality: 50 });
await b.close();
