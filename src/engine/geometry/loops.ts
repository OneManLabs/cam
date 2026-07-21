import type {
  Segment,
  CircleEntity,
  Loop,
  Region,
  Point2D,
  ArcSegment,
} from './types';
import {
  pointsEqual,
  signedArea,
  loopToPoints,
  computeBoundsFromSegments,
  pointInPolygon,
} from './utils';

function getStart(seg: Segment): Point2D {
  return seg.start;
}

function getEnd(seg: Segment): Point2D {
  return seg.end;
}

function reverseSegment(seg: Segment): Segment {
  if (seg.type === 'line') {
    return { type: 'line', start: seg.end, end: seg.start };
  }
  // Reverse an arc: swap start/end, flip clockwise
  return {
    type: 'arc',
    center: seg.center,
    radius: seg.radius,
    startAngle: seg.endAngle,
    endAngle: seg.startAngle,
    clockwise: !seg.clockwise,
    start: seg.end,
    end: seg.start,
  };
}

export function buildChains(
  segments: Segment[],
  tolerance = 0.001,
): Segment[][] {
  const used = new Array(segments.length).fill(false);
  const chains: Segment[][] = [];

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = true;

    const chain: Segment[] = [segments[i]];
    let changed = true;

    while (changed) {
      changed = false;
      const chainStart = getStart(chain[0]);
      const chainEnd = getEnd(chain[chain.length - 1]);

      // Check if chain is already closed
      if (chain.length > 1 && pointsEqual(chainStart, chainEnd, tolerance)) {
        break;
      }

      for (let j = 0; j < segments.length; j++) {
        if (used[j]) continue;
        const seg = segments[j];
        const segStart = getStart(seg);
        const segEnd = getEnd(seg);

        // Try to append to end of chain
        if (pointsEqual(chainEnd, segStart, tolerance)) {
          chain.push(seg);
          used[j] = true;
          changed = true;
        } else if (pointsEqual(chainEnd, segEnd, tolerance)) {
          chain.push(reverseSegment(seg));
          used[j] = true;
          changed = true;
        }
        // Try to prepend to start of chain
        else if (pointsEqual(chainStart, segEnd, tolerance)) {
          chain.unshift(seg);
          used[j] = true;
          changed = true;
        } else if (pointsEqual(chainStart, segStart, tolerance)) {
          chain.unshift(reverseSegment(seg));
          used[j] = true;
          changed = true;
        }
      }
    }
    chains.push(chain);
  }

  return chains;
}

let loopCounter = 0;

function makeLoop(segments: Segment[], closed: boolean): Loop {
  const bounds = computeBoundsFromSegments(segments);
  const points = closed ? loopToPointsFromSegments(segments, closed) : [];
  const area = closed ? signedArea(points) : 0;

  return {
    id: `loop-${loopCounter++}`,
    segments,
    closed,
    bounds,
    area,
    winding: area >= 0 ? 'ccw' : 'cw',
  };
}

function loopToPointsFromSegments(
  segments: Segment[],
  closed: boolean,
): Point2D[] {
  // Build a temporary loop object to reuse loopToPoints logic
  const tmpLoop: Loop = {
    id: '',
    segments,
    closed,
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    area: 0,
    winding: 'ccw',
  };
  return loopToPoints(tmpLoop);
}

function circleToLoop(circle: CircleEntity): Loop {
  const { center, radius } = circle;
  // Represent circle as two arc segments (upper and lower halves)
  const topArc: ArcSegment = {
    type: 'arc',
    center,
    radius,
    startAngle: 0,
    endAngle: Math.PI,
    clockwise: false,
    start: { x: center.x + radius, y: center.y },
    end: { x: center.x - radius, y: center.y },
  };
  const bottomArc: ArcSegment = {
    type: 'arc',
    center,
    radius,
    startAngle: Math.PI,
    endAngle: 2 * Math.PI,
    clockwise: false,
    start: { x: center.x - radius, y: center.y },
    end: { x: center.x + radius, y: center.y },
  };
  const segments: Segment[] = [topArc, bottomArc];
  const bounds = {
    minX: center.x - radius,
    minY: center.y - radius,
    maxX: center.x + radius,
    maxY: center.y + radius,
  };
  const area = Math.PI * radius * radius; // positive = CCW

  return {
    id: `loop-${loopCounter++}`,
    segments,
    closed: true,
    bounds,
    area,
    winding: 'ccw',
  };
}

