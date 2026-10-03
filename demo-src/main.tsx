import { StrictMode, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { ParticleAvatar, type AvatarState } from "./components/ParticleAvatar";
import { FloatingPanel } from "./components/FloatingPanel";
import { APPS, RING_APPS, type AppId } from "./catalog";
import { DemoMap } from "./DemoMap";
import { DashboardPreview } from "./DashboardPreview";
import { isProgressOnlyReply, selectRecentHistory } from "./conversationContext";
import { PRIVATE_CAPABILITIES, capabilityAnswerNeedsScope, publicCapabilityContext, publicCapabilityRepairContext, unsupportedPublicClaim } from "./publicCapabilityManifest";
import { DEFAULT_THEME_COLORS, applyThemeColors, loadThemeColors, saveThemeColors, type ThemeColors } from "./lib/themeCustomization";
import { parseStepPlan } from "../app-core.js";
import "./index.css";
import "./App.css";
import "./components/Chat.css";
import "./components/DesktopSurface.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "./public-demo.css";

type Message = { role: "user" | "assistant"; content: string };
const DEMO_PROMPTS = [
  "Explain how a task DAG helps coordinate specialist AI workers.",
  "Ask me one useful question before planning a mechatronics project.",
];
const MODEL_CANDIDATES = ["Qwen2.5-1.5B-Instruct-q4f16_1-MLC", "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", "SmolLM2-360M-Instruct-q4f16_1-MLC"];
const MSG_KEY = "jahaziel-public-desktop-messages";
const MEMORY_KEY = "jahaziel-public-desktop-memory";

function readJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; }
  catch { return fallback; }
}

function readMessages(): Message[] {
  const value = readJson<unknown>(MSG_KEY, []);
  return Array.isArray(value) ? value.filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string")
    .map((item) => ({ role: item.role, content: item.content.slice(0, 4000) })).slice(-20) : [];
}

function readMemories(): string[] {
  const value = readJson<unknown>(MEMORY_KEY, []);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 300)).slice(-20) : [];
}

function AppIcon({ id }: { id: AppId }) {
  const app = APPS.find((item) => item.id === id)!;
  const style = { "--app-accent": app.accent, "--app-secondary": app.secondary, "--app-glow": `${app.accent}55` } as CSSProperties;
  return <span className={`desktop-app-icon desktop-app-icon--${app.shape}`} style={style} aria-hidden="true"><span className="desktop-app-icon-mask"><span className="desktop-app-icon-sheen" /><i className={`ph ${app.icon}`} /></span></span>;
}

function FullSystemOverview() {
  return <div className="demo-panel-content demo-about">
    <strong className="demo-warning">This is a rough public preview—not the actual Jahaziel AI.</strong>
    <h2>The private prototype is an AI operating workspace, not just a chatbot.</h2>
    <p>Joel Ayoade built Jahaziel to let a person direct, teach, and customize an assistant in ordinary language. Its private backend joins model workers, tools, memory, projects, and human approval into one system. This page describes code and workflows that exist—not a promise that every path is production-ready.</p>
    <div className="demo-proof"><strong>Already exercised end to end</strong><span>Review/approve/reject/rollback of code diffs · real email and Apple Calendar read-back · downloadable file notifications · customizable desktop and cross-device alert behavior.</span></div>
    <h3>What Jahaziel is built to do</h3>
    <div className="demo-capability-grid">{PRIVATE_CAPABILITIES.map((capability) => <section className="demo-capability-card" key={capability.title}><div><h4>{capability.title}</h4><small>{capability.status}</small></div><p>{capability.detail}</p></section>)}</div>
    <p className="demo-about-limits">This public build shows the desktop design, a tiny on-device chat model, local notes, themes, and a public map. It has no connected accounts, private backend, personal data, or ability to send or submit anything. The private system itself is still under active development; meet Joel for a candid live walkthrough.</p>
    <div className="demo-contact"><a className="demo-contact-primary" href="mailto:joelayoade12@gmail.com?subject=Full%20Jahaziel%20demonstration">Email joelayoade12@gmail.com for a real demonstration ↗</a><a href="https://www.instagram.com/Joe1_ayoade/" target="_blank" rel="noopener noreferrer">Instagram @Joe1_ayoade</a><span>LinkedIn: Joel Ayoade</span></div>
  </div>;
}

