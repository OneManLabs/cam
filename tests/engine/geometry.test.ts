import { describe, it, expect } from 'vitest';
import {
  distance,
  pointsEqual,
  normalizeAngle,
  signedArea,
  pointInPolygon,
  computeBounds,
  tessellateArc,
} from '../../src/engine/geometry/utils';
import { buildChains, detectLoops, analyzeGeometry } from '../../src/engine/geometry/loops';
import type { LineSegment, ArcSegment, CircleEntity } from '../../src/engine/geometry/types';

describe('geometry utils', () => {
  it('computes distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
  });

  it('compares points with tolerance', () => {
    expect(pointsEqual({ x: 0, y: 0 }, { x: 0.0005, y: 0.0005 })).toBe(true);
    expect(pointsEqual({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);
  });

  it('normalizes angles', () => {
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(0)).toBe(0);
  });

  it('computes signed area (CCW = positive)', () => {
    // CCW square
    const ccwSquare = [
      { x: 0, y: 0 }, { x: 10, y: 0 },
      { x: 10, y: 10 }, { x: 0, y: 10 },
    ];
    expect(signedArea(ccwSquare)).toBeCloseTo(100);

    // CW square
    const cwSquare = [
      { x: 0, y: 0 }, { x: 0, y: 10 },
      { x: 10, y: 10 }, { x: 10, y: 0 },
    ];
    expect(signedArea(cwSquare)).toBeCloseTo(-100);
  });

  it('point in polygon', () => {
    const square = [
      { x: 0, y: 0 }, { x: 10, y: 0 },
      { x: 10, y: 10 }, { x: 0, y: 10 },
    ];
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
  });

  it('computes bounds', () => {
    const points = [{ x: -5, y: 2 }, { x: 10, y: -3 }, { x: 0, y: 8 }];
    const bounds = computeBounds(points);
    expect(bounds.minX).toBe(-5);
    expect(bounds.minY).toBe(-3);
    expect(bounds.maxX).toBe(10);
    expect(bounds.maxY).toBe(8);
  });

  it('tessellates arc into points', () => {
    const arc: ArcSegment = {
      type: 'arc',
      center: { x: 0, y: 0 },
      radius: 10,
      startAngle: 0,
      endAngle: Math.PI / 2,
      clockwise: false,
      start: { x: 10, y: 0 },
      end: { x: 0, y: 10 },
    };
    const pts = tessellateArc(arc, 0.1);
    expect(pts.length).toBeGreaterThan(2);
    expect(pts[0].x).toBeCloseTo(10);
    expect(pts[0].y).toBeCloseTo(0);
    expect(pts[pts.length - 1].x).toBeCloseTo(0);
    expect(pts[pts.length - 1].y).toBeCloseTo(10);
  });
});

describe('loop detection', () => {
  it('builds chains from connected segments', () => {
    const segs: LineSegment[] = [
      { type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
      { type: 'line', start: { x: 10, y: 0 }, end: { x: 10, y: 10 } },
      { type: 'line', start: { x: 10, y: 10 }, end: { x: 0, y: 10 } },
      { type: 'line', start: { x: 0, y: 10 }, end: { x: 0, y: 0 } },
    ];
    const chains = buildChains(segs);
    expect(chains.length).toBe(1);
    expect(chains[0].length).toBe(4);
  });

  it('detects closed loops', () => {
    const segs: LineSegment[] = [
      { type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
      { type: 'line', start: { x: 10, y: 0 }, end: { x: 10, y: 10 } },
      { type: 'line', start: { x: 10, y: 10 }, end: { x: 0, y: 10 } },
      { type: 'line', start: { x: 0, y: 10 }, end: { x: 0, y: 0 } },
    ];
    const chains = buildChains(segs);
    const loops = detectLoops(chains);
    expect(loops.length).toBe(1);
    expect(loops[0].closed).toBe(true);
    expect(loops[0].winding).toBe('ccw');
  });

  it('identifies open paths', () => {
    const segs: LineSegment[] = [
      { type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
      { type: 'line', start: { x: 10, y: 0 }, end: { x: 10, y: 10 } },
    ];
    const chains = buildChains(segs);
    const loops = detectLoops(chains);
    expect(loops.length).toBe(0); // not closed
  });
});

describe('region detection', () => {
  it('identifies outer and island loops', () => {
    // Outer square
    const outer: LineSegment[] = [
      { type: 'line', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      { type: 'line', start: { x: 100, y: 0 }, end: { x: 100, y: 100 } },
      { type: 'line', start: { x: 100, y: 100 }, end: { x: 0, y: 100 } },
      { type: 'line', start: { x: 0, y: 100 }, end: { x: 0, y: 0 } },
    ];
    // Inner square (island)
    const inner: LineSegment[] = [
      { type: 'line', start: { x: 25, y: 25 }, end: { x: 75, y: 25 } },
      { type: 'line', start: { x: 75, y: 25 }, end: { x: 75, y: 75 } },
      { type: 'line', start: { x: 75, y: 75 }, end: { x: 25, y: 75 } },
      { type: 'line', start: { x: 25, y: 75 }, end: { x: 25, y: 25 } },
    ];

    const result = analyzeGeometry([...outer, ...inner], []);
    expect(result.loops.length).toBe(2);
    expect(result.regions.length).toBe(1);
    expect(result.regions[0].islands.length).toBe(1);
  });

  it('handles circles as loops', () => {
    const circles: CircleEntity[] = [
      { type: 'circle', center: { x: 50, y: 50 }, radius: 10 },
    ];
    const result = analyzeGeometry([], circles);
    expect(result.loops.length).toBe(1);
    expect(result.loops[0].closed).toBe(true);
  });
});
