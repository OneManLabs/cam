import type {
  Point2D,
  ArcSegment,
  Segment,
  Loop,
  BoundingBox,
} from './types';

export function distance(a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function pointsEqual(
  a: Point2D,
  b: Point2D,
  tolerance = 0.001,
): boolean {
  return distance(a, b) <= tolerance;
}

export function normalizeAngle(angle: number): number {
  const TWO_PI = 2 * Math.PI;
  let a = angle % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a;
}

export function arcLength(arc: ArcSegment): number {
  let sweep: number;
  if (arc.clockwise) {
    sweep = normalizeAngle(arc.startAngle - arc.endAngle);
  } else {
    sweep = normalizeAngle(arc.endAngle - arc.startAngle);
  }
  if (sweep === 0) sweep = 2 * Math.PI;
  return arc.radius * sweep;
}

export function tessellateArc(
  arc: ArcSegment,
  chordTolerance = 0.01,
): Point2D[] {
  const r = arc.radius;
  if (r < 1e-9) return [arc.start, arc.end];

  let sweep: number;
  if (arc.clockwise) {
    sweep = normalizeAngle(arc.startAngle - arc.endAngle);
  } else {
    sweep = normalizeAngle(arc.endAngle - arc.startAngle);
  }
  if (sweep === 0) sweep = 2 * Math.PI;

  // Number of segments based on chord tolerance
  const stepAngle = 2 * Math.acos(1 - chordTolerance / r);
  const numSteps = Math.max(2, Math.ceil(sweep / stepAngle));

  const points: Point2D[] = [];
  for (let i = 0; i <= numSteps; i++) {
    const t = i / numSteps;
    const angle = arc.clockwise
      ? arc.startAngle - t * sweep
      : arc.startAngle + t * sweep;
    points.push({
      x: arc.center.x + r * Math.cos(angle),
      y: arc.center.y + r * Math.sin(angle),
    });
  }
  return points;
}

export function segmentToPoints(
  seg: Segment,
  chordTolerance = 0.01,
): Point2D[] {
  if (seg.type === 'line') {
    return [seg.start, seg.end];
  }
  return tessellateArc(seg, chordTolerance);
}

export function loopToPoints(
  loop: Loop,
  chordTolerance = 0.01,
): Point2D[] {
  const points: Point2D[] = [];
  for (let i = 0; i < loop.segments.length; i++) {
    const segPts = segmentToPoints(loop.segments[i], chordTolerance);
    // Skip the first point of subsequent segments to avoid duplicates
    if (i === 0) {
      points.push(...segPts);
    } else {
      points.push(...segPts.slice(1));
    }
  }
  // If closed, remove duplicate closing point
  if (
    loop.closed &&
    points.length > 1 &&
    pointsEqual(points[0], points[points.length - 1])
  ) {
    points.pop();
  }
  return points;
}

export function computeBounds(points: Point2D[]): BoundingBox {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function computeBoundsFromSegments(segments: Segment[]): BoundingBox {
  const allPoints: Point2D[] = [];
  for (const seg of segments) {
    allPoints.push(...segmentToPoints(seg));
  }
  return computeBounds(allPoints);
}

export function pointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
  // Ray casting algorithm
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function signedArea(points: Point2D[]): number {
  // Shoelace formula: positive = CCW, negative = CW
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return area / 2;
}
