export type ThemeColors = Readonly<{
  primary: string;
  secondary: string;
  aiInterface: string;
  aiThinking: string;
  aiSpeaking: string;
  aiAttention: string;
  aiRingOne: string;
  aiRingTwo: string;
  aiRingThree: string;
  background: string;
}>;

export const THEME_COLORS_STORAGE_KEY = "jz-theme-colors-v1";
export const THEME_COLORS_EVENT = "jz-theme-colors-change";

export const DEFAULT_THEME_COLORS: ThemeColors = Object.freeze({
  primary: "#1fb6d6",
  secondary: "#a78bfa",
  aiInterface: "#56e3ff",
  aiThinking: "#7c9cff",
  aiSpeaking: "#5eead4",
  aiAttention: "#f6c453",
  aiRingOne: "#56e3ff",
  aiRingTwo: "#a78bfa",
  aiRingThree: "#5eead4",
  background: "#0d0d0e",
});

/** Error is the sole fixed AI-state color so a failure never loses meaning. */
export const AI_ERROR_COLOR = "#ef4444";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Accept only full six-digit colors so persisted values cannot become CSS. */
export function normalizeHexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR.test(value.trim())
    ? value.trim().toLowerCase()
    : fallback;
}

export function normalizeThemeColors(value: unknown): ThemeColors {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    primary: normalizeHexColor(input.primary, DEFAULT_THEME_COLORS.primary),
    secondary: normalizeHexColor(input.secondary, DEFAULT_THEME_COLORS.secondary),
    aiInterface: normalizeHexColor(input.aiInterface, DEFAULT_THEME_COLORS.aiInterface),
    aiThinking: normalizeHexColor(input.aiThinking, DEFAULT_THEME_COLORS.aiThinking),
    aiSpeaking: normalizeHexColor(input.aiSpeaking, DEFAULT_THEME_COLORS.aiSpeaking),
    aiAttention: normalizeHexColor(input.aiAttention, DEFAULT_THEME_COLORS.aiAttention),
    aiRingOne: normalizeHexColor(input.aiRingOne, DEFAULT_THEME_COLORS.aiRingOne),
    aiRingTwo: normalizeHexColor(input.aiRingTwo, DEFAULT_THEME_COLORS.aiRingTwo),
    aiRingThree: normalizeHexColor(input.aiRingThree, DEFAULT_THEME_COLORS.aiRingThree),
    background: normalizeHexColor(input.background, DEFAULT_THEME_COLORS.background),
  };
}

function rgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function toHex(value: number): string {
  return Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, "0");
}

