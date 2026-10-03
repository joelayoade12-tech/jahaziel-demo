export type ParticleAvatarMotionState = "idle" | "thinking" | "speaking" | "error" | "attention";
export type ParticleAvatarMotionFormation = "sphere" | "burst";

export type ParticleRingSpec = Readonly<{
  tilt: number;
  speedMs: number;
  alpha: number;
}>;

export const PARTICLE_RING_RADIUS_FACTOR = 0.78;
export const PARTICLE_RING_SPEAKING_EXPANSION = 0.06;
export const PARTICLE_THINKING_MAX_SCALE = 1.04;

/** Three equal-radius orbital planes separated by approximately 60 degrees. */
export const PARTICLE_RING_SPECS: readonly ParticleRingSpec[] = Object.freeze([
  Object.freeze({ tilt: 0.52, speedMs: 5_200, alpha: 0.6 }),
  Object.freeze({ tilt: 1.57, speedMs: -4_100, alpha: 0.55 }),
  Object.freeze({ tilt: 2.62, speedMs: 6_300, alpha: 0.5 }),
]);

export function particleFormationForState(state: ParticleAvatarMotionState): ParticleAvatarMotionFormation {
  return state === "speaking" ? "burst" : "sphere";
}

function clampAmplitude(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export type ParticleAvatarMotionFrame = Readonly<{
  scale: number;
  speakingAmplitude: number;
  ringRadiusFactor: number;
  timeMs: number;
  moving: boolean;
}>;

/** Pure animation policy used by both the canvas and deterministic contract tests. */
export function particleAvatarMotionFrame(input: {
  state: ParticleAvatarMotionState;
  nowMs: number;
  amplitude: number;
  reducedMotion: boolean;
}): ParticleAvatarMotionFrame {
  const speakingAmplitude = input.state === "speaking" ? clampAmplitude(input.amplitude) : 0;
  if (input.reducedMotion) {
    return {
      scale: 1,
      speakingAmplitude: 0,
      ringRadiusFactor: PARTICLE_RING_RADIUS_FACTOR,
      timeMs: 0,
      moving: false,
    };
  }

  const timeMs = Number.isFinite(input.nowMs) ? input.nowMs : 0;
  const scale = input.state === "thinking"
    ? 1 + 0.04 * Math.sin(timeMs / 420)
    : 1 + 0.04 * Math.sin(timeMs / 1_400) + speakingAmplitude * 0.22;
  return {
    scale,
    speakingAmplitude,
    ringRadiusFactor: PARTICLE_RING_RADIUS_FACTOR + speakingAmplitude * PARTICLE_RING_SPEAKING_EXPANSION,
    timeMs,
    moving: true,
  };
}
