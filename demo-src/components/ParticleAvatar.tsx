/**
 * ParticleAvatar — the AI's ambient interface, not the 3D model viewer.
 *
 * A field of ~1,400 3D points projected onto a 2D canvas. The points
 * continuously seek a TARGET FORMATION; changing the formation makes
 * the cloud visibly morph — dots stream from a supernova into a globe,
 * a map grid, a ring, whatever the conversation needs. That morph IS
 * the product: the AI's body reorganizing itself into the subject.
 *
 * Formations (built-in):
 *   supernova — idle. A glowing core with orbiting accretion shells and
 *               occasional ejecta. Slow rotation, breathing glow.
 *   sphere    — listening/attention. Tight breathing shell.
 *   ring      — thinking. Tilted torus with orbital drift.
 *   burst     — speaking. Radial spikes that pulse with amplitude.
 *   globe     — map mode. Lat/long wireframe sphere; pins can be added
 *               as bright fixed points via setMarkers().
 *   custom    — any point set via morphTo(points) for ambient formations.
 *
 * Perf: single rAF loop, no React state per frame, no dependencies.
 * Points are Float32-ish plain arrays; the projection is a simple
 * perspective divide with a slow auto-rotation. Devices throttle fine.
 *
 * API (via ref):
 *   setFormation(name)        — morph to a built-in formation
 *   morphTo(points, opts)     — morph to arbitrary [x,y,z] points (unit cube)
 *   setMarkers(markers)       — bright labeled points (e.g. map pins)
 *   setAmplitude(v)           — 0..1 live audio level (speaking pulse)
 */
import { useCallback, useEffect, useImperativeHandle, useRef, forwardRef } from "react";
import type React from "react";
import {
  PARTICLE_RING_SPECS,
  particleAvatarMotionFrame,
  particleFormationForState,
  type ParticleAvatarMotionState,
} from "./particleAvatarMotion";
import {
  THEME_COLORS_EVENT,
  hexToHsl,
  loadThemeColors,
  normalizeThemeColors,
  particleColorForState,
  particleHueForState,
  type HslColor,
  type ThemeColors,
} from "../lib/themeCustomization";
import {
  AI_APP_PRESENCE_EVENT,
  aiAppPresenceHues,
  blendHue,
  normalizeAiAppPresenceDetail,
  type AiAppPresenceDetail,
} from "../lib/aiPresence";

export type AvatarFormation = "supernova" | "sphere" | "ring" | "burst" | "globe" | "custom";

/** The AI's presence states. This is the single state vocabulary for
 *  the (single) AI interface — previously duplicated by the retired
 *  ring-widget component. */
export type AvatarState = ParticleAvatarMotionState;

export type AvatarMarker = {
  x: number; y: number; z: number;
  label?: string; color?: string; info?: string;
  /** Set on PART markers (full model). Tapping focuses that part. */
  partIndex?: number;
  /** Set on SUB-TAG markers (focus mode). Tapping shows info only —
   *  there is no further drill-down level. */
  isSubTag?: boolean;
  /** TRUE when the marker's part is a synthesized interior structure. */
  internal?: boolean;
};

export type ParticleAvatarHandle = {
  setFormation: (f: AvatarFormation) => void;
  morphTo: (points: Array<[number, number, number]>, opts?: { spin?: number }) => void;
  setMarkers: (markers: AvatarMarker[]) => void;
  setAmplitude: (v: number) => void;
};

type Props = {
  size?: number;                 // canvas CSS px (square)
  state?: AvatarState;
  particleCount?: number;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
  ariaExpanded?: boolean;
  /** Optional marker interaction for the AI avatar; unrelated to 3D models. */
  onMarkerClick?: (marker: AvatarMarker, at: { x: number; y: number }) => void;
};

const TAU = Math.PI * 2;

// ── Formation generators (unit-ish space, |coord| ≲ 1) ────────────────

