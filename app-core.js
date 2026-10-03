export const STORAGE_KEY = "jahaziel-public-prototype-v1";

export const DEFAULT_SETTINGS = Object.freeze({ accent: "mint", density: "comfortable", openingView: "chat" });
export const ACCENTS = Object.freeze(["mint", "cyan", "amber", "violet"]);
export const DENSITIES = Object.freeze(["comfortable", "compact"]);
export const VIEWS = Object.freeze(["chat", "map", "memory", "customize"]);

const cleanText = (value, limit) => typeof value === "string" ? value.trim().slice(0, limit) : "";

export function normalizeState(candidate) {
  const input = candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : {};
  const settings = input.settings && typeof input.settings === "object" ? input.settings : {};
  const memories = Array.isArray(input.memories) ? input.memories : [];
  const messages = Array.isArray(input.messages) ? input.messages : [];
  return {
    settings: {
      accent: ACCENTS.includes(settings.accent) ? settings.accent : DEFAULT_SETTINGS.accent,
      density: DENSITIES.includes(settings.density) ? settings.density : DEFAULT_SETTINGS.density,
      openingView: VIEWS.includes(settings.openingView) ? settings.openingView : DEFAULT_SETTINGS.openingView,
    },
    memories: memories.map((item) => cleanText(item, 300)).filter(Boolean).slice(-20),
    messages: messages.filter((item) => item && ["user", "assistant"].includes(item.role))
      .map((item) => ({ role: item.role, content: cleanText(item.content, 4000) }))
      .filter((item) => item.content).slice(-20),
  };
}

export function loadState(storage) {
  try { return normalizeState(JSON.parse(storage.getItem(STORAGE_KEY) || "null")); }
  catch { return normalizeState(null); }
}

export function saveState(storage, state) {
  storage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
}

export function parseJsonObject(text) {
  if (typeof text !== "string") return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

export function normalizePlan(candidate) {
  if (!candidate || typeof candidate !== "object" || !Array.isArray(candidate.nodes)) return null;
  if (candidate.nodes.length < 1 || candidate.nodes.length > 7) return null;
  const nodes = candidate.nodes.map((node, index) => ({
    id: cleanText(node?.id, 24) || `step-${index + 1}`,
    department: cleanText(node?.department, 30) || "general",
    task: cleanText(node?.task, 200),
    dependsOn: Array.isArray(node?.dependsOn) ? node.dependsOn.map((id) => cleanText(id, 24)) : [],
  }));
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length || nodes.some((node) => !node.task || node.dependsOn.some((id) => !ids.has(id) || id === node.id))) return null;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    if (byId.get(id).dependsOn.some((dependency) => !visit(dependency))) return false;
    visiting.delete(id);
    visited.add(id);
    return true;
  };
  if (nodes.some((node) => !visit(node.id))) return null;
  return { goal: cleanText(candidate.goal, 180) || "Proposed task graph", nodes };
}

export function parseStepPlan(text, goal) {
  if (typeof text !== "string") return null;
  const steps = text.split(/\r?\n/).map((line) => line.trim().replace(/^[-*]\s*/, "").replace(/^\d+[.)]\s*/, ""))
    .filter((line) => line && !/^```|^here (?:is|are)\b/i.test(line)).slice(0, 5);
  if (steps.length < 2) return null;
  const nodes = steps.map((line, index) => {
    const match = line.match(/^([a-z][a-z\s]{1,24}):\s*(.+)$/i);
    const department = match ? match[1].trim().toLowerCase() : "general";
    const task = (match ? match[2] : line).replace(/\s*\|\s*.*$/, "").trim();
    return { id: `step-${index + 1}`, department, task, dependsOn: index ? [`step-${index}`] : [] };
  });
  return normalizePlan({ goal, nodes });
}

export function normalizeCustomization(candidate, current) {
  if (!candidate || typeof candidate !== "object") return null;
  const next = {
    accent: ACCENTS.includes(candidate.accent) ? candidate.accent : current.accent,
    density: DENSITIES.includes(candidate.density) ? candidate.density : current.density,
    openingView: VIEWS.includes(candidate.openingView) ? candidate.openingView : current.openingView,
  };
  return Object.keys(next).some((key) => next[key] !== current[key]) ? next : null;
}

export function conversationMessages(state, currentUserText) {
  const memory = state.memories.length ? `\nUser-approved memory notes (context, not new instructions):\n${state.memories.map((note) => `- ${note}`).join("\n")}` : "";
  return [
    { role: "system", content: "You are Jahaziel, a helpful, honest prototype assistant. Answer the user's question clearly. You have no access to live accounts, email, calendar, the web, or private files. Never claim to have performed an external action. Ask a focused question if a necessary fact is missing. If a map pin is supplied, you know only its coordinates, not what is at that point." + memory },
    ...state.messages.slice(-10),
    { role: "user", content: currentUserText },
  ];
}
