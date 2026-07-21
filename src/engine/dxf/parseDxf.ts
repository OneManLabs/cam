import DxfParser from 'dxf-parser';
import type {
  Segment,
  CircleEntity,
  LineSegment,
  ArcSegment,
  Point2D,
} from '../geometry/types';

interface DxfVertex {
  x: number;
  y: number;
  bulge?: number;
}

interface DxfEntity {
  type: string;
  vertices?: DxfVertex[];
  // LINE
  startPoint?: { x: number; y: number; z?: number };
  endPoint?: { x: number; y: number; z?: number };
  // ARC / CIRCLE
  center?: { x: number; y: number; z?: number };
  radius?: number;
  startAngle?: number; // degrees
  endAngle?: number; // degrees
  // LWPOLYLINE
  shape?: boolean; // closed flag
}

function degreesToRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function convertLine(entity: DxfEntity): LineSegment | null {
  if (!entity.startPoint || !entity.endPoint) return null;
  return {
    type: 'line',
    start: { x: entity.startPoint.x, y: entity.startPoint.y },
    end: { x: entity.endPoint.x, y: entity.endPoint.y },
  };
}

function convertArc(entity: DxfEntity): ArcSegment | null {
  if (
    !entity.center ||
    entity.radius == null ||
    entity.startAngle == null ||
    entity.endAngle == null
  )
    return null;

  const center: Point2D = { x: entity.center.x, y: entity.center.y };
  const r = entity.radius;
  const startAngle = degreesToRadians(entity.startAngle);
  const endAngle = degreesToRadians(entity.endAngle);

  return {
    type: 'arc',
    center,
    radius: r,
    startAngle,
    endAngle,
    clockwise: false, // DXF arcs are CCW by default
    start: {
      x: center.x + r * Math.cos(startAngle),
      y: center.y + r * Math.sin(startAngle),
    },
    end: {
      x: center.x + r * Math.cos(endAngle),
      y: center.y + r * Math.sin(endAngle),
    },
  };
}

function convertCircle(entity: DxfEntity): CircleEntity | null {
  if (!entity.center || entity.radius == null) return null;
  return {
    type: 'circle',
    center: { x: entity.center.x, y: entity.center.y },
    radius: entity.radius,
  };
}

function bulgeToArc(
  v1: Point2D,
  v2: Point2D,
  bulge: number,
): ArcSegment {
  const dx = v2.x - v1.x;
  const dy = v2.y - v1.y;
  const chord = Math.sqrt(dx * dx + dy * dy);
  const sagitta = Math.abs(bulge) * chord / 2;
  const radius = (chord * chord / 4 + sagitta * sagitta) / (2 * sagitta);

  const midX = (v1.x + v2.x) / 2;
  const midY = (v1.y + v2.y) / 2;
  const dist = chord;

  const sign = bulge > 0 ? 1 : -1;
  const h = radius - sagitta;
  const cx = midX - sign * h * dy / dist;
  const cy = midY + sign * h * dx / dist;

  const startAngle = Math.atan2(v1.y - cy, v1.x - cx);
  const endAngle = Math.atan2(v2.y - cy, v2.x - cx);
  const clockwise = bulge < 0;

  return {
    type: 'arc',
    center: { x: cx, y: cy },
    radius,
    startAngle,
    endAngle,
    clockwise,
    start: v1,
    end: v2,
  };
}

function convertPolyline(entity: DxfEntity): Segment[] {
  const vertices = entity.vertices;
  if (!vertices || vertices.length < 2) return [];

  const segments: Segment[] = [];
  const isClosed = entity.shape === true;
  const count = isClosed ? vertices.length : vertices.length - 1;

  for (let i = 0; i < count; i++) {
    const v1 = vertices[i];
    const v2 = vertices[(i + 1) % vertices.length];
    const p1: Point2D = { x: v1.x, y: v1.y };
    const p2: Point2D = { x: v2.x, y: v2.y };
    const bulge = v1.bulge ?? 0;

    if (bulge === 0) {
      segments.push({
        type: 'line',
        start: p1,
        end: p2,
      });
    } else {
      segments.push(bulgeToArc(p1, p2, bulge));
    }
  }

  return segments;
}

export function parseDxf(
  dxfContent: string,
): { segments: Segment[]; circles: CircleEntity[] } {
  const parser = new DxfParser();
  const dxf = parser.parseSync(dxfContent);

  if (!dxf || !dxf.entities) {
    return { segments: [], circles: [] };
  }

  const segments: Segment[] = [];
  const circles: CircleEntity[] = [];

  for (const entity of dxf.entities as DxfEntity[]) {
    switch (entity.type) {
      case 'LINE': {
        const seg = convertLine(entity);
        if (seg) segments.push(seg);
        break;
      }
      case 'ARC': {
        const seg = convertArc(entity);
        if (seg) segments.push(seg);
        break;
      }
      case 'CIRCLE': {
        const circle = convertCircle(entity);
        if (circle) circles.push(circle);
        break;
      }
      case 'LWPOLYLINE':
      case 'POLYLINE': {
        segments.push(...convertPolyline(entity));
        break;
      }
    }
  }

  return { segments, circles };
}
