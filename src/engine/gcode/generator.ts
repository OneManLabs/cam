import type { ToolpathMove } from '../toolpath/contour';

const MM_TO_IN = 1 / 25.4;

export interface GcodeToolpath {
  operationName: string;
  toolName: string;
  toolDiameter: number; // mm
  rpm: number;
  moves: ToolpathMove[];
}

export interface GcodeOptions {
  stockWidth: number;     // mm
  stockHeight: number;    // mm
  stockThickness: number; // mm
  originX: number;        // mm
  originY: number;        // mm
  zOrigin: 'top' | 'bottom';
  safeZ: number;          // mm
  machineSafeZ?: number;  // inches, machine coordinate for G53 retract during tool changes
  toolpaths: GcodeToolpath[];
}

function fmtC(inches: number): string {
  return inches.toFixed(4);
}

function fmtF(inchesPerMin: number): string {
  return inchesPerMin.toFixed(1);
}

export function generateGcode(options: GcodeOptions): string {
  const {
    stockWidth, stockHeight, stockThickness,
    originX, originY, zOrigin, machineSafeZ, toolpaths,
  } = options;

  const oz = zOrigin === 'bottom' ? stockThickness : 0;
  const lines: string[] = [];

  // Header — stock info in CC format
  const stIn = fmtC(stockThickness * MM_TO_IN);
  const swIn = fmtC(stockWidth * MM_TO_IN);
  const shIn = fmtC(stockHeight * MM_TO_IN);

  if (zOrigin === 'top') {
    lines.push(`(stockMin:${fmtC(0)}in, ${fmtC(0)}in, -${stIn}in)`);
    lines.push(`(stockMax:${swIn}in, ${shIn}in, ${fmtC(0)}in)`);
  } else {
    lines.push(`(stockMin:${fmtC(0)}in, ${fmtC(0)}in, ${fmtC(0)}in)`);
    lines.push(`(stockMax:${swIn}in, ${shIn}in, ${stIn}in)`);
  }

  lines.push('G90');
  lines.push('G20');

  // Assign tool numbers by unique tool
  const toolNumMap = new Map<string, number>();
  let nextNum = 1;
  for (const tp of toolpaths) {
    const key = `${tp.toolDiameter}|${tp.toolName}`;
    if (!toolNumMap.has(key)) toolNumMap.set(key, nextNum++);
  }

  // Modal state
  let mode: string | undefined;
  let lx: string | undefined;
  let ly: string | undefined;
  let lz: string | undefined;
  let lf: string | undefined;
  let curToolKey: string | undefined;

  for (const tp of toolpaths) {
    const toolKey = `${tp.toolDiameter}|${tp.toolName}`;
    const tNum = toolNumMap.get(toolKey)!;
    const dIn = (tp.toolDiameter * MM_TO_IN).toFixed(3);

    // Tool change if different tool
    if (toolKey !== curToolKey) {
      if (machineSafeZ != null) {
        lines.push(`G53G0Z${fmtC(machineSafeZ)}`);
      }
      lines.push(`(TOOL ${tNum}: ${tp.toolName})`);
      lines.push(`(Toolpath: ${tp.operationName})`);
      lines.push('M05');
      lines.push(`(TOOL/MILL,${dIn}, 0.000, 0.500, 0.00)`);
      lines.push(`M6T${tNum}`);
      lines.push(`M03S${tp.rpm}`);
      lines.push('(PREPOSITION FOR RAPID PLUNGE)');
      curToolKey = toolKey;
      // Reset modal state on tool change
      mode = undefined;
      lx = undefined; ly = undefined; lz = undefined; lf = undefined;
    } else {
      lines.push(`(Toolpath: ${tp.operationName})`);
    }

    for (const mv of tp.moves) {
      const x = fmtC((mv.x - originX) * MM_TO_IN);
      const y = fmtC((mv.y - originY) * MM_TO_IN);
      const z = fmtC((mv.z + oz) * MM_TO_IN);

      if (mv.type === 'rapid') {
        const m = 'G0';
        let s = mode !== m ? m : '';
        let hasAxis = false;
        if (x !== lx) { s += `X${x}`; lx = x; hasAxis = true; }
        if (y !== ly) { s += `Y${y}`; ly = y; hasAxis = true; }
        if (z !== lz) { s += `Z${z}`; lz = z; hasAxis = true; }
        if (hasAxis) lines.push(s);
        // Reset feed rate after rapid so F is always re-emitted on the next G1
        lf = undefined;
        mode = m;
      } else if (mv.type === 'linear') {
        const m = 'G1';
        let s = mode !== m ? m : '';
        let hasContent = false;
        if (x !== lx) { s += `X${x}`; lx = x; hasContent = true; }
        if (y !== ly) { s += `Y${y}`; ly = y; hasContent = true; }
        if (z !== lz) { s += `Z${z}`; lz = z; hasContent = true; }
        if (mv.feedRate != null) {
          const f = fmtF(mv.feedRate * MM_TO_IN);
          if (f !== lf) { s += `F${f}`; lf = f; hasContent = true; }
        }
        if (hasContent) lines.push(s);
        mode = m;
      } else if (mv.type === 'arc') {
        const g = mv.clockwise ? 'G2' : 'G3';
        let s = mode !== g ? g : '';
        if (x !== lx) { s += `X${x}`; lx = x; }
        if (y !== ly) { s += `Y${y}`; ly = y; }
        if (z !== lz) { s += `Z${z}`; lz = z; }
        if (mv.i != null) s += `I${fmtC(mv.i * MM_TO_IN)}`;
        if (mv.j != null) s += `J${fmtC(mv.j * MM_TO_IN)}`;
        if (mv.feedRate != null) {
          const f = fmtF(mv.feedRate * MM_TO_IN);
          if (f !== lf) { s += `F${f}`; lf = f; }
        }
        if (s) lines.push(s);
        mode = g;
      }
    }
  }

  // Footer
  lines.push('M05');
  lines.push('M02');

  return lines.join('\n') + '\n';
}