export function mixHex(base: string, tint: string, tintWeight: number): string {
  const safeBase = normalizeHexColor(base, DEFAULT_THEME_COLORS.background);
  const safeTint = normalizeHexColor(tint, DEFAULT_THEME_COLORS.primary);
  const weight = Math.max(0, Math.min(1, Number.isFinite(tintWeight) ? tintWeight : 0));
  const left = rgb(safeBase);
  const right = rgb(safeTint);
  return `#${left.map((channel, index) => toHex(channel * (1 - weight) + right[index] * weight)).join("")}`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const [red, green, blue] = rgb(normalizeHexColor(hex, DEFAULT_THEME_COLORS.primary));
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha))})`;
}

export type HslColor = Readonly<{ hue: number; saturation: number; lightness: number }>;

/** Preserve all three perceptual channels selected by the user. */
export function hexToHsl(hex: string): HslColor {
  const [red, green, blue] = rgb(normalizeHexColor(hex, DEFAULT_THEME_COLORS.aiInterface))
    .map((channel) => channel / 255);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  let hue = 0;
  if (delta !== 0) {
    hue = maximum === red
      ? ((green - blue) / delta) % 6
      : maximum === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return {
    hue: Math.round(hue),
    saturation: Math.round(saturation * 1000) / 10,
    lightness: Math.round(lightness * 1000) / 10,
  };
}

export function hexToHue(hex: string): number {
  return hexToHsl(hex).hue;
}

export type AiInterfaceState = "idle" | "thinking" | "speaking" | "attention" | "error";

/**
 * Every ordinary AI state maps directly to the user's chosen color. Error is
 * intentionally fixed red so a failure cannot be made visually ambiguous.
 */
export function particleColorForState(state: AiInterfaceState, input: unknown): string {
  const colors = normalizeThemeColors(input);
  if (state === "thinking") return colors.aiThinking;
  if (state === "speaking") return colors.aiSpeaking;
  if (state === "attention") return colors.aiAttention;
  if (state === "error") return AI_ERROR_COLOR;
  return colors.aiInterface;
}

export function particleHueForState(state: AiInterfaceState, input: unknown): number {
  return hexToHue(particleColorForState(state, input));
}

/**
 * Produce only non-semantic UI variables. Red, amber, and green status
 * tokens deliberately remain owned by tokens.css and cannot be recolored.
 */
export function themeCssVariables(input: unknown): Record<string, string> {
  const colors = normalizeThemeColors(input);
  return {
    "--accent": colors.primary,
    "--accent-strong": mixHex(colors.primary, "#000000", 0.2),
    "--accent-text": mixHex(colors.primary, "#ffffff", 0.42),
    "--accent-soft": hexToRgba(colors.primary, 0.14),
    "--secondary-accent": colors.secondary,
    "--secondary-accent-soft": hexToRgba(colors.secondary, 0.14),
    "--purple": colors.secondary,
    "--purple-soft": hexToRgba(colors.secondary, 0.12),
    "--ai-accent": colors.aiInterface,
    "--ai-accent-text": mixHex(colors.aiInterface, "#ffffff", 0.34),
    "--ai-accent-soft": hexToRgba(colors.aiInterface, 0.16),
    "--ai-accent-glow": hexToRgba(colors.aiInterface, 0.42),
    "--ai-idle": colors.aiInterface,
    "--ai-thinking": colors.aiThinking,
    "--ai-speaking": colors.aiSpeaking,
    "--ai-attention": colors.aiAttention,
    "--ai-error": AI_ERROR_COLOR,
    "--ai-ring-one": colors.aiRingOne,
    "--ai-ring-two": colors.aiRingTwo,
    "--ai-ring-three": colors.aiRingThree,
    // Blend into known dark bases. A bright picker value therefore tints the
    // graphite shell without silently reintroducing the retired light mode.
    "--bg-deep": mixHex("#0d0d0e", colors.background, 0.2),
    "--bg": mixHex("#1a1a1c", colors.background, 0.2),
    "--bg-raised": mixHex("#27272a", colors.background, 0.2),
    "--bg-hover": mixHex("#2e2e32", colors.background, 0.2),
    "--ai-background-tint": colors.background,
  };
}

export function applyThemeColors(input: unknown, root?: HTMLElement): ThemeColors {
  const colors = normalizeThemeColors(input);
  const target = root || (typeof document !== "undefined" ? document.documentElement : undefined);
  if (target) {
    for (const [name, value] of Object.entries(themeCssVariables(colors))) {
      target.style.setProperty(name, value);
    }
  }
  return colors;
}

export function loadThemeColors(storage?: Pick<Storage, "getItem">): ThemeColors {
  const source = storage || (typeof localStorage !== "undefined" ? localStorage : undefined);
  if (!source) return DEFAULT_THEME_COLORS;
  try {
    return normalizeThemeColors(JSON.parse(source.getItem(THEME_COLORS_STORAGE_KEY) || "null"));
  } catch {
    return DEFAULT_THEME_COLORS;
  }
}

export function saveThemeColors(
  input: unknown,
  storage?: Pick<Storage, "setItem">,
  root?: HTMLElement,
): ThemeColors {
  const colors = applyThemeColors(input, root);
  const target = storage || (typeof localStorage !== "undefined" ? localStorage : undefined);
  try {
    target?.setItem(THEME_COLORS_STORAGE_KEY, JSON.stringify(colors));
  } catch {
    // Private browsing and storage quotas must not block live customization.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<ThemeColors>(THEME_COLORS_EVENT, { detail: colors }));
  }
  return colors;
}
