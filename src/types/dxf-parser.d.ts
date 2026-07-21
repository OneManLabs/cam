declare module 'dxf-parser' {
  interface DxfEntity {
    type: string;
    layer?: string;
    vertices?: Array<{ x: number; y: number; z?: number; bulge?: number }>;
    startAngle?: number;
    endAngle?: number;
    center?: { x: number; y: number; z?: number };
    radius?: number;
    x?: number; y?: number;
    x1?: number; y1?: number;
    x2?: number; y2?: number;
    shape?: boolean;
  }

  interface DxfParsed {
    entities: DxfEntity[];
    blocks?: Record<string, { entities: DxfEntity[] }>;
  }

  export default class DxfParser {
    parseSync(content: string): DxfParsed;
  }
}
