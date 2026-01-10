declare module "canvas-confetti" {
  type ConfettiOptions = {
    particleCount?: number;
    angle?: number;
    spread?: number;
    startVelocity?: number;
    decay?: number;
    gravity?: number;
    drift?: number;
    ticks?: number;
    origin?: { x?: number; y?: number };
    colors?: string[];
    shapes?: string[];
    scalar?: number;
    zIndex?: number;
    disableForReducedMotion?: boolean;
  };

  type ConfettiFn = (options?: ConfettiOptions) => void;

  const confetti: ConfettiFn;
  export default confetti;
}
