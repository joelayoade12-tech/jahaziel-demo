import { hexToHue, loadThemeColors, normalizeHexColor } from "./themeCustomization.ts";

export const AI_APP_PRESENCE_EVENT = "jz:ai-app-presence";

export type AiAppPresencePhase = "clear" | "ring" | "preview" | "launch";

export type AiAppPresenceDetail = Readonly<{
  phase: AiAppPresencePhase;
  targetId?: string;
  primary?: string;
  secondary?: string;
}>;

const TARGET_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function normalizeAiAppPresenceDetail(value: unknown): AiAppPresenceDetail {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const phase: AiAppPresencePhase = input.phase === "ring"
    || input.phase === "preview"
    || input.phase === "launch"
    ? input.phase
    : "clear";
  if (phase === "clear" || phase === "ring") return { phase };
  const targetId = typeof input.targetId === "string" && TARGET_ID.test(input.targetId)
    ? input.targetId
    : undefined;
  if (!targetId) return { phase: "clear" };
  const theme = loadThemeColors();
  return {
    phase,
    targetId,
    primary: normalizeHexColor(input.primary, theme.aiInterface),
    secondary: normalizeHexColor(input.secondary, theme.secondary),
  };
}

/** Blend around the shortest side of the color wheel. */
export function blendHue(from: number, to: number, weight: number): number {
  const start = ((from % 360) + 360) % 360;
  const end = ((to % 360) + 360) % 360;
  const amount = Math.max(0, Math.min(1, Number.isFinite(weight) ? weight : 0));
  const delta = ((end - start + 540) % 360) - 180;
  return (start + delta * amount + 360) % 360;
}

export function aiAppPresenceHues(detail: AiAppPresenceDetail): { primary: number; secondary: number } | null {
  if (!detail.primary || !detail.secondary) return null;
  return { primary: hexToHue(detail.primary), secondary: hexToHue(detail.secondary) };
}

export function publishAiAppPresence(detail: AiAppPresenceDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AiAppPresenceDetail>(AI_APP_PRESENCE_EVENT, {
    detail: normalizeAiAppPresenceDetail(detail),
  }));
}
