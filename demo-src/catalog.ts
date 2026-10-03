// Public, presentation-only copy of the desktop app catalog and icon identities.
// No private layout, accounts, or backend configuration is included.
export const APPS = [
  { id: "chat", label: "Chat", icon: "ph-chat-circle-dots", description: "Talk with the on-device AI", accent: "#67e8f9", secondary: "#0e7490", shape: "circle" },
  { id: "voice-chat", label: "Voice Chat", icon: "ph-microphone", description: "Voice conversation mode", accent: "#c4b5fd", secondary: "#7c3aed", shape: "circle" },
  { id: "lens", label: "Lens", icon: "ph-camera", description: "Camera and voice conversation", accent: "#93c5fd", secondary: "#1d4ed8", shape: "rounded" },
  { id: "notifications", label: "Alerts", icon: "ph-bell", description: "Important notifications and related chats", accent: "#fde68a", secondary: "#d97706", shape: "circle" },
  { id: "automations", label: "Task Hub", icon: "ph-broadcast", description: "Automations, interns, and running tasks", accent: "#f0abfc", secondary: "#a21caf", shape: "tile" },
  { id: "activity", label: "Activity", icon: "ph-pulse", description: "Current and completed work", accent: "#86efac", secondary: "#15803d", shape: "rounded" },
  { id: "map", label: "Map", icon: "ph-map-trifold", description: "Explore the interactive hologram map", accent: "#bef264", secondary: "#4d7c0f", shape: "squircle" },
  { id: "jcode", label: "Code", icon: "ph-code", description: "Jahaziel Code workspace", accent: "#d8b4fe", secondary: "#6b21a8", shape: "tile" },
  { id: "spine-projects", label: "Projects", icon: "ph-folders", description: "Durable project workspace", accent: "#7dd3fc", secondary: "#0369a1", shape: "rounded" },
  { id: "engineering", label: "Engineering", icon: "ph-blueprint", description: "Engineering project reviews", accent: "#fdba74", secondary: "#c2410c", shape: "tile" },
  { id: "files", label: "Files", icon: "ph-folder-open", description: "Generated and uploaded files", accent: "#fde047", secondary: "#a16207", shape: "rounded" },
  { id: "memory", label: "Memory", icon: "ph-brain", description: "Review and manage personal memory", accent: "#a5b4fc", secondary: "#4338ca", shape: "circle" },
  { id: "models", label: "Models", icon: "ph-cpu", description: "Model routing and availability", accent: "#5eead4", secondary: "#0f766e", shape: "tile" },
  { id: "cost", label: "Cost", icon: "ph-currency-dollar", description: "AI usage and cost", accent: "#6ee7b7", secondary: "#047857", shape: "circle" },
  { id: "learning", label: "Adaptation", icon: "ph-graduation-cap", description: "Verified adaptations", accent: "#fda4af", secondary: "#be123c", shape: "squircle" },
  { id: "status", label: "Status", icon: "ph-heartbeat", description: "System status dashboard", accent: "#34d399", secondary: "#047857", shape: "rounded" },
  { id: "git-dashboard", label: "Git", icon: "ph-git-branch", description: "Git work and review", accent: "#fb923c", secondary: "#9a3412", shape: "circle" },
  { id: "departments", label: "Departments", icon: "ph-buildings", description: "Specialist departments", accent: "#60a5fa", secondary: "#1e40af", shape: "tile" },
  { id: "news", label: "News", icon: "ph-newspaper", description: "News monitoring dashboard", accent: "#38bdf8", secondary: "#075985", shape: "rounded" },
  { id: "shared-web", label: "Shared Web", icon: "ph-globe-hemisphere-west", description: "Browse together with the AI", accent: "#8dd6c1", secondary: "#286e72", shape: "squircle" },
  { id: "settings", label: "Settings", icon: "ph-gear", description: "Jahaziel settings", accent: "#cbd5e1", secondary: "#475569", shape: "squircle" },
  { id: "errors", label: "Errors", icon: "ph-warning-circle", description: "Actionable errors", accent: "#fca5a5", secondary: "#b91c1c", shape: "tile" },
  { id: "hologram", label: "3D Models", icon: "ph-cube-transparent", description: "3D model studio", accent: "#f5d0fe", secondary: "#86198f", shape: "squircle" },
  { id: "customize", label: "Customize", icon: "ph-palette", description: "Choose interface colors", accent: "#d8b4fe", secondary: "#6b21a8", shape: "tile" },
  { id: "about", label: "About", icon: "ph-info", description: "Project and demo limitations", accent: "#fde68a", secondary: "#d97706", shape: "rounded" },
] as const;

export type AppId = (typeof APPS)[number]["id"];
export const RING_APPS: readonly AppId[] = ["chat", "map", "notifications", "jcode", "spine-projects", "hologram", "memory", "news"];
