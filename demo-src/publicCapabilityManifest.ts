/** One source of truth for the public demo's self-knowledge and About panel. */
export const DEMO_CAPABILITIES = [
  { title: "Local text chat", detail: "Answer general questions, explain ideas, draft writing, and suggest code as text. Use recent chat and manually saved notes. Cannot run code or edit a repository." },
  { title: "Local notes", detail: "Save or remove notes in this browser only. They are not the private system's automatic, cross-device memory." },
  { title: "Public map", detail: "The visitor can explore a 3D map and optionally grant location to the map. The chat model cannot read their location." },
  { title: "Interface customization", detail: "Change colors and browse the app ring, App Center, and dashboard previews." },
  { title: "Task graph proposal", detail: "Suggest a small plan. The demo does not execute the plan or run specialist workers." },
] as const;

export const PRIVATE_CAPABILITIES = [
  { title: "Normal Chat and specialist orchestration", status: "Working prototype", brief: "dependency-aware DAG planning, specialist workers, tool use, critique, and verification; broad reliability still being hardened", detail: "Open-ended requests can become dependency-aware task graphs. Specialist departments plan, research, use tools, critique results, and verify external actions before reporting them. Live email and Apple Calendar read/write journeys have been exercised; broader first-try reliability is still being hardened." },
  { title: "Jahaziel Code", status: "Verified review flow", brief: "inspect projects, prepare code edits, run checks, show diffs, and wait for approval; approve/reject/rollback proven", detail: "A coding workspace can inspect a project, prepare changes, run checks, show a diff, and wait for human approval. Approval, rejection, rollback, and restart persistence have served-browser proofs; universal autonomy across all models remains in development." },
  { title: "Projects, Library, and Task Hub", status: "Active prototype", brief: "durable plans, project folders, evidence, decisions, deliverables, and automation visibility", detail: "Longer work has plans, project folders, evidence, decisions, and deliverables shared across Chat, Code, and Project Engine. Project plans can pause for user confirmation; cross-surface handoffs and long-run continuation are still being validated." },
  { title: "Memory and adaptation", status: "Active prototype", brief: "learn useful context with provenance, correct mistakes, and ask focused questions; broader cross-device testing remains", detail: "The assistant can retain useful user context, distinguish observed facts from assumptions, supersede corrected facts, and ask focused questions when information is missing. Those learning paths have focused live proofs but still need broader cross-device qualification." },
  { title: "Email, calendar, Watch Dog, and alerts", status: "Mixed maturity", brief: "connected Gmail and Apple Calendar workflows with authorization and review; Watch Dog triage; New Outlook ingestion incomplete", detail: "Connected workflows can read email, prepare or send reviewed messages, find and update calendar events, attach generated files, and deliver linked notifications. Watch Dog triages relevance and deadlines; Gmail has working paths, while New Outlook processing still needs a supported transport." },
  { title: "Shared Web and research", status: "Active prototype", brief: "shared browser, page reading, navigation, user handoff, and source evidence; complex sites still being refined", detail: "The user and AI can share a browser workspace with tabs, page reading, navigation, control handoff, and review checkpoints. Web-sourced work can retain source evidence. Complex site interactions and video understanding are still being refined." },
  { title: "Engineering, 3D, and maps", status: "Conceptual tools", brief: "interactive 3D assemblies, GLB/STL export, and location/map features; not dimension-verified CAD or guaranteed printable", detail: "The private studio can plan a multi-part assembly, generate interactive 3D components, and export GLB or STL. Its map supports a live 3D/location workspace; full navigation remains under development. Generated geometry is conceptual—not dimension-verified CAD or guaranteed printable." },
  { title: "Model intelligence and Skin", status: "Active prototype", brief: "cost/capability/health-aware model choice and structural codebase analysis; full live qualification ongoing", detail: "A model dashboard compares capability, cost, and observed health for task-appropriate routing and substitutes. Skin analyzes the codebase dependency graph and structural contracts to flag risky changes. Full live outage and scan-to-delivery proofs remain in progress." },
  { title: "Consumer interface and voice", status: "Mixed maturity", brief: "customizable desktop, app ring, App Center, badges, phone/tablet UI; voice and proactive flows under validation", detail: "A customizable desktop has an AI particle ring, App Center, movable apps, themes, badges, notifications, and phone/tablet layouts. Voice, camera/Lens, automations, and proactive work are implemented in part but are not yet uniformly reliable." },
] as const;

