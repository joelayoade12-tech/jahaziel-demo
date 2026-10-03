import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { preview } from "vite";

// Optional live check: uses the built site and real public tiles, so it is not part of offline CI.
const server = await preview({ configLoader: "native", preview: { host: "127.0.0.1", port: 4179 } });
const address = server.httpServer.address();
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["geolocation"], geolocation: { longitude: -83.0153, latitude: 40.0017 } });
  const page = await context.newPage();
  const failures = [];
  page.on("requestfailed", (request) => failures.push(`${request.url()}: ${request.failure()?.errorText || "failed"}`));
  page.on("pageerror", (error) => failures.push(`page: ${error.stack || error.message}`));
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await page.getByRole("button", { name: "Open App Center" }).click();
  await page.getByRole("dialog", { name: "App library" }).getByRole("button", { name: /Map/ }).click();
  const mapPanel = page.getByRole("dialog", { name: "Map" });
  try { await mapPanel.getByText("Map ready. Pan, zoom, or enable Pin mode.").waitFor({ timeout: 30000 }); }
  catch (error) { throw new Error(`${error.message}\nStatus: ${await mapPanel.locator(".demo-map-event-status").innerText()}\nFailures: ${failures.join("\n")}`); }
  const canvas = mapPanel.locator(".demo-map-canvas canvas");
  assert((await canvas.boundingBox())?.width > 300, "map canvas is visible");
  await mapPanel.getByRole("button", { name: "Locate me" }).click();
  await mapPanel.getByText(/Showing your location for this visit/).waitFor({ timeout: 15000 });
  assert.equal(await mapPanel.locator(".demo-map-me").count(), 1);
  await mapPanel.getByRole("button", { name: /Layers/ }).click();
  await mapPanel.getByRole("button", { name: /Pin mode/ }).click();
  await canvas.click({ position: { x: 220, y: 170 } });
  try { await mapPanel.getByText(/^Demo pin:/).waitFor({ timeout: 5000 }); }
  catch (error) { throw new Error(`${error.message}\nStatus: ${await mapPanel.locator(".demo-map-event-status").innerText()}\nFailures: ${failures.join("\n")}`); }
  assert.match(await mapPanel.locator(".demo-map-event-status").innerText(), /Demo pin: [\d.-]+, [\d.-]+/);
  assert.deepEqual(failures.filter((item) => item.includes("maplibre-gl-worker")), [], "built map worker must load");
  const screenshotPath = process.env.SHOWCASE_MAP_SCREENSHOT || join(tmpdir(), "jahaziel-public-map-dark.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Map visual proof: ${screenshotPath}`);
  console.log("Built public map: dark 3D style, live tiles, opt-in location, and click-to-pin worked: PASS");
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