export function detectLoops(chains: Segment[][]): Loop[] {
  const loops: Loop[] = [];
  for (const chain of chains) {
    if (chain.length === 0) continue;
    const start = getStart(chain[0]);
    const end = getEnd(chain[chain.length - 1]);
    const closed = pointsEqual(start, end);
    if (closed) {
      loops.push(makeLoop(chain, true));
    }
  }
  return loops;
}

export function normalizeWinding(loop: Loop): Loop {
  if (loop.winding === 'ccw') return loop;
  // Reverse all segments and their order
  const reversed = loop.segments
    .slice()
    .reverse()
    .map(reverseSegment);
  const points = loopToPointsFromSegments(reversed, true);
  const area = signedArea(points);
  return {
    ...loop,
    segments: reversed,
    area,
    winding: 'ccw',
  };
}

function loopCentroid(loop: Loop): Point2D {
  const points = loopToPoints(loop);
  if (points.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

export function buildRegions(loops: Loop[]): Region[] {
  // Normalize all loops to CCW for outer, then determine containment
  const normalized = loops.map(normalizeWinding);

  // Sort by absolute area descending (largest first)
  const sorted = normalized
    .slice()
    .sort((a, b) => Math.abs(b.area) - Math.abs(a.area));

  const regions: Region[] = [];
  const assigned = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const outer = sorted[i];
    if (assigned.has(outer.id)) continue;
    assigned.add(outer.id);

    const outerPoints = loopToPoints(outer);
    const islands: Loop[] = [];

    for (let j = i + 1; j < sorted.length; j++) {
      const candidate = sorted[j];
      if (assigned.has(candidate.id)) continue;

      const centroid = loopCentroid(candidate);
      if (pointInPolygon(centroid, outerPoints)) {
        // This is an island inside the outer loop
        // Reverse winding to CW for islands
        const island: Loop = {
          ...candidate,
          segments: candidate.segments.slice().reverse().map(reverseSegment),
          area: -candidate.area,
          winding: 'cw',
        };
        islands.push(island);
        assigned.add(candidate.id);
      }
    }

    regions.push({
      id: `region-${i}`,
      outer,
      islands,
    });
  }

  return regions;
}

export function analyzeGeometry(
  segments: Segment[],
  circles: CircleEntity[],
  preClosedPaths?: Segment[][],
): { loops: Loop[]; regions: Region[]; openPaths: Segment[][] } {
  // Reset counter for deterministic IDs within a single analysis
  loopCounter = 0;

  const chains = buildChains(segments);

  // Separate closed and open chains
  const closedChains: Segment[][] = [];
  const openPaths: Segment[][] = [];

  for (const chain of chains) {
    if (chain.length === 0) continue;
    const start = getStart(chain[0]);
    const end = getEnd(chain[chain.length - 1]);
    if (pointsEqual(start, end)) {
      closedChains.push(chain);
    } else {
      openPaths.push(chain);
    }
  }

  // Add pre-formed closed paths from SVG parser (complex bezier paths that self-close)
  if (preClosedPaths) {
    for (const path of preClosedPaths) {
      closedChains.push(path);
    }
  }

  const loops = detectLoops(closedChains);

  // Convert circles to loops
  for (const circle of circles) {
    loops.push(circleToLoop(circle));
  }

  const regions = buildRegions(loops);

  return { loops, regions, openPaths };
}
