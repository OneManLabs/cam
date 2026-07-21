import type { CircleEntity, LineSegment, Point2D, Segment } from './types';

/**
 * Creates a rectangle centered at (cx, cy) with the given width and height.
 * Returns 4 line segments forming a closed loop in CCW order.
 */
export function createRectangle(
  cx: number,
  cy: number,
  width: number,
  height: number
): Segment[] {
  const hw = width / 2;
  const hh = height / 2;

  const topLeft: Point2D = { x: cx - hw, y: cy + hh };
  const topRight: Point2D = { x: cx + hw, y: cy + hh };
  const bottomRight: Point2D = { x: cx + hw, y: cy - hh };
  const bottomLeft: Point2D = { x: cx - hw, y: cy - hh };

  const segments: LineSegment[] = [
    { type: 'line', start: bottomLeft, end: bottomRight },
    { type: 'line', start: bottomRight, end: topRight },
    { type: 'line', start: topRight, end: topLeft },
    { type: 'line', start: topLeft, end: bottomLeft },
  ];

  return segments;
}

/**
 * Creates a CircleEntity centered at (cx, cy) with the given radius.
 * The existing pipeline handles converting these to loops.
 */
export function createCircleEntity(
  cx: number,
  cy: number,
  radius: number
): CircleEntity {
  return {
    type: 'circle',
    center: { x: cx, y: cy },
    radius,
  };
}

export const createCircleSegments = createCircleEntity;

/**
 * Creates a regular polygon with N sides inscribed in a circle of the given
 * radius, centered at (cx, cy). Vertices are generated in CCW order starting
 * from the rightmost point (angle = 0).
 */
export function createPolygon(
  cx: number,
  cy: number,
  radius: number,
  sides: number
): Segment[] {
  if (sides < 3) {
    throw new Error('A polygon must have at least 3 sides');
  }

  const vertices: Point2D[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (2 * Math.PI * i) / sides;
    vertices.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }

  const segments: LineSegment[] = [];
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    segments.push({
      type: 'line',
      start: vertices[i],
      end: vertices[next],
    });
  }

  return segments;
}

/**
 * Creates a star shape centered at (cx, cy) by alternating between vertices
 * on an outer circle and an inner circle. The star has the specified number
 * of points. Vertices are connected with line segments in CCW order.
 */
export function createStar(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  points: number
): Segment[] {
  if (points < 3) {
    throw new Error('A star must have at least 3 points');
  }

  const totalVertices = points * 2;
  const vertices: Point2D[] = [];

  for (let i = 0; i < totalVertices; i++) {
    const angle = (2 * Math.PI * i) / totalVertices;
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    vertices.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }

  const segments: LineSegment[] = [];
  for (let i = 0; i < totalVertices; i++) {
    const next = (i + 1) % totalVertices;
    segments.push({
      type: 'line',
      start: vertices[i],
      end: vertices[next],
    });
  }

  return segments;
}
