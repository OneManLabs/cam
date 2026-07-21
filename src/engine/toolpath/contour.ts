import ClipperLib from 'clipper-lib';
import type { Path, IntPoint } from 'clipper-lib';
import type { Loop, Point2D } from '../geometry/types';
import { loopToPoints } from '../geometry/utils';
import { computeDepthPasses } from './depthPasses';

export type CutSide = 'inside' | 'outside' | 'on';

export interface ContourParams {
  loop: Loop;
  cutSide: CutSide;
  toolDiameter: number;
  totalDepth: number;
  depthPerPass: number;
  safeZ: number;
  feedRate: number;
  plungeRate: number;
  tabs?: { positions: Point2D[]; width: number; height: number };
}

export interface ToolpathMove {
  type: 'rapid' | 'linear' | 'arc';
  x: number;
  y: number;
  z: number;
  feedRate?: number;
  // For arcs:
  i?: number;
  j?: number;
  clockwise?: boolean;
}

const SCALE = 1000;
const APPROACH_CLEARANCE = 0.25; // mm above surface for rapid approach

function offsetLoop(loop: Loop, offset: number): Point2D[][] {
  if (offset === 0) {
    const points = loopToPoints(loop);
    return [points];
  }

  const points = loopToPoints(loop);
  const clipperPath: Path = points.map((p) => ({
    X: Math.round(p.x * SCALE),
    Y: Math.round(p.y * SCALE),
  }));

  const co = new ClipperLib.ClipperOffset();
  const solution: Path[] = [];
  co.AddPath(
    clipperPath,
    ClipperLib.JoinType.jtRound,
    ClipperLib.EndType.etClosedPolygon,
  );
  co.Execute(solution, offset * SCALE);

  return solution.map((path: Path) =>
    path.map((p: IntPoint) => ({
      x: p.X / SCALE,
      y: p.Y / SCALE,
    })),
  );
}

function distanceBetween(a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isNearTab(
  point: Point2D,
  tabs: { positions: Point2D[]; width: number; height: number },
): boolean {
  for (const tabPos of tabs.positions) {
    if (distanceBetween(point, tabPos) <= tabs.width / 2) {
      return true;
    }
  }
  return false;
}

export function generateContourToolpath(
  params: ContourParams,
): ToolpathMove[] {
  const {
    loop,
    cutSide,
    toolDiameter,
    totalDepth,
    depthPerPass,
    safeZ,
    feedRate,
    plungeRate,
    tabs,
  } = params;

  const toolRadius = toolDiameter / 2;
  let offset: number;
  switch (cutSide) {
    case 'inside':
      offset = -toolRadius;
      break;
    case 'outside':
      offset = toolRadius;
      break;
    case 'on':
      offset = 0;
      break;
  }

  const offsetPaths = offsetLoop(loop, offset);
  if (offsetPaths.length === 0) return [];

  const depthPasses = computeDepthPasses(totalDepth, depthPerPass);
  const moves: ToolpathMove[] = [];

  for (const pass of depthPasses) {
    for (const path of offsetPaths) {
      if (path.length === 0) continue;

      const startPoint = path[0];

      // Rapid to safe Z, then approach clearance before plunging
      moves.push({ type: 'rapid', x: startPoint.x, y: startPoint.y, z: safeZ });
      moves.push({ type: 'rapid', x: startPoint.x, y: startPoint.y, z: APPROACH_CLEARANCE });

      // Plunge to depth
      moves.push({
        type: 'linear',
        x: startPoint.x,
        y: startPoint.y,
        z: pass.z,
        feedRate: plungeRate,
      });

      // Follow path
      for (let i = 1; i < path.length; i++) {
        const pt = path[i];
        let z = pass.z;

        // Tab handling: raise Z at tab positions on last pass
        if (tabs && pass.isLast && isNearTab(pt, tabs)) {
          z = pass.z + tabs.height;
        }

        moves.push({
          type: 'linear',
          x: pt.x,
          y: pt.y,
          z,
          feedRate,
        });
      }

      // Close the path back to start
      {
        let z = pass.z;
        if (tabs && pass.isLast && isNearTab(startPoint, tabs)) {
          z = pass.z + tabs.height;
        }
        moves.push({
          type: 'linear',
          x: startPoint.x,
          y: startPoint.y,
          z,
          feedRate,
        });
      }
    }
  }

  // Final retract
  moves.push({
    type: 'rapid',
    x: moves[moves.length - 1].x,
    y: moves[moves.length - 1].y,
    z: safeZ,
  });

  return moves;
}