function genSupernova(n: number): Array<[number, number, number]> {
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    const r = Math.pow(Math.random(), 0.45);            // dense core, sparse halo
    const theta = Math.random() * TAU;
    const phi = Math.acos(2 * Math.random() - 1);
    // Flatten slightly into an accretion-disk feel, but keep volume.
    const flat = 0.55 + 0.45 * Math.random();
    pts.push([
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi) * flat,
      r * Math.sin(phi) * Math.sin(theta),
    ]);
  }
  return pts;
}

function genSphere(n: number, radius = 0.8): Array<[number, number, number]> {
  const pts: Array<[number, number, number]> = [];
  // Fibonacci sphere — even shell coverage.
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / Math.max(1, n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    pts.push([Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius]);
  }
  return pts;
}

function genRing(n: number): Array<[number, number, number]> {
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    const tube = 0.13 * Math.sqrt(Math.random());
    const tubeAng = Math.random() * TAU;
    const R = 0.72;
    const x = (R + tube * Math.cos(tubeAng)) * Math.cos(t);
    const z = (R + tube * Math.cos(tubeAng)) * Math.sin(t);
    const y = tube * Math.sin(tubeAng);
    // Tilt the torus for depth.
    const tilt = 0.5;
    pts.push([x, y * Math.cos(tilt) - z * Math.sin(tilt) * 0.3, z]);
  }
  return pts;
}

function genBurst(n: number): Array<[number, number, number]> {
  const pts: Array<[number, number, number]> = [];
  const SPIKES = 14;
  for (let i = 0; i < n; i++) {
    const spike = i % SPIKES;
    const baseTheta = (spike / SPIKES) * TAU;
    const theta = baseTheta + (Math.random() - 0.5) * 0.25;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 0.15 + Math.pow(Math.random(), 2) * 0.85;
    pts.push([
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta),
    ]);
  }
  return pts;
}

function genGlobe(n: number): Array<[number, number, number]> {
  const pts: Array<[number, number, number]> = [];
  const R = 0.8;
  // Latitude rings + longitude meridians — a wireframe planet.
  const LAT_RINGS = 9, MERIDIANS = 12;
  const perLat = Math.floor((n * 0.55) / LAT_RINGS);
  for (let li = 0; li < LAT_RINGS; li++) {
    const lat = ((li + 1) / (LAT_RINGS + 1)) * Math.PI - Math.PI / 2;
    const r = Math.cos(lat) * R, y = Math.sin(lat) * R;
    for (let i = 0; i < perLat; i++) {
      const t = (i / perLat) * TAU;
      pts.push([r * Math.cos(t), y, r * Math.sin(t)]);
    }
  }
  const perMer = Math.floor((n * 0.45) / MERIDIANS);
  for (let mi = 0; mi < MERIDIANS; mi++) {
    const lon = (mi / MERIDIANS) * TAU;
    for (let i = 0; i < perMer; i++) {
      const lat = (i / perMer) * Math.PI - Math.PI / 2;
      const r = Math.cos(lat) * R, y = Math.sin(lat) * R;
      pts.push([r * Math.cos(lon), y, r * Math.sin(lon)]);
    }
  }
  while (pts.length < n) pts.push(pts[Math.floor(Math.random() * pts.length)] || [0, 0, 0]);
  return pts.slice(0, n);
}

/** Trace a rounded-rect path (does not fill/stroke — caller does). Used
 *  for the marker label chips; avoids depending on the native
 *  ctx.roundRect for broader canvas support. */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function blendHslColor(from: HslColor, to: HslColor, weight: number): HslColor {
  const amount = Math.max(0, Math.min(1, weight));
  return {
    hue: blendHue(from.hue, to.hue, amount),
    saturation: from.saturation + (to.saturation - from.saturation) * amount,
    lightness: from.lightness + (to.lightness - from.lightness) * amount,
  };
}

