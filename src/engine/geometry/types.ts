export interface Point2D {
  x: number;
  y: number;
}

export interface LineSegment {
  type: 'line';
  start: Point2D;
  end: Point2D;
}

export interface ArcSegment {
  type: 'arc';
  center: Point2D;
  radius: number;
  startAngle: number; // radians
  endAngle: number; // radians
  clockwise: boolean;
  start: Point2D;
  end: Point2D;
}

export interface CircleEntity {
  type: 'circle';
  center: Point2D;
  radius: number;
}

export type Segment = LineSegment | ArcSegment;

export interface Loop {
  id: string;
  segments: Segment[];
  closed: boolean;
  bounds: BoundingBox;
  area: number; // signed: positive=CCW, negative=CW
  winding: 'ccw' | 'cw';
}

export interface Region {
  id: string;
  outer: Loop;
  islands: Loop[];
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ParsedGeometry {
  segments: Segment[];
  circles: CircleEntity[];
  loops: Loop[];
  regions: Region[];
  openPaths: Segment[][];
  bounds: BoundingBox;
}
