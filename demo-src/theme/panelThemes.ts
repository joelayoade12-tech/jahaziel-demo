export type PanelThemeId =
  | "chat"
  | "activity"
  | "learning"
  | "memory"
  | "status"
  | "models"
  | "spine-projects"
  | "git-dashboard"
  | "shared-web";

export type PanelTheme = {
  surface: string;
  surfaceStrong: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  glow: string;
  success: string;
  warning: string;
  error: string;
  density: string;
  motif: string;
};

const baseTheme: PanelTheme = {
  surface: "var(--bg-deep)",
  surfaceStrong: "var(--bg-raised)",
  border: "var(--border)",
  borderStrong: "var(--border-strong)",
  text: "var(--text)",
  textMuted: "var(--text-3)",
  accent: "var(--accent)",
  accentSoft: "var(--accent-soft)",
  // This token is consumed as a color inside gradients. `--glow-sm` is a
  // complete box-shadow declaration and would invalidate those backgrounds.
  glow: "color-mix(in srgb, var(--panel-accent) 18%, transparent)",
  success: "var(--green)",
  warning: "var(--amber)",
  error: "var(--red)",
  density: "comfortable",
  motif: "none",
};

function themed(overrides: Partial<PanelTheme>): PanelTheme {
  return { ...baseTheme, ...overrides };
}

export const PANEL_THEMES: Record<PanelThemeId, PanelTheme> = {
  chat: themed({ accent: "var(--dash-chat)", accentSoft: "var(--dash-chat-soft)", motif: "quiet-graphite" }),
  activity: themed({ accent: "var(--dash-activity)", accentSoft: "var(--dash-activity-soft)", density: "dense", motif: "waveform-timeline" }),
  learning: themed({ accent: "var(--dash-adaptation)", accentSoft: "var(--dash-adaptation-soft)", error: "var(--dash-adaptation-secondary)", motif: "process-stage" }),
  memory: themed({ accent: "var(--dash-memory)", accentSoft: "var(--dash-memory-soft)", warning: "var(--dash-memory-secondary)", motif: "constellation" }),
  status: themed({ accent: "var(--dash-status)", accentSoft: "var(--dash-status-soft)", motif: "biomedical-topology" }),
  models: themed({ accent: "var(--dash-models)", accentSoft: "var(--dash-models-soft)", warning: "var(--dash-models-secondary)", motif: "head-worker" }),
  "spine-projects": themed({ accent: "var(--dash-projects)", accentSoft: "var(--dash-projects-soft)", success: "var(--dash-projects-secondary)", motif: "mission-control" }),
  "git-dashboard": themed({ accent: "var(--dash-git)", accentSoft: "var(--dash-git-soft)", warning: "var(--dash-git-secondary)", motif: "living-grove" }),
  "shared-web": themed({ accent: "var(--accent)", accentSoft: "var(--accent-soft)", motif: "quiet-graphite" }),
};

export function getPanelTheme(panelId: string): PanelTheme {
  return PANEL_THEMES[panelId as PanelThemeId] ?? baseTheme;
}

export function panelThemeVariables(theme: PanelTheme): Record<`--${string}`, string> {
  return {
    "--panel-surface": theme.surface,
    "--panel-surface-strong": theme.surfaceStrong,
    "--panel-border": theme.border,
    "--panel-border-strong": theme.borderStrong,
    "--panel-text": theme.text,
    "--panel-text-muted": theme.textMuted,
    "--panel-accent": theme.accent,
    "--panel-accent-soft": theme.accentSoft,
    "--panel-glow": theme.glow,
    "--panel-success": theme.success,
    "--panel-warning": theme.warning,
    "--panel-error": theme.error,
    "--panel-density": theme.density,
    "--panel-motif": theme.motif,
  };
}