export const ParticleAvatar = forwardRef<ParticleAvatarHandle, Props>(function ParticleAvatar(
  {
    size = 320,
    state = "idle",
    particleCount = 1400,
    className,
    onClick,
    onMarkerClick,
    ariaLabel,
    ariaExpanded,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const themeColorsRef = useRef<ThemeColors>(loadThemeColors());
  const secondaryColorRef = useRef<HslColor>(hexToHsl(themeColorsRef.current.secondary));
  const ringColorsRef = useRef<readonly [HslColor, HslColor, HslColor]>([
    hexToHsl(themeColorsRef.current.aiRingOne),
    hexToHsl(themeColorsRef.current.aiRingTwo),
    hexToHsl(themeColorsRef.current.aiRingThree),
  ]);
  const initialPrimary = hexToHsl(particleColorForState("idle", themeColorsRef.current));
  const presenceRef = useRef<AiAppPresenceDetail>({ phase: "clear" });
  // Mutable sim state — outside React.
  const sim = useRef({
    pos: [] as number[],          // xyz interleaved
    target: [] as number[],
    seed: [] as number[],         // per-particle phase for shimmer
    markers: [] as AvatarMarker[],
    markerScreens: [] as Array<{ m: AvatarMarker; x: number; y: number }>, // CSS px, rebuilt every frame
    formation: "supernova" as AvatarFormation,
    explicitFormation: false,     // morphTo/setFormation overrides state-driven
    /** Index of the focused part during tap-to-focus drill-down; null =
     *  showing the whole model. */
    focusIndex: null as number | null,
    amplitude: 0,
    hue: particleHueForState("idle", themeColorsRef.current),
    targetHue: particleHueForState("idle", themeColorsRef.current),
    saturation: initialPrimary.saturation,
    targetSaturation: initialPrimary.saturation,
    lightness: initialPrimary.lightness,
    targetLightness: initialPrimary.lightness,
    secondaryHue: secondaryColorRef.current.hue,
    targetSecondaryHue: secondaryColorRef.current.hue,
    secondarySaturation: secondaryColorRef.current.saturation,
    targetSecondarySaturation: secondaryColorRef.current.saturation,
    secondaryLightness: secondaryColorRef.current.lightness,
    targetSecondaryLightness: secondaryColorRef.current.lightness,
    ringColors: [...ringColorsRef.current] as HslColor[],
    targetRingColors: [...ringColorsRef.current] as HslColor[],
    presence: 0,
    targetPresence: 0,
    presencePulseUntil: 0,
    spin: 0.12,
    raf: 0,
  });

  const applyFormation = useCallback((f: AvatarFormation, custom?: Array<[number, number, number]>) => {
    const s = sim.current;
    const n = particleCount;
    let pts: Array<[number, number, number]>;
    switch (f) {
      case "sphere": pts = genSphere(n); break;
      case "ring": pts = genRing(n); break;
      case "burst": pts = genBurst(n); break;
      case "globe": pts = genGlobe(n); break;
      case "custom": pts = custom && custom.length ? custom : genSphere(n); break;
      default: pts = genSupernova(n);
    }
    // Map (cycle) the formation points onto the particle count.
    for (let i = 0; i < n; i++) {
      const p = pts[i % pts.length];
      s.target[i * 3] = p[0];
      s.target[i * 3 + 1] = p[1];
      s.target[i * 3 + 2] = p[2];
    }
    s.formation = f;
  }, [particleCount]);

  const stateRef = useRef<AvatarState>(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const applyPresencePalette = (detail: AiAppPresenceDetail) => {
    const s = sim.current;
    const basePrimary = hexToHsl(particleColorForState(stateRef.current, themeColorsRef.current));
    // Failure remains unmistakably red even while an app is being previewed.
    const isError = stateRef.current === "error";
    const baseSecondary = isError ? basePrimary : secondaryColorRef.current;
    const setTargets = (
      primary: HslColor,
      secondary: HslColor,
      rings: readonly HslColor[] = ringColorsRef.current,
    ) => {
      s.targetHue = primary.hue;
      s.targetSaturation = primary.saturation;
      s.targetLightness = primary.lightness;
      s.targetSecondaryHue = secondary.hue;
      s.targetSecondarySaturation = secondary.saturation;
      s.targetSecondaryLightness = secondary.lightness;
      s.targetRingColors = rings.map((ring) => ({ ...ring }));
    };
    if (isError) {
      setTargets(basePrimary, baseSecondary, [basePrimary, basePrimary, basePrimary]);
      s.targetPresence = 0;
      return;
    }
    if (detail.phase === "ring") {
      setTargets(basePrimary, baseSecondary);
      s.targetPresence = 0.28;
      return;
    }
    const hues = aiAppPresenceHues(detail);
    if (detail.phase === "clear" || !hues) {
      setTargets(basePrimary, baseSecondary);
      s.targetPresence = 0;
      return;
    }
    const launch = detail.phase === "launch";
    const primaryPresence = hexToHsl(detail.primary || particleColorForState(stateRef.current, themeColorsRef.current));
    const secondaryPresence = hexToHsl(detail.secondary || themeColorsRef.current.secondary);
    const primaryWeight = launch ? 0.78 : 0.62;
    const secondaryWeight = launch ? 0.9 : 0.82;
    const blendedPrimary = {
      hue: blendHue(basePrimary.hue, hues.primary, primaryWeight),
      saturation: basePrimary.saturation + (primaryPresence.saturation - basePrimary.saturation) * primaryWeight,
      lightness: basePrimary.lightness + (primaryPresence.lightness - basePrimary.lightness) * primaryWeight,
    };
    const blendedSecondary = {
      hue: blendHue(baseSecondary.hue, hues.secondary, secondaryWeight),
      saturation: baseSecondary.saturation + (secondaryPresence.saturation - baseSecondary.saturation) * secondaryWeight,
      lightness: baseSecondary.lightness + (secondaryPresence.lightness - baseSecondary.lightness) * secondaryWeight,
    };
    const presenceMid = blendHslColor(primaryPresence, secondaryPresence, 0.5);
    setTargets(blendedPrimary, blendedSecondary, ringColorsRef.current.map((ring, index) =>
      blendHslColor(ring, index === 0 ? primaryPresence : index === 1 ? secondaryPresence : presenceMid, primaryWeight)));
    s.targetPresence = launch ? 1 : 0.72;
    if (launch) s.presencePulseUntil = performance.now() + 720;
  };

  useEffect(() => {
    const updateHue = (colors: ThemeColors) => {
      themeColorsRef.current = colors;
      secondaryColorRef.current = hexToHsl(colors.secondary);
      ringColorsRef.current = [hexToHsl(colors.aiRingOne), hexToHsl(colors.aiRingTwo), hexToHsl(colors.aiRingThree)];
      applyPresencePalette(presenceRef.current);
    };
    const onThemeChange = (event: Event) => {
      updateHue(normalizeThemeColors((event as CustomEvent<ThemeColors>).detail));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "jz-theme-colors-v1") updateHue(loadThemeColors());
    };
    window.addEventListener(THEME_COLORS_EVENT, onThemeChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(THEME_COLORS_EVENT, onThemeChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  useEffect(() => {
    let launchTimer = 0;
    const onPresence = (event: Event) => {
      const detail = normalizeAiAppPresenceDetail((event as CustomEvent<AiAppPresenceDetail>).detail);
      if ((detail.phase === "clear" || detail.phase === "ring")
        && presenceRef.current.phase === "launch"
        && performance.now() < sim.current.presencePulseUntil) return;
      presenceRef.current = detail;
      applyPresencePalette(detail);
      if (detail.phase === "launch") {
        if (launchTimer) window.clearTimeout(launchTimer);
        launchTimer = window.setTimeout(() => {
          if (presenceRef.current.phase !== "launch" || presenceRef.current.targetId !== detail.targetId) return;
          presenceRef.current = { phase: "clear" };
          applyPresencePalette(presenceRef.current);
        }, 760);
      }
    };
    window.addEventListener(AI_APP_PRESENCE_EVENT, onPresence);
    return () => {
      window.removeEventListener(AI_APP_PRESENCE_EVENT, onPresence);
      if (launchTimer) window.clearTimeout(launchTimer);
    };
  }, []);
  const reducedMotionRef = useRef(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { reducedMotionRef.current = query.matches; };
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);


  useImperativeHandle(ref, () => ({
    setFormation: (f) => { sim.current.explicitFormation = f !== "supernova"; applyFormation(f); },
    morphTo: (points, opts) => {
      sim.current.explicitFormation = true;
      if (opts?.spin !== undefined) sim.current.spin = opts.spin;
      applyFormation("custom", points);
    },
    setMarkers: (markers) => { sim.current.markers = markers.slice(0, 40); },
    setAmplitude: (v) => { sim.current.amplitude = Math.max(0, Math.min(1, v)); },
  }), [applyFormation]);

  // State-driven formation + hue (only when not explicitly overridden).
  useEffect(() => {
    const s = sim.current;
    applyPresencePalette(presenceRef.current);
    if (!s.explicitFormation) applyFormation(particleFormationForState(state));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    const s = sim.current;
    const n = particleCount;
    // Initialize at the supernova so first paint is the idle body.
    if (s.pos.length !== n * 3) {
      const init = genSupernova(n);
      s.pos = new Array(n * 3);
      s.target = new Array(n * 3);
      s.seed = new Array(n);
      for (let i = 0; i < n; i++) {
        s.pos[i * 3] = init[i][0]; s.pos[i * 3 + 1] = init[i][1]; s.pos[i * 3 + 2] = init[i][2];
        s.target[i * 3] = init[i][0]; s.target[i * 3 + 1] = init[i][1]; s.target[i * 3 + 2] = init[i][2];
        s.seed[i] = Math.random() * TAU;
      }
      applyFormation(particleFormationForState(state));
    }

    let rot = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const motion = particleAvatarMotionFrame({
        state: stateRef.current,
        nowMs: now,
        amplitude: s.amplitude,
        reducedMotion: reducedMotionRef.current,
      });
      if (motion.moving) rot += s.spin * dt;
      // Theme and app colors travel through the body instead of recoloring it
      // abruptly. Reduced-motion users receive the same information at once.
      if (motion.moving) {
        const paletteEase = Math.min(1, dt * 4.2);
        s.hue = blendHue(s.hue, s.targetHue, paletteEase);
        s.saturation += (s.targetSaturation - s.saturation) * paletteEase;
        s.lightness += (s.targetLightness - s.lightness) * paletteEase;
        s.secondaryHue = blendHue(s.secondaryHue, s.targetSecondaryHue, paletteEase);
        s.secondarySaturation += (s.targetSecondarySaturation - s.secondarySaturation) * paletteEase;
        s.secondaryLightness += (s.targetSecondaryLightness - s.secondaryLightness) * paletteEase;
        s.ringColors = s.ringColors.map((ring, index) => blendHslColor(ring, s.targetRingColors[index] || ring, paletteEase));
        s.presence += (s.targetPresence - s.presence) * Math.min(1, dt * 5.5);
      } else {
        s.hue = s.targetHue;
        s.saturation = s.targetSaturation;
        s.lightness = s.targetLightness;
        s.secondaryHue = s.targetSecondaryHue;
        s.secondarySaturation = s.targetSecondarySaturation;
        s.secondaryLightness = s.targetSecondaryLightness;
        s.ringColors = s.targetRingColors.map((ring) => ({ ...ring }));
        s.presence = s.targetPresence;
      }

      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      const scale = (Math.min(W, H) / 2) * 0.82;
      // Thinking = the atom expands and collapses back into itself (explode /
      // implode) — a pronounced pulse, NOT a formation change. Otherwise the
      // gentle idle breathe + audio amplitude.
      const launchPulse = motion.moving && now < s.presencePulseUntil
        ? Math.max(0, (s.presencePulseUntil - now) / 720)
        : 0;
      const presenceScale = 1 + s.presence * 0.024 + launchPulse * 0.052;
      const breathe = motion.scale * presenceScale;
      const yaw = rot;
      const cosR = Math.cos(yaw), sinR = Math.sin(yaw);

      // Core glow (the nova heart) — cheap radial gradient.
      const glowR = scale * (0.22
        + (motion.moving ? 0.10 * Math.sin(motion.timeMs / 900) * 0.5 : 0)
        + motion.speakingAmplitude * 0.25
        + s.presence * 0.045
        + launchPulse * 0.06);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR * 2.2);
      g.addColorStop(0, `hsla(${s.hue}, ${s.saturation}%, ${Math.min(100, s.lightness + 20)}%, ${0.55 + s.presence * 0.08})`);
      g.addColorStop(0.42, `hsla(${s.secondaryHue}, ${s.secondarySaturation}%, ${Math.min(100, s.secondaryLightness + 8)}%, ${0.18 + s.presence * 0.08})`);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.fillRect(cx - glowR * 2.2, cy - glowR * 2.2, glowR * 4.4, glowR * 4.4);

      // Particles.
      for (let i = 0; i < n; i++) {
        const ix = i * 3;
        // Seek the target formation (spring-less critically-damped-ish lerp).
        if (motion.moving) {
          s.pos[ix] += (s.target[ix] - s.pos[ix]) * Math.min(1, dt * 2.6);
          s.pos[ix + 1] += (s.target[ix + 1] - s.pos[ix + 1]) * Math.min(1, dt * 2.6);
          s.pos[ix + 2] += (s.target[ix + 2] - s.pos[ix + 2]) * Math.min(1, dt * 2.6);
        } else {
          s.pos[ix] = s.target[ix];
          s.pos[ix + 1] = s.target[ix + 1];
          s.pos[ix + 2] = s.target[ix + 2];
        }

        // Shimmer: tiny per-particle oscillation so the body feels alive.
        const sh = motion.moving ? 0.012 * Math.sin(motion.timeMs / 600 + s.seed[i]) : 0;
        const x0 = (s.pos[ix] + sh) * breathe;
        let y0 = (s.pos[ix + 1] + sh * 0.6) * breathe;
        let z0 = (s.pos[ix + 2]) * breathe;

        // Y-axis rotation, then perspective.
        const x = x0 * cosR + z0 * sinR;
        const z = -x0 * sinR + z0 * cosR;
        const persp = 1 / (1.8 - z * 0.55);
        const px = cx + x * scale * persp;
        const py = cy + y0 * scale * persp;

        const depthAlpha = 0.25 + 0.75 * Math.max(0, Math.min(1, (z + 1) / 2));
        const tw = motion.moving ? 0.65 + 0.35 * Math.sin(motion.timeMs / 300 + s.seed[i] * 3) : 1;
        const r = Math.max(0.5, 1.1 * persp * dpr * tw * (1 + s.presence * 0.11));
        const secondaryParticle = ((s.seed[i] * 997) % 1) < 0.14 + s.presence * 0.14;
        const particleHue = secondaryParticle ? s.secondaryHue : s.hue;
        const particleSaturation = secondaryParticle ? s.secondarySaturation : s.saturation;
        const particleLightness = secondaryParticle ? s.secondaryLightness : s.lightness;
        const hueI = particleHue;
        const lightI = Math.max(0, Math.min(100, particleLightness + (tw - 0.65) * 12));
        ctx.fillStyle = `hsla(${hueI}, ${particleSaturation}%, ${lightI}%, ${depthAlpha * (0.85 + s.presence * 0.08)})`;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, TAU);
        ctx.fill();
      }

      // Orbital rings — three full tilted orbits hugging the particle
      // body: solid weight, slight gaps for motion legibility, accent
      // ticks riding each plane. (v1 drew two thin oversized arcs that
      // read as half-finished — these are tighter, thicker, complete.)
      {
        ctx.save();
        ctx.translate(cx, cy);
        const drawRing = (
          radius: number, squashY: number, tilt: number, speed: number,
          width: number, alpha: number, baseColor: HslColor, ticks: number,
        ) => {
          const ringHue = baseColor.hue;
          const ringSaturation = baseColor.saturation;
          const ringLightness = baseColor.lightness;
          ctx.save();
          ctx.rotate(tilt + motion.timeMs / speed);
          ctx.scale(1, squashY);
          ctx.lineWidth = width * dpr;
          ctx.lineCap = "round";
          // Near-complete orbit: two long arcs with two small gaps.
          ctx.strokeStyle = `hsla(${ringHue}, ${ringSaturation}%, ${ringLightness}%, ${alpha})`;
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0.08, Math.PI - 0.08);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, radius, Math.PI + 0.08, TAU - 0.08);
          ctx.stroke();
          // Soft under-glow stroke widens the ring's presence.
          ctx.lineWidth = width * 2.6 * dpr;
          ctx.strokeStyle = `hsla(${ringHue}, ${ringSaturation}%, ${ringLightness}%, ${alpha * (0.22 + s.presence * 0.08)})`;
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, TAU);
          ctx.stroke();
          // Accent ticks orbiting this plane.
          for (let t = 0; t < ticks; t++) {
            const ang = motion.timeMs / (speed * 0.42) + (t * TAU) / ticks;
            const ex = Math.cos(ang) * radius;
            const ey = Math.sin(ang) * radius;
            // Electron: halo + bright core, with a dim trailing tick.
            ctx.fillStyle = `hsla(${ringHue}, ${ringSaturation}%, ${ringLightness}%, 0.25)`;
            ctx.beginPath();
            ctx.arc(ex, ey, 6 * dpr, 0, TAU);
            ctx.fill();
            ctx.fillStyle = `hsla(${ringHue}, ${ringSaturation}%, ${Math.min(100, ringLightness + 14)}%, 1)`;
            ctx.beginPath();
            ctx.arc(ex, ey, 2.8 * dpr, 0, TAU);
            ctx.fill();
            const trail = ang - 0.35;
            ctx.fillStyle = `hsla(${ringHue}, ${ringSaturation}%, ${Math.min(100, ringLightness + 7)}%, 0.35)`;
            ctx.beginPath();
            ctx.arc(Math.cos(trail) * radius, Math.sin(trail) * radius, 1.8 * dpr, 0, TAU);
            ctx.fill();
          }
          ctx.restore();
        };
        // Atom configuration: three orbits of EQUAL radius whose planes
        // cross at ~60° steps through the nucleus — the classic atom
        // mark — each carrying one bright electron and a dim trailing
        // tick. (Equal radii + crossing planes is what makes it read
        // "atom" instead of "Saturn".)
        const R = scale * motion.ringRadiusFactor;
        for (const [index, ring] of PARTICLE_RING_SPECS.entries()) {
          const ringBaseColor = s.ringColors[index]
            || { hue: s.hue, saturation: s.saturation, lightness: s.lightness };
          drawRing(R, 0.36, ring.tilt, ring.speedMs, 2.2, ring.alpha, ringBaseColor, 1);
        }
        ctx.restore();
      }

      // Markers (part labels / sub-tag callouts). Two passes: project +
      // draw dots, then lay out labels with greedy de-collision so they
      // never stack on top of each other (the old single-pass fillText
      // overlapped — "udder area" landing on "leg base").
      s.markerScreens = [];
      const projected: Array<{ m: AvatarMarker; px: number; py: number; depth: number }> = [];
      for (const m of s.markers) {
        const my = m.y, mzz = m.z;
        const x = m.x * cosR + mzz * sinR;
        const z = -m.x * sinR + mzz * cosR;
        const persp = 1 / (1.8 - z * 0.55);
        if (z < -0.15) continue; // back-face cull labels
        const px = cx + x * scale * persp * breathe;
        const py = cy + my * scale * persp * breathe;
        s.markerScreens.push({ m, x: px / dpr, y: py / dpr });
        projected.push({ m, px, py, depth: z });
      }
      // Nearest first — closer labels claim their slot before farther ones.
      projected.sort((a, b) => b.depth - a.depth);

      // Dots.
      for (const p of projected) {
        const sub = p.m.isSubTag;
        const dotColor = p.m.color || (p.m.internal
          ? `hsla(${s.secondaryHue}, ${s.secondarySaturation}%, ${s.secondaryLightness}%, 0.95)`
          : `hsla(${s.hue}, ${s.saturation}%, ${s.lightness}%, 0.95)`);
        if (sub) {
          // Sub-tag: pulsing halo so drill-down callouts read as live.
          const pulse = motion.moving ? 0.5 + 0.5 * Math.sin(motion.timeMs / 360 + p.px * 0.01) : 0.5;
          ctx.fillStyle = p.m.color || `hsla(${s.secondaryHue}, ${s.secondarySaturation}%, ${s.secondaryLightness}%, ${0.18 + pulse * 0.18})`;
          ctx.beginPath();
          ctx.arc(p.px, p.py, (7 + pulse * 3) * dpr, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = dotColor;
        ctx.beginPath();
        ctx.arc(p.px, p.py, 3 * dpr, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.arc(p.px, p.py, 5.5 * dpr, 0, TAU);
        ctx.stroke();
      }

      // Labels with greedy vertical de-collision + a soft chip behind
      // the text so it stays legible over the particle field.
      const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
      const lineH = 17 * dpr;
      ctx.font = `${10.5 * dpr}px ui-monospace, monospace`;
      ctx.textBaseline = "middle";
      for (const p of projected) {
        if (!p.m.label) continue;
        const text = p.m.label.slice(0, 24);
        const padX = 6 * dpr;
        const w = ctx.measureText(text).width + padX * 2;
        const h = 15 * dpr;
        const lx = p.px + 9 * dpr;
        let ly = p.py - 7 * dpr;
        // Nudge down until this chip clears every already-placed chip.
        let guard = 0;
        const hits = (yy: number) => placed.some((r) =>
          lx < r.x + r.w && lx + w > r.x && yy - h / 2 < r.y + r.h && yy + h / 2 > r.y);
        while (hits(ly) && guard < 12) { ly += lineH; guard++; }
        placed.push({ x: lx, y: ly - h / 2, w, h });
        // Leader from the dot to a nudged label so the link stays clear.
        if (Math.abs(ly - (p.py - 7 * dpr)) > 2 * dpr) {
          ctx.strokeStyle = "rgba(150,220,255,0.32)";
          ctx.lineWidth = dpr;
          ctx.beginPath();
          ctx.moveTo(p.px + 5 * dpr, p.py);
          ctx.lineTo(lx, ly);
          ctx.stroke();
        }
        // Chip background.
        const accent = p.m.isSubTag
          ? `hsla(${s.secondaryHue}, ${s.secondarySaturation}%, ${s.secondaryLightness}%, 0.9)`
          : `hsla(${s.hue}, ${s.saturation}%, ${s.lightness}%, 0.9)`;
        roundRect(ctx, lx, ly - h / 2, w, h, 5 * dpr);
        ctx.fillStyle = "rgba(6,16,26,0.72)";
        ctx.fill();
        ctx.strokeStyle = accent.replace(/0\.9\)$/, "0.4)");
        ctx.lineWidth = dpr;
        ctx.stroke();
        ctx.fillStyle = "rgba(226,246,255,0.96)";
        ctx.fillText(text, lx + padX, ly);
      }
      ctx.textBaseline = "alphabetic";

      s.raf = requestAnimationFrame(frame);
    };
    s.raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(s.raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, particleCount]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (onMarkerClick) {
      let best: { m: AvatarMarker; d: number; x: number; y: number } | null = null;
      for (const ms of sim.current.markerScreens) {
        const d = Math.hypot(ms.x - x, ms.y - y);
        if (d < 18 && (!best || d < best.d)) best = { m: ms.m, d, x: ms.x, y: ms.y };
      }
      if (best) { onMarkerClick(best.m, { x: best.x, y: best.y }); return; }
    }
    onClick?.();
  };

  const handleCanvasKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!onClick || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onClick();
  };

  return (
    <div className={className} style={{ position: "relative", width: size, height: size }}>
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size, cursor: onClick || onMarkerClick ? "pointer" : undefined }}
        onClick={handleCanvasClick}
        onKeyDown={handleCanvasKeyDown}
        role={onClick ? "button" : "img"}
        tabIndex={onClick ? 0 : undefined}
        aria-haspopup={onClick ? "menu" : undefined}
        aria-expanded={onClick ? ariaExpanded : undefined}
        aria-label={ariaLabel || "Jahaziel"}
      />
    </div>
  );
});
