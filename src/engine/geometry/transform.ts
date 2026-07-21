import type { Segment, CircleEntity, Point2D, BoundingBox } from './types';
import { computeBounds, segmentToPoints } from './utils';

function rotatePoint(p: Point2D, angle: number, cx: number, cy: number): Point2D {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - cx;
  const dy = p.y - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

export function translateGeometry(
  segments: Segment[],
  circles: CircleEntity[],
  dx: number,
  dy: number,
): { segments: Segment[]; circles: CircleEntity[] } {
  const newSegments = segments.map((seg): Segment => {
    if (seg.type === 'line') {
      return {
        ...seg,
        start: { x: seg.start.x + dx, y: seg.start.y + dy },
        end: { x: seg.end.x + dx, y: seg.end.y + dy },
      };
    }
    return {
      ...seg,
      center: { x: seg.center.x + dx, y: seg.center.y + dy },
      start: { x: seg.start.x + dx, y: seg.start.y + dy },
      end: { x: seg.end.x + dx, y: seg.end.y + dy },
    };
  });

  const newCircles = circles.map((c) => ({
    ...c,
    center: { x: c.center.x + dx, y: c.center.y + dy },
  }));

  return { segments: newSegments, circles: newCircles };
}

export function scaleGeometry(
  segments: Segment[],
  circles: CircleEntity[],
  sx: number,
  sy: number,
  cx: number,
  cy: number,
): { segments: Segment[]; circles: CircleEntity[] } {
  function scalePoint(p: Point2D): Point2D {
    return {
      x: cx + (p.x - cx) * sx,
      y: cy + (p.y - cy) * sy,
    };
  }

  const newSegments = segments.map((seg): Segment => {
    if (seg.type === 'line') {
      return { ...seg, start: scalePoint(seg.start), end: scalePoint(seg.end) };
    }
    const newCenter = scalePoint(seg.center);
    const avgScale = (Math.abs(sx) + Math.abs(sy)) / 2;
    return {
      ...seg,
      center: newCenter,
      radius: seg.radius * avgScale,
      start: scalePoint(seg.start),
      end: scalePoint(seg.end),
    };
  });

  const newCircles = circles.map((c) => {
    const avgScale = (Math.abs(sx) + Math.abs(sy)) / 2;
    return {
      ...c,
      center: scalePoint(c.center),
      radius: c.radius * avgScale,
    };
  });

  return { segments: newSegments, circles: newCircles };
}

export function rotateGeometry(
  segments: Segment[],
  circles: CircleEntity[],
  angleDeg: number,
  cx: number,
  cy: number,
): { segments: Segment[]; circles: CircleEntity[] } {
  const angle = (angleDeg * Math.PI) / 180;

  const newSegments = segments.map((seg): Segment => {
    if (seg.type === 'line') {
      return {
        ...seg,
        start: rotatePoint(seg.start, angle, cx, cy),
        end: rotatePoint(seg.end, angle, cx, cy),
      };
    }
    return {
      ...seg,
      center: rotatePoint(seg.center, angle, cx, cy),
      startAngle: seg.startAngle + angle,
      endAngle: seg.endAngle + angle,
      start: rotatePoint(seg.start, angle, cx, cy),
      end: rotatePoint(seg.end, angle, cx, cy),
    };
  });

  const newCircles = circles.map((c) => ({
    ...c,
    center: rotatePoint(c.center, angle, cx, cy),
  }));

  return { segments: newSegments, circles: newCircles };
}

export function getGeometryBounds(segments: Segment[], circles: CircleEntity[]): BoundingBox {
  const allPoints: Point2D[] = [];
  for (const seg of segments) {
    allPoints.push(...segmentToPoints(seg));
  }
  for (const c of circles) {
    allPoints.push(
      { x: c.center.x - c.radius, y: c.center.y - c.radius },
      { x: c.center.x + c.radius, y: c.center.y + c.radius },
    );
  }
  return computeBounds(allPoints);
}