const CAPABILITY_QUERY_STOPWORDS = new Set(["about", "able", "actual", "abilities", "ability", "can", "could", "demo", "have", "here", "private", "prototype", "public", "real", "system", "this", "what", "with", "would", "your"]);

function relevantCapabilities<T extends { title: string; detail: string }>(question: string, items: readonly T[], includeAllForPrivateOverview = false) {
  const words = [...new Set((question.toLowerCase().match(/[a-z]{4,}/g) || []).filter((word) => !CAPABILITY_QUERY_STOPWORDS.has(word)))];
  if (!words.length) return includeAllForPrivateOverview && /\b(?:private|actual|full|real)\b/i.test(question) ? [...items] : [];
  return items.filter((item) => {
    const terms = new Set(`${item.title} ${item.detail}`.toLowerCase().match(/[a-z]{4,}/g) || []);
    return words.some((word) => terms.has(word));
  });
}

export function publicCapabilityContext(question = ""): string {
  const relevantPrivate = relevantCapabilities(question, PRIVATE_CAPABILITIES, true);
  return [
    "You are Jahaziel's PUBLIC DEMO chatbot, not the private Jahaziel backend. Answer naturally and directly. Never mix up the two systems.",
    `THIS DEMO CAN: ${DEMO_CAPABILITIES.map((item) => item.title.toLowerCase()).join("; ")}. Text chat can explain ideas, draft writing, and suggest code as TEXT. Notes stay in this browser. The map is a visitor-facing UI, not a model tool. A task graph is only a proposal, not executed.`,
    "THIS DEMO CANNOT: read email, read a calendar, browse the live web, access accounts or private files, edit or run code, use specialist workers, or take external actions. It has no connected tools. If asked for a latest email or event, say you cannot see it. Never invent external results. Do not say this demo cannot code at all: it can draft or explain code as text, but cannot edit or execute a project.",
    relevantPrivate.length ? `RELEVANT SEPARATE PRIVATE PROTOTYPE ABILITIES, NOT PRESENT HERE: ${relevantPrivate.map((item) => `${item.title} (${item.status}): ${item.brief}`).join("; ")}.` : "The separate private prototype has more features; the About panel lists them. Do not attribute them to this demo.",
    "The private system is still a developing prototype, not a universal production guarantee. Joel can show the real system in person.",
    "For ANY question about your abilities, a bare yes or no is incomplete: explain the specific scope of THIS DEMO and contrast the PRIVATE prototype when relevant. Never list private functions as available in this demo. Keep the answer to one to three sentences. Ask a focused question only if needed. Do not repeat false earlier assistant claims.",
  ].join("\n");
}

/** A shorter grounding pass for tiny models that blur the two capability scopes. */
export function publicCapabilityRepairContext(question = ""): string {
  const relevantDemo = relevantCapabilities(question, DEMO_CAPABILITIES);
  const relevantPrivate = relevantCapabilities(question, PRIVATE_CAPABILITIES, true);
  return [
    "You are Jahaziel's public DEMO chatbot, not the private prototype. Answer the user's question directly in two sentences.",
    relevantDemo.length ? `RELEVANT THIS-DEMO ABILITY: ${relevantDemo.map((item) => `${item.title}: ${item.detail}`).join("; ")}.` : `THIS DEMO can: ${DEMO_CAPABILITIES.map((item) => item.title.toLowerCase()).join(", ")}.`,
    "THIS DEMO has no connected inbox, calendar, web, private files, accounts, or external actions. Never claim it does.",
    relevantPrivate.length ? `THE SEPARATE PRIVATE PROTOTYPE has: ${relevantPrivate.map((item) => `${item.title}: ${item.brief}`).join("; ")}. These abilities are NOT in the demo.` : "THE SEPARATE PRIVATE PROTOTYPE has additional features described in About. These are NOT in the demo.",
    "Always say what this demo can and cannot do before describing the private prototype. Do not conflate them. Do not say this demo cannot code at all: it can draft or explain code as text, but cannot edit or run a project.",
  ].join("\n");
}

