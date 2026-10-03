import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";
import { APPS } from "./demo-src/catalog.ts";

const server = await createServer({ configLoader: "native", server: { host: "127.0.0.1", port: 4181 }, logLevel: "error" });
await server.listen();
const address = server.httpServer.address();
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`http://127.0.0.1:${address.port}/`);
  const previewApps = APPS.filter((app) => !["chat", "map", "memory", "customize", "about"].includes(app.id));
  for (const app of previewApps) {
    await page.getByRole("button", { name: "Open App Center" }).click();
    await page.getByRole("dialog", { name: "App library" }).locator(".desktop-library-row").nth(APPS.findIndex((item) => item.id === app.id)).locator("button").click();
    const panel = page.getByRole("dialog", { name: app.label, exact: true });
    await panel.getByText("Blocked in this demo").waitFor();
    assert.match(await panel.innerText(), /public|private|full/i);
    await panel.getByRole("button", { name: "Close" }).click();
  }
  console.log(`All ${previewApps.length} private-service dashboards opened with honest public previews: PASS`);
} finally {
  await browser.close();
  await server.close();
}
