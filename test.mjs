import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({ configLoader: "native", server: { host: "127.0.0.1", port: 4178 }, logLevel: "error" });
await server.listen();
const address = server.httpServer.address();
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  const forbidden = [];
  page.on("request", (request) => { if (!request.url().startsWith(origin) && !request.url().startsWith("https://cdn.jsdelivr.net/") && !request.url().startsWith("https://tiles.openfreemap.org/")) forbidden.push(request.url()); });
  await page.goto(`${origin}/index.html`);
  await page.waitForSelector('.hub-avatar-wrap canvas[role="button"]');
  assert.match(await page.title(), /public desktop demo/i);
  assert.match(await page.locator(".demo-topbar").innerText(), /rough, stripped-down preview/i);
  assert.equal(await page.getByRole("dialog", { name: "Chat" }).isVisible(), true);
  assert.equal(await page.locator(".demo-topbar a").getAttribute("href"), "mailto:joelayoade12@gmail.com?subject=Full%20Jahaziel%20demonstration");
  if (process.env.SHOWCASE_SCREENSHOT_PREFIX) await page.screenshot({ path: `${process.env.SHOWCASE_SCREENSHOT_PREFIX}-desktop.png`, fullPage: false });
  await page.getByRole("button", { name: "Open App Center" }).click();
  assert.equal(await page.getByRole("dialog", { name: "App library" }).isVisible(), true);
  await page.getByPlaceholder("Search apps").fill("map");
  assert.equal(await page.getByRole("dialog", { name: "App library" }).locator('.desktop-library-row').count(), 1);
  await page.getByRole("dialog", { name: "App library" }).getByRole("button", { name: /Map/ }).click();
  assert.equal(await page.getByRole("dialog", { name: "Map" }).isVisible(), true);
  await page.getByRole("dialog", { name: "Map" }).getByRole("button", { name: "Close" }).click();
  await page.getByRole("dialog", { name: "Chat" }).getByRole("button", { name: "Close" }).click();
  await page.locator('.hub-avatar-wrap canvas[role="button"]').click();
  assert.equal(await page.getByRole("menu", { name: "Jahaziel ring apps" }).getByRole("menuitem").count(), 8);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, "mobile desktop must not overflow horizontally");
  assert.deepEqual(forbidden, [], "desktop must not contact account or backend services before loading AI");
  if (process.env.SHOWCASE_SCREENSHOT_PREFIX) await page.screenshot({ path: `${process.env.SHOWCASE_SCREENSHOT_PREFIX}-mobile.png`, fullPage: false });
  console.log("Public desktop appearance, app ring, app library, contact, and map launch: PASS");
} finally { await browser.close(); await server.close(); }