/** An affirmative capability answer without a demo/private scope is misleading here. */
export function capabilityAnswerNeedsScope(question: string, answer: string): boolean {
  const asksAboutAbility = /\b(?:can|could|would) you\b|\bwhat (?:can|could) you do\b|\byour (?:abilities|capabilities)\b/i.test(question);
  const claimsAbility = /^(?:yes\b|(?:i|we) can\b|(?:this|the) (?:demo|app) can\b)/i.test(answer.trim());
  const hasScope = /\b(?:this demo|public demo|here|in this version|private|full prototype)\b/i.test(answer);
  const asksAboutCoding = /\b(?:code|coding|program|programming)\b/i.test(question);
  const mentionsPrivateCoding = /\b(?:private|full prototype|Jahaziel Code|JCode)\b/i.test(answer);
  const falselyDeniesTextCoding = /\b(?:this|the) (?:public )?demo (?:can't|cannot|does not|doesn't) code\b/i.test(answer);
  const explainsTextOnlyCoding = /\b(?:as text|text[- ](?:only|based)|suggest code|explain code)\b/i.test(answer)
    || /\b(?:can't|cannot|not able|does not|doesn't|no access)\b.{0,55}\b(?:edit|run|execute|code|repository|project)\b/i.test(answer);
  return asksAboutAbility && ((!hasScope && claimsAbility) || (asksAboutCoding && (!explainsTextOnlyCoding || falselyDeniesTextCoding || !mentionsPrivateCoding)));
}

/** Safety validation only. The model writes the answer; this never supplies a scripted one. */
export function unsupportedPublicClaim(answer: string): boolean {
  const text = answer.trim();
  if (/\b(?:fully functional|without any limitations|no restrictions|all features (?:are )?accessible)\b/i.test(text) && !/\b(?:not|isn't|aren't|is not) fully functional\b/i.test(text)) return true;
  if (/\b(?:in this public demo|this demo can)\b/i.test(text)) {
    const publicList = text.split(/\n/).filter((line) => /^\s*\d+[.)]\s+/.test(line));
    if (publicList.some((line) => /\b(?:run(?:ning)? (?:scripts?|code|checks?|tests?)|access external resources|inspect(?:ing)? projects?|edit(?:ing)? code|browse the (?:live )?web|read (?:my|your)?\s*(?:e[- ]?mail|calendar))\b/i.test(line) && !/\b(?:cannot|can't|not available|private only)\b/i.test(line))) return true;
  }
  return text.split(/[.!?\n;]+/).some((sentence) => {
    if (/\b(?:can't|cannot|do not|don't|no access|not able|not connected|only in the private|private prototype)\b/i.test(sentence)) return false;
    const publicAbility = /\b(?:i|we|you|(?:this|the) (?:(?:public )?demo|app|assistant))\b.{0,45}\b(?:can|will|have|already|am able to)\b/i.test(sentence);
    if (!publicAbility) return false;
    const connectedClaim = /\b(?:read|access|check|send|fetch|retrieve|search|browse|open|sync|manage|book|apply|submit)\b.{0,60}\b(?:e[- ]?mail|inbox|calendar|account|web|internet|private files?|bookings?|applications?)\b/i.test(sentence);
    const codeActionClaim = /\b(?:inspect(?:ing)? projects?|prepar(?:e|ing) code edits?|edit(?:ing)? (?:code|projects?|repositor(?:y|ies))|run(?:ning)? (?:checks?|tests?|code)|execut(?:e|ing) code|use (?:the )?Jahaziel Code)\b/i.test(sentence);
    return connectedClaim || codeActionClaim;
  });
}
