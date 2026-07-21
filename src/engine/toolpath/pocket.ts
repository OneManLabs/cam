import ClipperLib from 'clipper-lib';
import type { Path, Paths, IntPoint } from 'clipper-lib';
import type { Region, Point2D } from '../geometry/types';
import { loopToPoints } from '../geometry/utils';
import type { ToolpathMove } from './contour';
import { computeDepthPasses } from './depthPasses';

export interface PocketParams {
  region: Region;
  toolDiameter: number;
  stepOver: number; // fraction 0-1
  totalDepth: number;
  depthPerPass: number;
  safeZ: number;
  feedRate: number;
  plungeRate: number;
  finishPass: boolean;
}

const SCALE = 1000;
const APPROACH_CLEARANCE = 0.25; // mm above surface for rapid approach

function pointsToClipperPath(points: Point2D[]): Path {
  return points.map((p) => ({
    X: Math.round(p.x * SCALE),
    Y: Math.round(p.y * SCALE),
  }));
}

function clipperPathToPoints(path: Path): Point2D[] {
  return path.map((p: IntPoint) => ({
    x: p.X / SCALE,
    y: p.Y / SCALE,
  }));
}

function subtractIslands(
  region: Region,
): Paths {
  const outerPoints = loopToPoints(region.outer);
  const outerPath = pointsToClipperPath(outerPoints);

  if (region.islands.length === 0) {
    return [outerPath];
  }

  const clipper = new ClipperLib.Clipper();
  clipper.AddPath(outerPath, ClipperLib.PolyType.ptSubject, true);

  for (const island of region.islands) {
    const islandPoints = loopToPoints(island);
    const islandPath = pointsToClipperPath(islandPoints);
    clipper.AddPath(islandPath, ClipperLib.PolyType.ptClip, true);
  }

  const result: Paths = [];
  clipper.Execute(ClipperLib.ClipType.ctDifference, result);
  return result;
}

function offsetPaths(
  paths: Paths,
  delta: number,
): Paths {
  const co = new ClipperLib.ClipperOffset();
  const solution: Paths = [];
  for (const path of paths) {
    co.AddPath(
      path,
      ClipperLib.JoinType.jtRound,
      ClipperLib.EndType.etClosedPolygon,
    );
  }
  co.Execute(solution, delta);
  return solution;
}

function generateMovesForPaths(
  paths: Point2D[][],
  z: number,
  prevZ: number | null, // Z of previous depth pass (null = first pass)
  safeZ: number,
  feedRate: number,
  plungeRate: number,
): ToolpathMove[] {
  const moves: ToolpathMove[] = [];

  for (let pi = 0; pi < paths.length; pi++) {
    const path = paths[pi];
    if (path.length === 0) continue;

    const start = path[0];

    if (pi === 0) {
      if (prevZ == null) {
        // Very first plunge: rapid to safeZ, approach clearance, then plunge
        moves.push({ type: 'rapid', x: start.x, y: start.y, z: safeZ });
        moves.push({ type: 'rapid', x: start.x, y: start.y, z: APPROACH_CLEARANCE });
        moves.push({ type: 'linear', x: start.x, y: start.y, z, feedRate: plungeRate });
      } else {
        // Subsequent depth: rapid to outermost ring start, rapid down to just above previous depth, then plunge the increment
        moves.push({ type: 'rapid', x: start.x, y: start.y, z: prevZ });
        moves.push({ type: 'linear', x: start.x, y: start.y, z, feedRate: plungeRate });
      }
    } else {
      // Between rings at same depth: rapid traverse (material already cleared)
      moves.push({ type: 'rapid', x: start.x, y: start.y, z });
    }

    // Follow path
    for (let i = 1; i < path.length; i++) {
      moves.push({ type: 'linear', x: path[i].x, y: path[i].y, z, feedRate });
    }

    // Close back to start
    moves.push({ type: 'linear', x: start.x, y: start.y, z, feedRate });
  }

  return moves;
}

export function generatePocketToolpath(
  params: PocketParams,
): ToolpathMove[] {
  const {
    region,
    toolDiameter,
    stepOver,
    totalDepth,
    depthPerPass,
    safeZ,
    feedRate,
    plungeRate,
    finishPass,
  } = params;

  const toolRadius = toolDiameter / 2;
  const stepDistance = stepOver * toolDiameter;

  // Subtract islands from outer boundary
  const basePaths = subtractIslands(region);

  // First inward offset by tool radius
  const firstOffset = offsetPaths(basePaths, -toolRadius * SCALE);

  // Generate successive inward offsets
  const allOffsetRings: Paths[] = [];
  allOffsetRings.push(firstOffset);

  let currentPaths = firstOffset;
  while (true) {
    const next = offsetPaths(currentPaths, -stepDistance * SCALE);
    if (next.length === 0) break;
    allOffsetRings.push(next);
    currentPaths = next;
  }

  // Convert all rings to Point2D paths
  const allRings: Point2D[][] = [];
  for (const ring of allOffsetRings) {
    for (const path of ring) {
      allRings.push(clipperPathToPoints(path));
    }
  }

  const depthPasses = computeDepthPasses(totalDepth, depthPerPass);
  const moves: ToolpathMove[] = [];

  // For each depth pass, cut all rings from outermost to innermost
  for (let di = 0; di < depthPasses.length; di++) {
    const pass = depthPasses[di];
    const prevZ = di === 0 ? null : depthPasses[di - 1].z;
    moves.push(
      ...generateMovesForPaths(allRings, pass.z, prevZ, safeZ, feedRate, plungeRate),
    );
  }

  // Finish pass: one final pass at full depth following the initial tool-radius offset
  if (finishPass && firstOffset.length > 0) {
    const finishPaths = firstOffset.map(clipperPathToPoints);
    const lastPassZ = depthPasses.length > 0 ? depthPasses[depthPasses.length - 1].z : null;
    moves.push(
      ...generateMovesForPaths(finishPaths, -totalDepth, lastPassZ, safeZ, feedRate, plungeRate),
    );
  }

  // Retract to safe Z after all passes
  if (moves.length > 0) {
    moves.push({ type: 'rapid', x: moves[moves.length - 1].x, y: moves[moves.length - 1].y, z: safeZ });
  }

  return moves;
}
