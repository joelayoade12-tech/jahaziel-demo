import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { createServer, preview } from "vite";

const production = process.argv.includes("--production");
const server = production
  ? await preview({ configLoader: "native", preview: { host: "127.0.0.1", port: 4180 }, logLevel: "error" })
  : await createServer({ configLoader: "native", server: { host: "127.0.0.1", port: 4173, strictPort: true }, logLevel: "error" });
if (!production) await server.listen();
const address = server.httpServer.address();
const context = await chromium.launchPersistentContext(join(tmpdir(), "jahaziel-public-model-smoke"), { headless: true, channel: "chrome", args: ["--enable-unsafe-webgpu"] });
try {
  const page = await context.newPage({ viewport: { width: 1280, height: 850 } });
  page.on("pageerror", (error) => console.log(`PAGE ERROR: ${error.message}`));
  page.on("requestfailed", (request) => console.log(`REQUEST FAILED: ${request.url()} ${request.failure()?.errorText || ""}`));
  page.on("console", (message) => { if (message.type() === "error" || message.type() === "debug") console.log(`CONSOLE ${message.type().toUpperCase()}: ${message.text()}`); });
  await page.goto(`http://127.0.0.1:${address.port}/index.html`);
  await page.evaluate(() => localStorage.removeItem("jahaziel-public-desktop-messages"));
  await page.reload();
  const gpu = await page.evaluate(async () => ({ exposed: Boolean(navigator.gpu), adapter: Boolean(await navigator.gpu?.requestAdapter()) }));
  console.log(`WebGPU exposed=${gpu.exposed} adapter=${gpu.adapter}`);
  if (!gpu.adapter || (process.env.MODEL_SMOKE_LOAD !== "1" && !process.argv.includes("--load"))) process.exitCode = gpu.adapter ? 0 : 2;
  else {
    await page.getByRole("button", { name: "Start local AI" }).click();
    const started = Date.now();
    let last = "";
    while (Date.now() - started < 600_000) {
      const status = await page.locator(".demo-compose-meta span").innerText();
      if (status !== last) { console.log(`MODEL STATUS: ${status}`); last = status; }
      if (status.includes("Local AI ready")) break;
      if (status.includes("could not load")) throw new Error(`Local AI failed: ${status}`);
      await page.waitForTimeout(5000);
    }
    assert.match(await page.locator(".demo-compose-meta span").innerText(), /Local AI ready/);
    await page.getByRole("button", { name: "Explain how a task DAG helps coordinate specialist AI workers." }).click();
    await page.locator(".demo-message-assistant").last().waitFor({ timeout: 5000 });
    await page.locator(".demo-chat[aria-busy='false']").waitFor({ timeout: 90_000 });
    const answer = await page.locator(".demo-message-assistant div").last().innerText();
    assert(answer.length > 15 && !answer.includes("couldn't answer"), answer);
    console.log(`Local AI answer: ${answer.slice(0, 180)}`);
    await page.getByRole("textbox", { name: "Talk to Jahaziel" }).fill("Plan a small robotic gripper design project with a test stage.");
    await page.getByRole("button", { name: "Build task graph" }).click();
    await page.waitForFunction(() => { const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.includes("Build task graph")); return button && !button.disabled; }, null, { timeout: 90_000 });
    if (await page.locator(".demo-plan").isVisible()) {
      const count = await page.locator(".demo-plan li").count();
      console.log(`Local AI DAG nodes: ${count}`);
      assert(count >= 1, "plan must have a node");
    } else {
      console.log(`Local AI DAG rejected: ${await page.locator(".demo-message-assistant").last().innerText()}`);
      process.exitCode = 3;
    }
    await page.getByRole("button", { name: "Open App Center" }).click();
    await page.getByRole("dialog", { name: "App library" }).getByRole("button", { name: /Customize/ }).click();
    const color = page.getByRole("dialog", { name: "Customize" }).locator('input[type="color"]').first();
    await color.fill("#ad55dd");
    console.log(`Theme persisted: ${await page.evaluate(() => localStorage.getItem("jz-theme-colors-v1")?.includes("#ad55dd"))}`);
    await page.getByRole("dialog", { name: "Chat" }).getByRole("button", { name: "Clear local chat" }).click();
    await page.getByRole("textbox", { name: "Talk to Jahaziel" }).fill("What can you do in this public demo?");
    await page.getByRole("button", { name: "Send" }).click();
    await page.locator(".demo-chat[aria-busy='false']").waitFor({ timeout: 90_000 });
    const capabilityAnswer = await page.locator(".demo-message-assistant div").last().innerText();
    assert(capabilityAnswer.length > 15, `Local chat should answer the capability question, got: ${capabilityAnswer}`);
    assert.doesNotMatch(capabilityAnswer, /testing new capabilities/i);
    assert.match(capabilityAnswer, /chat|notes|map|colors|interface/i, `Local chat should describe this demo, got: ${capabilityAnswer}`);
    assert.doesNotMatch(capabilityAnswer, /game's mechanics/i);
    console.log(`Local capability answer: ${capabilityAnswer.slice(0, 180)}`);
    await page.getByRole("textbox", { name: "Talk to Jahaziel" }).fill("Can you read my email?");
    await page.getByRole("button", { name: "Send" }).click();
    await page.locator(".demo-chat[aria-busy='false']").waitFor({ timeout: 90_000 });
    const emailAnswer = await page.locator(".demo-message-assistant div").last().innerText();
    assert.match(emailAnswer, /can't|cannot|no access|not connected|not available|not able/i, `The public model must disclose its email limitation: ${emailAnswer}`);
    assert.match(emailAnswer, /email|inbox/i);
    assert.doesNotMatch(emailAnswer, /I couldn't answer yet|could not give a reliable answer/i);
    console.log(`Local email answer: ${emailAnswer.slice(0, 180)}`);
    await page.getByRole("textbox", { name: "Talk to Jahaziel" }).fill("What is my latest email?");
    await page.getByRole("button", { name: "Send" }).click();
    await page.locator(".demo-chat[aria-busy='false']").waitFor({ timeout: 90_000 });
    const emailFollowUp = await page.locator(".demo-message-assistant div").last().innerText();
    assert.match(emailFollowUp, /(?:can't|cannot|don't|do not|not able|not available|no access|no inbox).{0,90}(?:email|inbox)|(?:email|inbox).{0,90}(?:not available|not connected|no access)/i, `The model must not invent an inbox result: ${emailFollowUp}`);
    console.log(`Local email follow-up: ${emailFollowUp.slice(0, 180)}`);
    await page.getByRole("dialog", { name: "Chat" }).getByRole("button", { name: "Clear local chat" }).click();
    await page.getByRole("textbox", { name: "Talk to Jahaziel" }).fill("Can you code?");
    await page.getByRole("button", { name: "Send" }).click();
    await page.locator(".demo-chat[aria-busy='false']").waitFor({ timeout: 90_000 });
    const codingAnswer = await page.locator(".demo-message-assistant div").last().innerText();
    assert.match(codingAnswer, /code|coding|program/i);
    assert.match(codingAnswer, /private|Jahaziel Code|full prototype/i, `The public model must distinguish private JCode: ${codingAnswer}`);
    assert.match(codingAnswer, /text|suggest|write|explain|draft/i, `The public model should acknowledge text-based coding help: ${codingAnswer}`);
    assert.match(codingAnswer, /(?:can't|cannot|not able|does not|doesn't|no access).{0,70}(?:edit|run|execute|repository|project)/i, `The public model must state it cannot edit or run code here: ${codingAnswer}`);
    assert.doesNotMatch(codingAnswer, /(?:this|the) (?:public )?demo (?:can't|cannot|does not|doesn't) code/i, `The demo can still draft or explain code as text: ${codingAnswer}`);
    assert.doesNotMatch(codingAnswer, /I couldn't answer yet|could not give a reliable answer/i);
    console.log(`Local coding answer: ${codingAnswer.slice(0, 180)}`);
    await page.getByRole("dialog", { name: "Chat" }).getByRole("button", { name: "Clear local chat" }).click();
    await page.getByRole("textbox", { name: "Talk to Jahaziel" }).fill("What is 2 + 2? Answer with the number.");
    await page.getByRole("button", { name: "Send" }).click();
    await page.locator(".demo-chat[aria-busy='false']").waitFor({ timeout: 90_000 });
    const directAnswer = await page.locator(".demo-message-assistant div").last().innerText();
    assert.match(directAnswer, /\b4\b|\bfour\b/i, `Local chat must give a direct answer, got: ${directAnswer}`);
    assert.doesNotMatch(directAnswer, /testing new capabilities/i);
    console.log(`Local direct answer: ${directAnswer.slice(0, 160)}`);
    await page.getByRole("dialog", { name: "Chat" }).getByRole("button", { name: "Clear local chat" }).click();
    await page.getByRole("textbox", { name: "Talk to Jahaziel" }).fill("Hello. My favorite color is cobalt blue. Please say hello.");
    await page.getByRole("button", { name: "Send" }).click();
    await page.locator(".demo-message-assistant").last().waitFor();
    await page.locator(".demo-chat[aria-busy='false']").waitFor({ timeout: 90_000 });
    await page.reload();
    assert.match(await page.locator(".demo-message-user").last().innerText(), /cobalt blue/);
    await page.getByRole("textbox", { name: "Talk to Jahaziel" }).fill("What color did I tell you was my favorite? Answer in a few words.");
    await page.getByRole("button", { name: "Send" }).click();
    await page.waitForFunction(() => document.querySelectorAll(".demo-message-assistant").length === 2, null, { timeout: 5000 });
    await page.locator(".demo-chat[aria-busy='false']").waitFor({ timeout: 90_000 });
    const memoryAnswer = await page.locator(".demo-message-assistant div").last().innerText();
    assert.match(memoryAnswer, /blue/i, `Local chat should use its transcript, got: ${memoryAnswer}`);
    console.log(`Local transcript continuity after reload: ${memoryAnswer.slice(0, 160)}`);
  }
} finally {
  await context.close();
  if (production) await new Promise((resolve) => server.httpServer.close(resolve));
  else await server.close();
}
