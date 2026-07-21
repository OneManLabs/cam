export interface DepthPass {
  z: number;
  isLast: boolean;
}

export function computeDepthPasses(
  totalDepth: number,
  depthPerPass: number,
): DepthPass[] {
  const passes: DepthPass[] = [];
  let z = -depthPerPass;
  while (z > -totalDepth + 0.0001) {
    passes.push({ z, isLast: false });
    z -= depthPerPass;
  }
  passes.push({ z: -totalDepth, isLast: true });
  return passes;
}
