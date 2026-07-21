import type { Point2D } from '../geometry/types';
import type { ToolpathMove } from './contour';

// Rapid to this distance above the surface before feed-rate plunging
// Matches Carbide Create's approach clearance (0.0098" ≈ 0.25mm)
const APPROACH_CLEARANCE = 0.25; // mm

export interface DrillParams {
  position: Point2D;
  totalDepth: number;
  safeZ: number;
  feedRate: number;
  peck: boolean;
  peckDepth: number;
  counterbore?: boolean;
  counterboreDiameter?: number; // mm — diameter of the counterbore pocket
  counterboreDepth?: number;    // mm — how deep the counterbore goes
  toolDiameter?: number;        // mm — needed for counterbore helical path
}

export function generateDrillToolpath(
  params: DrillParams,
): ToolpathMove[] {
  const { position, totalDepth, safeZ, feedRate, peck, peckDepth } = params;
  const moves: ToolpathMove[] = [];

  // --- Counterbore (sunken header) ---
  if (params.counterbore && params.counterboreDiameter && params.counterboreDepth && params.toolDiameter) {
    const cbRadius = params.counterboreDiameter / 2;
    const toolRadius = params.toolDiameter / 2;
    const helicalRadius = cbRadius - toolRadius;
    const cbDepth = params.counterboreDepth;
    const depthPerPass = Math.min(cbDepth, params.toolDiameter * 0.5);

    if (helicalRadius > 0.01) {
      moves.push({ type: 'rapid', x: position.x, y: position.y, z: safeZ });

      let currentZ = 0;
      while (currentZ < cbDepth) {
        const nextZ = Math.min(currentZ + depthPerPass, cbDepth);

        if (currentZ === 0) {
          // Approach then move to helix start
          moves.push({ type: 'rapid', x: position.x, y: position.y, z: APPROACH_CLEARANCE });
          moves.push({
            type: 'linear',
            x: position.x + helicalRadius,
            y: position.y,
            z: 0,
            feedRate: feedRate * 0.5,
          });
        }

        const steps = 32;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const angle = t * Math.PI * 2;
          const z = -(currentZ + (nextZ - currentZ) * t);
          moves.push({
            type: 'linear',
            x: position.x + helicalRadius * Math.cos(angle),
            y: position.y + helicalRadius * Math.sin(angle),
            z,
            feedRate,
          });
        }

        currentZ = nextZ;
      }

      // Final full circle at counterbore depth to clean walls
      const steps = 32;
      for (let s = 1; s <= steps; s++) {
        const angle = (s / steps) * Math.PI * 2;
        moves.push({
          type: 'linear',
          x: position.x + helicalRadius * Math.cos(angle),
          y: position.y + helicalRadius * Math.sin(angle),
          z: -cbDepth,
          feedRate,
        });
      }

      moves.push({
        type: 'linear',
        x: position.x,
        y: position.y,
        z: -cbDepth,
        feedRate,
      });

      moves.push({ type: 'rapid', x: position.x, y: position.y, z: safeZ });
    }
  }

  // --- Main drill ---
  // Rapid to position at safe Z
  moves.push({ type: 'rapid', x: position.x, y: position.y, z: safeZ });
  // Rapid down to just above surface (approach clearance)
  moves.push({ type: 'rapid', x: position.x, y: position.y, z: APPROACH_CLEARANCE });

  if (!peck) {
    // Simple drill: plunge to full depth, retract
    moves.push({
      type: 'linear',
      x: position.x,
      y: position.y,
      z: -totalDepth,
      feedRate,
    });
    moves.push({ type: 'rapid', x: position.x, y: position.y, z: safeZ });
  } else {
    // Peck drilling — retract to R-plane (approach clearance) between pecks,
    // only retract to safeZ after the final peck (matches Carbide Create)
    let currentDepth = 0;
    while (currentDepth < totalDepth) {
      const nextDepth = Math.min(currentDepth + peckDepth, totalDepth);

      // Plunge to next depth
      moves.push({
        type: 'linear',
        x: position.x,
        y: position.y,
        z: -nextDepth,
        feedRate,
      });

      currentDepth = nextDepth;

      if (currentDepth < totalDepth) {
        // Retract to R-plane (approach clearance above surface)
        moves.push({ type: 'rapid', x: position.x, y: position.y, z: APPROACH_CLEARANCE });
        // Rapid back down to just above previous depth
        moves.push({
          type: 'rapid',
          x: position.x,
          y: position.y,
          z: -currentDepth + APPROACH_CLEARANCE,
        });
      } else {
        // Final retract to safe Z
        moves.push({ type: 'rapid', x: position.x, y: position.y, z: safeZ });
      }
    }
  }

  return moves;
}
