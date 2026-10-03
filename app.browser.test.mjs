import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({ configLoader: "native", server: { host: "127.0.0.1", port: 4178 }, logLevel: "error" });
await server.listen();
const address = server.httpServer.address();
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  const forbiddenRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith(origin) && !request.url().startsWith("https://tiles.openfreemap.org/") && !request.url().startsWith("https://cdn.jsdelivr.net/")) forbiddenRequests.push(request.url());
  });
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  await page.goto(`${origin}/index.html`);
  assert.match(await page.title(), /public desktop demo/);
  assert.match(await page.locator(".demo-topbar").innerText(), /rough, stripped-down preview/i);
  assert.match(await page.locator(".demo-topbar").innerText(), /DAG-planned specialist workers/i);
  assert.equal(await page.getByRole("link", { name: /Email Joel for a real demonstration/ }).isVisible(), true);
  await page.getByRole("button", { name: "What the actual AI can do" }).click();
  const about = page.getByRole("dialog", { name: "About Jahaziel" });
  assert.match(await about.innerText(), /dependency graph/);
  assert.equal(await about.locator(".demo-capability-card").count(), 9);
  assert.match(await about.innerText(), /New Outlook processing still needs a supported transport/);
  await page.screenshot({ path: join(tmpdir(), "jahaziel-public-about-desktop.png"), fullPage: false });
  await about.getByRole("button", { name: "Close" }).click();
  assert.match(await page.locator(".demo-compose-meta").innerText(), /Local AI not loaded/);
  assert.equal(await page.getByRole("button", { name: "Start local AI" }).isVisible(), true);
  assert.equal(await page.locator(".demo-example-prompts button").count(), 2);
  await page.getByRole("button", { name: "Open App Center" }).click();
  assert.equal(await page.getByRole("dialog", { name: "App library" }).locator(".desktop-library-row").count(), 25);
  await page.getByRole("dialog", { name: "App library" }).getByRole("button", { name: /Code/ }).click();
  assert.match(await page.getByRole("dialog", { name: "Code" }).innerText(), /Blocked in this demo/);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(tmpdir(), "jahaziel-public-app-preview.png"), fullPage: false });
  await page.getByRole("button", { name: "Open App Center" }).click();
  await page.getByRole("dialog", { name: "App library" }).getByRole("button", { name: /Memory/ }).click();
  await page.getByPlaceholder("What should Jahaziel remember?").fill("I like robotics");
  await page.getByRole("dialog", { name: "Memory" }).getByRole("button", { name: "Save" }).click();
  assert.match(await page.getByRole("dialog", { name: "Memory" }).innerText(), /I like robotics/);
  await page.reload();
  await page.getByRole("button", { name: "Open App Center" }).click();
  await page.getByRole("dialog", { name: "App library" }).getByRole("button", { name: /Memory/ }).click();
  assert.match(await page.getByRole("dialog", { name: "Memory" }).innerText(), /I like robotics/);
  await page.getByRole("dialog", { name: "Memory" }).getByRole("button", { name: "Forget" }).click();
  assert.doesNotMatch(await page.getByRole("dialog", { name: "Memory" }).innerText(), /I like robotics/);
  await page.getByRole("button", { name: "Open Map" }).click();
  await page.locator(".demo-map-canvas canvas").waitFor({ timeout: 15000 });
  assert.equal(await page.getByRole("dialog", { name: "Map" }).isVisible(), true);
  await page.getByRole("button", { name: "Open App Center" }).click();
  await page.getByRole("dialog", { name: "App library" }).getByRole("button", { name: /Customize/ }).click();
  assert.match(await page.getByRole("dialog", { name: "Customize" }).innerText(), /Make it yours/i);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, "mobile app must not overflow");
  assert.equal(await page.getByRole("link", { name: /Email Joel for a real demonstration/ }).isVisible(), true, "mobile visitors must see the full-demo invitation");
  await page.getByRole("button", { name: "What the actual AI can do" }).click();
  await page.waitForTimeout(250);
  const aboutMobile = await page.getByRole("dialog", { name: "About Jahaziel" }).boundingBox();
  assert(aboutMobile && aboutMobile.x >= -1 && aboutMobile.x + aboutMobile.width <= 391, "mobile About window must fit horizontally");
  assert(aboutMobile.y >= 186, "mobile About window must remain below the warning banner");
  await page.screenshot({ path: join(tmpdir(), "jahaziel-public-about-mobile.png"), fullPage: false });
  assert.deepEqual(forbiddenRequests, [], "public desktop must not contact account or backend services before explicit AI loading");
  if (process.env.SHOWCASE_APP_SCREENSHOT_PREFIX) await page.screenshot({ path: `${process.env.SHOWCASE_APP_SCREENSHOT_PREFIX}-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.getByRole("button", { name: "Open App Center" }).click();
  await page.getByRole("dialog", { name: "App library" }).getByRole("button", { name: /^Chat Talk/ }).click();
  if (process.env.SHOWCASE_APP_SCREENSHOT_PREFIX) await page.screenshot({ path: `${process.env.SHOWCASE_APP_SCREENSHOT_PREFIX}-desktop.png`, fullPage: true });
  await page.evaluate(() => localStorage.setItem("jahaziel-public-desktop-messages", JSON.stringify([
    { role: "user", content: "Can you read my email?" },
    { role: "assistant", content: "Yes, I can read your email. What would you like to know?" },
  ])));
  await page.reload();
  assert.match(await page.locator(".demo-message-correction").innerText(), /Incorrect older demo reply/);
  console.log("Public desktop served UI, persistence, map, theme, and mobile proof: PASS");
} finally {
  await browser.close();
  await server.close();
}