function DemoApp() {
  const [openPanels, setOpenPanels] = useState<Set<AppId>>(() => new Set(["chat"]));
  const [panelOrder, setPanelOrder] = useState<AppId[]>(["chat"]);
  const [ringOpen, setRingOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>(readMessages);
  const [memories, setMemories] = useState<string[]>(readMemories);
  const [chatInput, setChatInput] = useState("");
  const [memoryInput, setMemoryInput] = useState("");
  const [colors, setColors] = useState<ThemeColors>(() => loadThemeColors());
  const [modelStatus, setModelStatus] = useState("Local AI not loaded");
  const [modelName, setModelName] = useState("");
  const [modelError, setModelError] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<ReturnType<typeof parseStepPlan>>(null);
  const engine = useRef<any>(null);
  const loadPromise = useRef<Promise<any> | null>(null);
  const chatScroll = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));

  useEffect(() => { applyThemeColors(colors); }, [colors]);
  useEffect(() => { try { localStorage.setItem(MSG_KEY, JSON.stringify(messages.slice(-20))); } catch {} }, [messages]);
  useEffect(() => { try { localStorage.setItem(MEMORY_KEY, JSON.stringify(memories.slice(-20))); } catch {} }, [memories]);
  useEffect(() => { chatScroll.current?.scrollTo({ top: chatScroll.current.scrollHeight }); }, [messages]);
  useEffect(() => { const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight }); window.addEventListener("resize", onResize); return () => window.removeEventListener("resize", onResize); }, []);

  function bringToFront(id: AppId) {
    setPanelOrder((prior) => prior.at(-1) === id ? prior : [...prior.filter((item) => item !== id), id]);
  }
  function panelLayer(id: AppId) { return { zIndex: 50 + panelOrder.indexOf(id), onActivate: () => bringToFront(id) }; }
  function open(id: AppId) {
    setOpenPanels((prior) => new Set(prior).add(id));
    bringToFront(id);
    setRingOpen(false);
    setLibraryOpen(false);
  }
  function close(id: AppId) { setOpenPanels((prior) => { const next = new Set(prior); next.delete(id); return next; }); }

  async function loadModel() {
    if (engine.current) return engine.current;
    if (loadPromise.current) return loadPromise.current;
    if (!navigator.gpu) throw new Error("WebGPU is unavailable. Use a current desktop browser for local AI; the map and other controls still work.");
    setModelError("");
    setModelStatus("Loading the public on-device model…");
    loadPromise.current = (async () => {
      const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
      let lastError: unknown;
      for (const modelId of MODEL_CANDIDATES) {
        try {
          engine.current = await CreateMLCEngine(modelId, { initProgressCallback: (progress) => setModelStatus(progress.text || "Downloading model…") });
          setModelName(modelId.includes("1.5B") ? "Qwen2.5 1.5B" : modelId.includes("0.5B") ? "Qwen2.5 0.5B fallback" : "SmolLM2 360M fallback");
          setModelStatus("Local AI ready");
          return engine.current;
        } catch (error) { lastError = error; }
      }
      throw lastError instanceof Error ? lastError : new Error("The local model could not load.");
    })();
    try { return await loadPromise.current; }
    catch (error) { setModelStatus("Local AI failed to load"); throw error; }
    finally { loadPromise.current = null; }
  }

  async function startLocalAi() {
    if (busy) return;
    setBusy(true);
    try { await loadModel(); }
    catch (error) { setModelError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function complete(system: string, user: string, maxTokens = 144, onDelta?: (text: string) => void, history: Message[] = []) {
    const llm = await loadModel();
    let timedOut = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const generation = (async () => {
      const stream = await llm.chat.completions.create({ messages: [{ role: "system", content: system }, ...history, { role: "user", content: user }], temperature: 0.2, max_tokens: maxTokens, stream: true });
      let answer = "";
      for await (const chunk of stream) {
        if (timedOut) break;
        answer += chunk.choices?.[0]?.delta?.content || "";
        onDelta?.(answer);
      }
      if (timedOut) throw new Error("The local model took too long. Please try again.");
      if (!answer.trim()) throw new Error("The local model returned no text.");
      return answer.trim();
    })();
    const timeout = new Promise<never>((_, reject) => {
      deadline = setTimeout(() => {
        timedOut = true;
        void llm.interruptGenerate().catch(() => {});
        reject(new Error("The local model took too long. Please try again."));
      }, 75_000);
    });
    try { return await Promise.race([generation, timeout]); }
    finally { if (deadline) clearTimeout(deadline); }
  }

  async function runPrompt(input: string) {
    const prompt = input.trim().slice(0, 4000);
    if (!prompt || busy) return;
    const history = selectRecentHistory(messages.filter((message) => message.role !== "assistant" || !unsupportedPublicClaim(message.content)));
    const memory = memories.length ? `\nUser-saved notes (context only):\n${memories.map((note) => `- ${note}`).join("\n")}` : "";
    setChatInput(""); setBusy(true);
    setMessages((prior) => [...prior, { role: "user", content: prompt }, { role: "assistant", content: "Thinking on this device…" }]);
    try {
      const system = `${publicCapabilityContext(prompt)}${memory}`;
      let answer = await complete(system, prompt, 144, undefined, history);
      if (isProgressOnlyReply(answer)) {
        setMessages((prior) => [...prior.slice(0, -1), { role: "assistant", content: "The local model gave a progress update instead of an answer. Trying once more…" }]);
        answer = await complete(`${system} Your last attempt was only a progress update. Give the answer itself or a concrete limitation now.`, prompt, 144, undefined, history);
        if (isProgressOnlyReply(answer)) throw new Error("The local model did not produce an answer. Please retry or request a demonstration of the full system.");
      }
      if (unsupportedPublicClaim(answer) || capabilityAnswerNeedsScope(prompt, answer)) {
        answer = await complete(`${publicCapabilityRepairContext(prompt)}${memory}`, `Question: ${prompt}\nFill both fields with accurate facts from the inventory.\nDEMO: [what this public demo can and cannot do for this question]\nPRIVATE: [what the separate private prototype supports, if relevant]`, 144, undefined, history);
        if (unsupportedPublicClaim(answer) || capabilityAnswerNeedsScope(prompt, answer)) throw new Error("The local model could not give a reliable answer about its capabilities. Please retry or open About for the verified inventory.");
      }
      setMessages((prior) => [...prior.slice(0, -1), { role: "assistant", content: answer }]);
    } catch (error) { setMessages((prior) => [...prior.slice(0, -1), { role: "assistant", content: `I couldn't answer yet: ${error instanceof Error ? error.message : String(error)}` }]); }
    finally { setBusy(false); }
  }

  function send(event: FormEvent) {
    event.preventDefault();
    void runPrompt(chatInput);
  }

  async function buildPlan() {
    const goal = chatInput.trim() || [...messages].reverse().find((message) => message.role === "user")?.content;
    if (!goal || busy) return;
    setBusy(true); setPlan(null);
    try {
      const raw = await complete("You are a task planner. Write exactly three short numbered steps for the user's goal. Each line: '1. Research: specific action'. Use a department, colon, and one concrete action. No JSON, commentary, or claims of completion. Steps must be in prerequisite order.", `Goal: ${goal.slice(0, 700)}\nReply with only three numbered steps.`, 144);
      const next = parseStepPlan(raw, goal);
      if (!next) throw new Error("The small local model did not form a valid plan. Please retry with a specific goal.");
      setPlan(next); open("chat");
    } catch (error) { setMessages((prior) => [...prior, { role: "assistant", content: `Planning did not complete: ${error instanceof Error ? error.message : String(error)}` }]); }
    finally { setBusy(false); }
  }

  const filteredApps = APPS.filter((app) => `${app.label} ${app.description}`.toLowerCase().includes(libraryQuery.toLowerCase()));
  const avatarSize = Math.min(560, Math.floor(Math.min(viewport.width, viewport.height) * 0.62));
  const avatarState: AvatarState = busy ? "thinking" : "idle";
  return <div className={`app-shell ai-state-${avatarState}`}>
    <aside className="demo-topbar" role="note" aria-label="Limited public demo warning">
      <div className="demo-banner-copy">
        <div className="demo-banner-eyebrow"><strong>LIMITED PUBLIC DEMO</strong><span>NOT THE ACTUAL AI</span></div>
        <h1>This is a rough, stripped-down preview.</h1>
        <p>The private prototype has DAG-planned specialist workers, memory, Watch Dog, connected email/calendar/web, reviewable coding, and 3D tools. Those capabilities are not in this demo.</p>
      </div>
      <div className="demo-banner-actions">
        <a href="mailto:joelayoade12@gmail.com?subject=Full%20Jahaziel%20demonstration">Email Joel for a real demonstration <span aria-hidden="true">↗</span></a>
        <button type="button" onClick={() => open("about")}>What the actual AI can do</button>
      </div>
    </aside>
    <div className={`desktop-surface ${ringOpen ? "is-launcher-open" : ""}`}>
      <div className="hub-grid" aria-hidden="true" />
      <div className="desktop-shortcuts" aria-label="Desktop shortcuts">
        {(["map", "memory"] as AppId[]).map((id, index) => <button key={id} className="desktop-shortcut" style={{ left: `calc(100% - 82px)`, top: `${26 + index * 15}%` }} onClick={() => open(id)} aria-label={`Open ${id}`}><AppIcon id={id} /><span className="desktop-shortcut-label">{APPS.find((app) => app.id === id)?.label}</span></button>)}
      </div>
      <div className="hub-avatar-wrap"><ParticleAvatar state={avatarState} size={avatarSize} particleCount={viewport.width <= 760 ? 2800 : 6500} onClick={() => setRingOpen((value) => !value)} ariaExpanded={ringOpen} ariaLabel={`${ringOpen ? "Close" : "Open"} Jahaziel app ring`} /><div className="hub-avatar-name">JAHAZIEL</div>
        <div className={`hub-launcher ${ringOpen ? "is-open" : ""}`} role="menu" aria-label="Jahaziel ring apps" aria-hidden={!ringOpen} style={{ "--ring-growth": "9%" } as CSSProperties}><div className="hub-launcher-ring" aria-hidden="true" />{RING_APPS.map((id, index) => { const angle = index / RING_APPS.length * Math.PI * 2 - Math.PI / 2; return <button key={id} className="hub-launcher-item" role="menuitem" style={{ left: `calc(50% + ${Math.cos(angle) * 46}%)`, top: `calc(50% + ${Math.sin(angle) * 46}%)` }} onClick={() => open(id)} disabled={!ringOpen} aria-label={`Open ${APPS.find((app) => app.id === id)?.label}`}><AppIcon id={id} /></button>; })}</div>
      </div>
    </div>
    <div className="desktop-top-dock" aria-label="Top Dock"><button className="desktop-top-dock-item" aria-label="Open About" onClick={() => open("about")}><AppIcon id="about" /></button><button className="desktop-app-center-toggle" aria-label="Open App Center" onClick={() => setLibraryOpen((value) => !value)}><span className="desktop-app-center-mark" aria-hidden="true"><i /><i /><i /><i /></span></button></div>
    {libraryOpen && <section className="desktop-library demo-library" role="dialog" aria-label="App library"><header><div><strong>App Center</strong><span>Everything available in this local public demo.</span></div><button onClick={() => setLibraryOpen(false)} aria-label="Close app library">×</button></header><label className="desktop-library-search"><i className="ph ph-magnifying-glass" /><input type="search" placeholder="Search apps" value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} /></label><div className="desktop-library-list" role="list">{filteredApps.map((app) => <div role="listitem" className="desktop-library-row" key={app.id}><button className="desktop-library-item" onClick={() => open(app.id)}><AppIcon id={app.id} /><span className="desktop-library-copy"><strong>{app.label}</strong><small>{app.description}</small></span></button></div>)}</div><footer>{filteredApps.length} apps · no connected accounts</footer></section>}

    <FloatingPanel panelId="chat" {...panelLayer("chat")} open={openPanels.has("chat")} onClose={() => close("chat")} closeOnEsc={false} title="Chat" titleIcon="ph-chat-circle-dots" width={460} height={Math.max(360, viewport.height - (viewport.width <= 760 ? 202 : 148))} defaultGeometry={{ x: 16, y: viewport.width <= 760 ? 184 : 132, width: 460, height: Math.max(360, viewport.height - (viewport.width <= 760 ? 202 : 148)) }} minWidth={340} minHeight={360} headerActions={<button type="button" className="fp-reset" title="Clear local chat" aria-label="Clear local chat" onClick={() => { setMessages([]); setPlan(null); }}><i className="ph ph-broom" /></button>}>
      <div className="chat-area chat-embedded demo-chat" aria-busy={busy}>
        <div className="chat-scroll" ref={chatScroll}>
          <div className="chat-inner">
            {messages.length === 0 ? <div className="chat-empty">
              <div className="chat-empty-name">Jahaziel</div>
              <div className="chat-empty-sub">Ready when you are.</div>
              <div className="demo-empty-note">A free local AI model runs on this device and uses recent turns from this browser's chat as context. The first visit downloads it; later visits use the browser cache. No private backend or account is connected.</div>
              <button type="button" className="demo-start-ai" onClick={() => void startLocalAi()} disabled={busy || Boolean(engine.current)}>{engine.current ? "Local AI ready" : busy ? "Preparing local AI…" : "Start local AI"}</button>
              <div className="demo-model-status" role="status">{modelError || modelStatus}{modelName && !modelError ? ` · ${modelName}` : ""}</div>
              <div className="demo-example-prompts"><span>Try a real prompt</span>{DEMO_PROMPTS.map((prompt) => <button key={prompt} type="button" onClick={() => void runPrompt(prompt)} disabled={busy}>{prompt}</button>)}</div>
            </div> : messages.map((message, index) => {
              const incorrectOldClaim = message.role === "assistant" && unsupportedPublicClaim(message.content);
              return <div key={index} className={`demo-message demo-message-${message.role}`}><small>{message.role === "user" ? "YOU" : "JAHAZIEL"}</small>{incorrectOldClaim && <strong className="demo-message-correction">Incorrect older demo reply: this public build has no connected tools or account access.</strong>}<div>{message.content === "Thinking on this device…" && modelStatus !== "Local AI ready" ? modelStatus : message.content}</div></div>;
            })}
            {plan && <div className="demo-plan"><strong>Proposed task graph</strong><p>A simplified sequential proposal, not completed work.</p><ol>{plan.nodes.map((node) => <li key={node.id}><small>{node.department}</small><span>{node.task}</span></li>)}</ol></div>}
          </div>
        </div>
        <form className="demo-composer" onSubmit={send}>
          <div className="demo-compose-row"><i className="ph ph-paperclip" aria-hidden="true" /><textarea aria-label="Talk to Jahaziel" placeholder="Talk to Jahaziel" value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={1} /><button type="submit" disabled={busy || !chatInput.trim()} aria-label="Send"><i className="ph ph-arrow-up" /></button></div>
          <div className="demo-compose-meta"><span>{modelStatus}{modelName ? ` · ${modelName}` : ""}</span><button type="button" disabled={busy || !chatInput.trim()} onClick={() => void buildPlan()}>Build task graph</button></div>
        </form>
      </div>
    </FloatingPanel>

    <FloatingPanel panelId="map" {...panelLayer("map")} open={openPanels.has("map")} onClose={() => close("map")} title="Map" titleIcon="ph-map-trifold" width={820} height={650} defaultGeometry={{ x: 500, y: 86, width: 820, height: 650 }} minWidth={400} minHeight={360} keepMounted><DemoMap open={openPanels.has("map")} /></FloatingPanel>
    <FloatingPanel panelId="memory" {...panelLayer("memory")} open={openPanels.has("memory")} onClose={() => close("memory")} title="Memory" titleIcon="ph-brain" width={520} height={540} defaultGeometry={{ x: 520, y: 112, width: 520, height: 540 }}><div className="demo-panel-content"><div className="demo-panel-intro"><h2>Your local notes</h2><p>Saved only in this browser. The demo does not infer or sync memories.</p></div><form className="demo-memory-form" onSubmit={(event) => { event.preventDefault(); const note = memoryInput.trim().slice(0, 300); if (note) setMemories((prior) => [...prior.slice(-19), note]); setMemoryInput(""); }}><input value={memoryInput} onChange={(event) => setMemoryInput(event.target.value)} placeholder="What should Jahaziel remember?" maxLength={300} /><button type="submit">Save</button></form><ul className="demo-memory-list">{memories.map((note, index) => <li key={`${index}-${note}`}><span>{note}</span><button onClick={() => setMemories((prior) => prior.filter((_, i) => i !== index))}>Forget</button></li>)}</ul></div></FloatingPanel>
    <FloatingPanel panelId="customize" {...panelLayer("customize")} open={openPanels.has("customize")} onClose={() => close("customize")} title="Customize" titleIcon="ph-palette" width={540} height={520} defaultGeometry={{ x: 540, y: 105, width: 540, height: 520 }}><div className="demo-panel-content"><div className="demo-panel-intro"><h2>Make it yours</h2><p>These are the same interface color controls used by the private front end. Changes stay in this browser.</p></div><div className="demo-color-grid">{(["primary", "secondary", "aiInterface", "aiRingOne", "aiRingTwo", "aiRingThree", "background"] as const).map((key) => <label key={key}><span>{key.replace(/([A-Z])/g, " $1")}</span><input type="color" value={colors[key]} onChange={(event) => setColors(saveThemeColors({ ...colors, [key]: event.target.value }))} /></label>)}</div><button className="demo-reset" onClick={() => setColors(saveThemeColors(DEFAULT_THEME_COLORS))}>Reset colors</button></div></FloatingPanel>
    <FloatingPanel panelId="about" {...panelLayer("about")} open={openPanels.has("about")} onClose={() => close("about")} title="About Jahaziel" titleIcon="ph-info" width={760} height={660} defaultGeometry={{ x: 430, y: 138, width: 760, height: 660 }}><FullSystemOverview /></FloatingPanel>
    {APPS.filter((app) => !["chat", "map", "memory", "customize", "about"].includes(app.id)).map((app) => <FloatingPanel key={app.id} panelId={app.id} {...panelLayer(app.id)} open={openPanels.has(app.id)} onClose={() => close(app.id)} title={app.label} titleIcon={app.icon} width={700} height={590} defaultGeometry={{ x: 420, y: 88, width: 700, height: 590 }} minWidth={360} minHeight={330}><DashboardPreview appId={app.id} /></FloatingPanel>)}
  </div>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><DemoApp /></StrictMode>);
