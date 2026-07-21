import type {
  Segment,
  CircleEntity,
  ArcSegment,
  Point2D,
} from '../geometry/types';

// SVG uses Y-down; CNC uses Y-up. We flip Y after parsing.

interface SvgParseResult {
  segments: Segment[];
  circles: CircleEntity[];
  closedPaths: Segment[][]; // Pre-formed closed chains from self-closing SVG paths
}

export function parseSvg(svgContent: string): SvgParseResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');

  const errorNode = doc.querySelector('parsererror');
  if (errorNode) {
    throw new Error('Invalid SVG file');
  }

  const svg = doc.documentElement;
  const segments: Segment[] = [];
  const circles: CircleEntity[] = [];
  // Track which element each segment came from (index into pathGroupIds)
  const segmentGroupId: number[] = [];
  let currentGroupId = 0;

  // Resolve <use> references: clone referenced element in place
  resolveUseElements(svg);

  // Parse viewBox
  let vbX = 0, vbY = 0, vbW = 0, vbH = 0;
  const viewBox = svg.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/);
    if (parts.length === 4) {
      vbX = parseFloat(parts[0]);
      vbY = parseFloat(parts[1]);
      vbW = parseFloat(parts[2]);
      vbH = parseFloat(parts[3]);
    }
  }

  // Parse width/height with units and convert to mm
  const physW = parseSvgLength(svg.getAttribute('width'));
  const physH = parseSvgLength(svg.getAttribute('height'));

  // Compute scale factor: viewBox coords → mm
  let scaleX = 1, scaleY = 1;
  if (vbW > 0 && vbH > 0 && physW > 0 && physH > 0) {
    scaleX = physW / vbW;
    scaleY = physH / vbH;
  } else if (vbW > 0 && vbH > 0) {
    scaleX = 25.4 / 96;
    scaleY = 25.4 / 96;
  } else if (physW > 0 && physH > 0) {
    scaleX = 1;
    scaleY = 1;
  }

  // flipY must be in mm (post-matrix-transform space)
  let flipY = 0;
  if (physH > 0) {
    flipY = physH;
  } else if (vbH > 0) {
    flipY = (vbY + vbH) * scaleY;
  } else {
    const h = svg.getAttribute('height');
    if (h) flipY = parseFloat(h) || 0;
  }

  // Build initial matrix: viewBox origin + scale
  const initialMatrix: Matrix = [scaleX, 0, 0, scaleY, -vbX * scaleX, -vbY * scaleY];

  const ctx: ParseContext = { segments, circles, segGroupIds: segmentGroupId, nextGroupId: currentGroupId };
  processElement(svg, ctx, flipY, initialMatrix);
  currentGroupId = ctx.nextGroupId;

  // If no flipY was determined, compute from geometry and re-flip
  if (flipY === 0 && (segments.length > 0 || circles.length > 0)) {
    let maxY = 0;
    for (const seg of segments) {
      maxY = Math.max(maxY, seg.start.y, seg.end.y);
      if (seg.type === 'arc') maxY = Math.max(maxY, seg.center.y + seg.radius);
    }
    for (const c of circles) {
      maxY = Math.max(maxY, c.center.y + c.radius);
    }
    for (const seg of segments) {
      seg.start.y = maxY - seg.start.y;
      seg.end.y = maxY - seg.end.y;
      if (seg.type === 'arc') {
        seg.center.y = maxY - seg.center.y;
        seg.clockwise = !seg.clockwise;
        seg.startAngle = -seg.startAngle;
        seg.endAngle = -seg.endAngle;
      }
    }
    for (const c of circles) {
      c.center.y = maxY - c.center.y;
    }
  }

  // Remove degenerate zero-length segments (keep group IDs in sync)
  const nonZero: Segment[] = [];
  const nonZeroGroupId: number[] = [];
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    const dx = seg.end.x - seg.start.x;
    const dy = seg.end.y - seg.start.y;
    if (Math.abs(dx) > 0.0001 || Math.abs(dy) > 0.0001) {
      nonZero.push(seg);
      nonZeroGroupId.push(segmentGroupId[si]);
    }
  }

  // Group segments by source element
  const groupMap = new Map<number, Segment[]>();
  for (let si = 0; si < nonZero.length; si++) {
    const gid = nonZeroGroupId[si];
    let arr = groupMap.get(gid);
    if (!arr) { arr = []; groupMap.set(gid, arr); }
    arr.push(nonZero[si]);
  }

  const deduped: Segment[] = [];
  const TOL = 0.001;
  function segKey(sx: number, sy: number, ex: number, ey: number): string {
    return `${Math.round(sx / TOL)},${Math.round(sy / TOL)},${Math.round(ex / TOL)},${Math.round(ey / TOL)}`;
  }

  // Self-closing complex paths become pre-formed closed chains (bypass chain builder).
  // Simple/short paths go to a dedup pool to handle FreeCAD forward+back edges.
  const closedPaths: Segment[][] = [];
  const dedupPool: Segment[] = [];
  for (const group of groupMap.values()) {
    if (group.length === 0) continue;
    const first = group[0];
    const last = group[group.length - 1];
    const gap = Math.sqrt(
      (first.start.x - last.end.x) ** 2 + (first.start.y - last.end.y) ** 2,
    );
    // If the path's segments form a closed chain with many segments, return as pre-formed loop
    if (gap < 0.01 && group.length > 6) {
      closedPaths.push(group);
    } else {
      dedupPool.push(...group);
    }
  }

  // Remove reverse-duplicate segments from the dedup pool.
  // CAD exports (FreeCAD, etc.) often emit each edge as a filled path that traces
  // forward then back (M A L B L B L A L A Z), producing both A→B and B→A.
  const seen = new Set<string>();
  for (const seg of dedupPool) {
    const fwd = segKey(seg.start.x, seg.start.y, seg.end.x, seg.end.y);
    const rev = segKey(seg.end.x, seg.end.y, seg.start.x, seg.start.y);

    if (seen.has(rev)) {
      seen.delete(rev);
      continue;
    }

    if (seg.type === 'line' && seen.has(fwd)) {
      continue;
    }

    seen.add(fwd);
    deduped.push(seg);
  }

  segments.length = 0;
  segments.push(...deduped);

  return { segments, circles, closedPaths };
}

// --- Resolve <use> elements ---

function resolveUseElements(root: Element) {
  const uses = Array.from(root.querySelectorAll('use'));
  for (const use of uses) {
    const href = use.getAttribute('href') || use.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    if (!href || !href.startsWith('#')) continue;
    const refId = href.slice(1);
    const referenced = root.ownerDocument.getElementById(refId);
    if (!referenced) continue;

    const clone = referenced.cloneNode(true) as Element;
    // Apply <use> x/y as a translate on the clone
    const ux = use.getAttribute('x');
    const uy = use.getAttribute('y');
    const useTransform = use.getAttribute('transform') || '';
    let translate = '';
    if (ux || uy) {
      translate = `translate(${ux || 0}, ${uy || 0})`;
    }
    const combinedTransform = (useTransform + ' ' + translate).trim();
    if (combinedTransform) {
      const existing = clone.getAttribute('transform') || '';
      clone.setAttribute('transform', combinedTransform + ' ' + existing);
    }

    // Replace <use> with clone in the DOM
    use.parentNode?.replaceChild(clone, use);
  }
}

// --- SVG length parsing (with unit conversion to mm) ---

function parseSvgLength(attr: string | null): number {
  if (!attr) return 0;
  const match = attr.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(mm|cm|in|pt|pc|px|%)?$/);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2] || '';
  switch (unit) {
    case 'mm': return value;
    case 'cm': return value * 10;
    case 'in': return value * 25.4;
    case 'pt': return value * 25.4 / 72;
    case 'pc': return value * 25.4 / 6;
    case 'px': return value * 25.4 / 96;
    case '': return value * 25.4 / 96;
    default: return 0;
  }
}

// --- Transform matrix [a,b,c,d,e,f] ---

type Matrix = [number, number, number, number, number, number];

function identityMatrix(): Matrix {
  return [1, 0, 0, 1, 0, 0];
}

function multiplyMatrices(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function applyMatrix(m: Matrix, p: Point2D): Point2D {
  return {
    x: m[0] * p.x + m[2] * p.y + m[4],
    y: m[1] * p.x + m[3] * p.y + m[5],
  };
}

function matrixScale(m: Matrix): number {
  const sx = Math.sqrt(m[0] * m[0] + m[1] * m[1]);
  const sy = Math.sqrt(m[2] * m[2] + m[3] * m[3]);
  return (sx + sy) / 2;
}

function parseTransform(attr: string | null): Matrix {
  if (!attr) return identityMatrix();
  let m: Matrix = identityMatrix();

  const regex = /(translate|scale|rotate|matrix|skewX|skewY)\s*\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(attr)) !== null) {
    const fn = match[1];
    const args = match[2].trim().split(/[\s,]+/).map(Number);
    let t: Matrix;
    switch (fn) {
      case 'translate':
        t = [1, 0, 0, 1, args[0] || 0, args[1] || 0];
        break;
      case 'scale': {
        const sx = args[0] || 1;
        const sy = args.length > 1 ? args[1] : sx;
        t = [sx, 0, 0, sy, 0, 0];
        break;
      }
      case 'rotate': {
        const rad = (args[0] || 0) * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        if (args.length === 3) {
          const cx = args[1], cy = args[2];
          t = multiplyMatrices(
            [1, 0, 0, 1, cx, cy],
            multiplyMatrices([cos, sin, -sin, cos, 0, 0], [1, 0, 0, 1, -cx, -cy])
          );
        } else {
          t = [cos, sin, -sin, cos, 0, 0];
        }
        break;
      }
      case 'matrix':
        t = [args[0], args[1], args[2], args[3], args[4], args[5]];
        break;
      case 'skewX': {
        const rad = (args[0] || 0) * Math.PI / 180;
        t = [1, 0, Math.tan(rad), 1, 0, 0];
        break;
      }
      case 'skewY': {
        const rad = (args[0] || 0) * Math.PI / 180;
        t = [1, Math.tan(rad), 0, 1, 0, 0];
        break;
      }
      default:
        t = identityMatrix();
    }
    m = multiplyMatrices(m, t);
  }
  return m;
}

function flipPoint(p: Point2D, flipY: number): Point2D {
  if (flipY === 0) return p;
  return { x: p.x, y: flipY - p.y };
}

// Transform point: apply matrix then flip Y
function tp(p: Point2D, flipY: number, matrix: Matrix): Point2D {
  return flipPoint(applyMatrix(matrix, p), flipY);
}

// --- Tags to skip (non-geometric content) ---

const SKIP_TAGS = new Set([
  'defs', 'clippath', 'mask', 'marker', 'pattern', 'lineargradient',
  'radialgradient', 'filter', 'fegaussianblur', 'feoffset', 'feblend',
  'fecolormatrix', 'fecomponenttransfer', 'fecomposite', 'feconvolvematrix',
  'fediffuselighting', 'fedisplacementmap', 'feflood', 'feimage', 'femerge',
  'femorphology', 'fespecularlighting', 'fetile', 'feturbulence',
  'symbol', 'metadata', 'title', 'desc', 'style', 'script',
  'text', 'tspan', 'textpath', 'image', 'foreignobject',
  'switch', 'a',
]);

function isElementVisible(el: Element): boolean {
  // Check display/visibility in style attribute
  const style = el.getAttribute('style') || '';
  if (/display\s*:\s*none/i.test(style)) return false;
  if (/visibility\s*:\s*hidden/i.test(style)) return false;
  // Check display/visibility as attributes
  if (el.getAttribute('display') === 'none') return false;
  if (el.getAttribute('visibility') === 'hidden') return false;
  return true;
}

// --- Element processing ---

interface ParseContext {
  segments: Segment[];
  circles: CircleEntity[];
  segGroupIds: number[];
  nextGroupId: number;
}

function processElement(
  el: Element,
  ctx: ParseContext,
  flipY: number,
  parentMatrix: Matrix,
) {
  const tag = el.tagName.toLowerCase();

  // Skip non-geometric elements
  if (SKIP_TAGS.has(tag)) return;

  // Skip invisible elements
  if (!isElementVisible(el)) return;

  const localTransform = parseTransform(el.getAttribute('transform'));
  const matrix = multiplyMatrices(parentMatrix, localTransform);

  // Track which group each segment belongs to
  const segsBefore = ctx.segments.length;

  switch (tag) {
    case 'line':
      parseLine(el, ctx.segments, flipY, matrix);
      break;
    case 'rect':
      parseRect(el, ctx.segments, flipY, matrix);
      break;
    case 'circle':
      parseCircle(el, ctx.circles, flipY, matrix);
      break;
    case 'ellipse':
      parseEllipse(el, ctx.segments, ctx.circles, flipY, matrix);
      break;
    case 'polyline':
      parsePolylineEl(el, ctx.segments, flipY, matrix, false);
      break;
    case 'polygon':
      parsePolylineEl(el, ctx.segments, flipY, matrix, true);
      break;
    case 'path':
      parsePath(el, ctx.segments, ctx.circles, flipY, matrix);
      break;
  }

  // Assign group IDs to new segments
  const segsAdded = ctx.segments.length - segsBefore;
  if (segsAdded > 0) {
    const gid = ctx.nextGroupId++;
    for (let si = 0; si < segsAdded; si++) {
      ctx.segGroupIds.push(gid);
    }
  }

  for (const child of el.children) {
    processElement(child, ctx, flipY, matrix);
  }
}

function parseLine(el: Element, segments: Segment[], flipY: number, matrix: Matrix) {
  const x1 = parseFloat(el.getAttribute('x1') || '0');
  const y1 = parseFloat(el.getAttribute('y1') || '0');
  const x2 = parseFloat(el.getAttribute('x2') || '0');
  const y2 = parseFloat(el.getAttribute('y2') || '0');
  segments.push({
    type: 'line',
    start: tp({ x: x1, y: y1 }, flipY, matrix),
    end: tp({ x: x2, y: y2 }, flipY, matrix),
  });
}

function parseRect(el: Element, segments: Segment[], flipY: number, matrix: Matrix) {
  const x = parseFloat(el.getAttribute('x') || '0');
  const y = parseFloat(el.getAttribute('y') || '0');
  const w = parseFloat(el.getAttribute('width') || '0');
  const h = parseFloat(el.getAttribute('height') || '0');
  if (w === 0 || h === 0) return;

  const rx = Math.min(parseFloat(el.getAttribute('rx') || '0'), w / 2);
  const ry = Math.min(parseFloat(el.getAttribute('ry') || el.getAttribute('rx') || '0'), h / 2);

  if (rx > 0.001 && ry > 0.001) {
    // Rounded rectangle: 4 lines + 4 corner arcs
    const pts = {
      tl1: { x: x + rx, y },           // top-left, start of top edge
      tr0: { x: x + w - rx, y },       // top-right, end of top edge
      tr1: { x: x + w, y: y + ry },    // top-right, start of right edge
      br0: { x: x + w, y: y + h - ry },// bottom-right, end of right edge
      br1: { x: x + w - rx, y: y + h },// bottom-right, start of bottom edge
      bl0: { x: x + rx, y: y + h },    // bottom-left, end of bottom edge
      bl1: { x, y: y + h - ry },       // bottom-left, start of left edge
      tl0: { x, y: y + ry },           // top-left, end of left edge
    };
    // Top edge
    segments.push({ type: 'line', start: tp(pts.tl1, flipY, matrix), end: tp(pts.tr0, flipY, matrix) });
    // Top-right corner arc
    tessellateCornerArc(x + w - rx, y + ry, rx, ry, -Math.PI / 2, 0, segments, flipY, matrix);
    // Right edge
    segments.push({ type: 'line', start: tp(pts.tr1, flipY, matrix), end: tp(pts.br0, flipY, matrix) });
    // Bottom-right corner arc
    tessellateCornerArc(x + w - rx, y + h - ry, rx, ry, 0, Math.PI / 2, segments, flipY, matrix);
    // Bottom edge
    segments.push({ type: 'line', start: tp(pts.br1, flipY, matrix), end: tp(pts.bl0, flipY, matrix) });
    // Bottom-left corner arc
    tessellateCornerArc(x + rx, y + h - ry, rx, ry, Math.PI / 2, Math.PI, segments, flipY, matrix);
    // Left edge
    segments.push({ type: 'line', start: tp(pts.bl1, flipY, matrix), end: tp(pts.tl0, flipY, matrix) });
    // Top-left corner arc
    tessellateCornerArc(x + rx, y + ry, rx, ry, Math.PI, Math.PI * 1.5, segments, flipY, matrix);
  } else {
    // Sharp rectangle
    const corners = [
      tp({ x, y }, flipY, matrix),
      tp({ x: x + w, y }, flipY, matrix),
      tp({ x: x + w, y: y + h }, flipY, matrix),
      tp({ x, y: y + h }, flipY, matrix),
    ];
    for (let i = 0; i < 4; i++) {
      segments.push({ type: 'line', start: corners[i], end: corners[(i + 1) % 4] });
    }
  }
}

function tessellateCornerArc(
  cx: number, cy: number, rx: number, ry: number,
  startAngle: number, endAngle: number,
  segments: Segment[], flipY: number, matrix: Matrix,
) {
  const steps = 8;
  let prev = tp({ x: cx + rx * Math.cos(startAngle), y: cy + ry * Math.sin(startAngle) }, flipY, matrix);
  for (let i = 1; i <= steps; i++) {
    const a = startAngle + (endAngle - startAngle) * (i / steps);
    const pt = tp({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }, flipY, matrix);
    segments.push({ type: 'line', start: prev, end: pt });
    prev = pt;
  }
}

function parseCircle(el: Element, circles: CircleEntity[], flipY: number, matrix: Matrix) {
  const cx = parseFloat(el.getAttribute('cx') || '0');
  const cy = parseFloat(el.getAttribute('cy') || '0');
  const r = parseFloat(el.getAttribute('r') || '0');
  if (r === 0) return;

  const center = tp({ x: cx, y: cy }, flipY, matrix);
  const scale = matrixScale(matrix);
  circles.push({ type: 'circle', center, radius: r * scale });
}

function parseEllipse(el: Element, segments: Segment[], circles: CircleEntity[], flipY: number, matrix: Matrix) {
  const cx = parseFloat(el.getAttribute('cx') || '0');
  const cy = parseFloat(el.getAttribute('cy') || '0');
  const rx = parseFloat(el.getAttribute('rx') || '0');
  const ry = parseFloat(el.getAttribute('ry') || '0');
  if (rx === 0 || ry === 0) return;

  const scale = matrixScale(matrix);

  // If nearly circular, emit as circle entity
  if (Math.abs(rx - ry) < 0.01) {
    const center = tp({ x: cx, y: cy }, flipY, matrix);
    circles.push({ type: 'circle', center, radius: rx * scale });
    return;
  }

  // Tessellate ellipse
  const maxR = Math.max(rx, ry) * scale;
  const steps = Math.max(32, Math.ceil(maxR * 0.5));
  const points: Point2D[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    points.push(tp({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }, flipY, matrix));
  }
  for (let i = 0; i < steps; i++) {
    segments.push({ type: 'line', start: points[i], end: points[i + 1] });
  }
}

function parsePolylineEl(el: Element, segments: Segment[], flipY: number, matrix: Matrix, closed: boolean) {
  const raw = el.getAttribute('points');
  if (!raw) return;
  const nums = raw.trim().split(/[\s,]+/).map(Number);
  const points: Point2D[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    points.push(tp({ x: nums[i], y: nums[i + 1] }, flipY, matrix));
  }
  if (points.length < 2) return;
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    segments.push({
      type: 'line',
      start: points[i],
      end: points[(i + 1) % points.length],
    });
  }
}

// --- SVG Path `d` attribute parsing ---

function tokenizePath(d: string): (string | number)[] {
  const tokens: (string | number)[] = [];
  // This regex correctly handles:
  // - Command letters
  // - Negative numbers directly following other numbers (e.g., "10-20")
  // - Decimal points starting numbers (e.g., ".5")
  // - Multiple decimals as separate numbers (e.g., "1.5.3" = 1.5 and 0.3)
  // - Scientific notation
  const re = /([a-zA-Z])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let match;
  while ((match = re.exec(d)) !== null) {
    if (match[1]) {
      tokens.push(match[1]);
    } else {
      tokens.push(parseFloat(match[2]));
    }
  }
  return tokens;
}

function parsePath(
  el: Element,
  segments: Segment[],
  circles: CircleEntity[],
  flipY: number,
  matrix: Matrix,
) {
  const d = el.getAttribute('d');
  if (!d) return;

  const tokens = tokenizePath(d);
  let i = 0;
  let cx = 0, cy = 0; // current point
  let sx = 0, sy = 0; // start of current subpath
  let lastCp: Point2D | null = null; // last control point for S/T
  let lastCmd = '';

  function nextNum(): number {
    if (i >= tokens.length) return 0;
    const val = tokens[i];
    if (typeof val === 'number') {
      i++;
      return val;
    }
    return 0;
  }

  function hasMoreArgs(): boolean {
    return i < tokens.length && typeof tokens[i] === 'number';
  }

  while (i < tokens.length) {
    let cmd = tokens[i];
    if (typeof cmd === 'string') {
      i++;
    } else {
      // Implicit repeat of previous command
      cmd = lastCmd;
      if (cmd === 'M') cmd = 'L';
      if (cmd === 'm') cmd = 'l';
    }

    // Process the command (and loop for implicit repeats)
    do {
      switch (cmd) {
        case 'M':
          cx = nextNum(); cy = nextNum();
          sx = cx; sy = cy;
          lastCp = null;
          // After first M coords, implicit repeats become L
          cmd = 'L';
          continue; // skip the hasMoreArgs check at bottom since we changed cmd
        case 'm':
          cx += nextNum(); cy += nextNum();
          sx = cx; sy = cy;
          lastCp = null;
          cmd = 'l';
          continue;

        case 'L': {
          const x = nextNum(), y = nextNum();
          segments.push({ type: 'line', start: tp({ x: cx, y: cy }, flipY, matrix), end: tp({ x, y }, flipY, matrix) });
          cx = x; cy = y; lastCp = null;
          break;
        }
        case 'l': {
          const dx = nextNum(), dy = nextNum();
          const x = cx + dx, y = cy + dy;
          segments.push({ type: 'line', start: tp({ x: cx, y: cy }, flipY, matrix), end: tp({ x, y }, flipY, matrix) });
          cx = x; cy = y; lastCp = null;
          break;
        }
        case 'H': {
          const x = nextNum();
          segments.push({ type: 'line', start: tp({ x: cx, y: cy }, flipY, matrix), end: tp({ x, y: cy }, flipY, matrix) });
          cx = x; lastCp = null;
          break;
        }
        case 'h': {
          const dx = nextNum();
          segments.push({ type: 'line', start: tp({ x: cx, y: cy }, flipY, matrix), end: tp({ x: cx + dx, y: cy }, flipY, matrix) });
          cx += dx; lastCp = null;
          break;
        }
        case 'V': {
          const y = nextNum();
          segments.push({ type: 'line', start: tp({ x: cx, y: cy }, flipY, matrix), end: tp({ x: cx, y }, flipY, matrix) });
          cy = y; lastCp = null;
          break;
        }
        case 'v': {
          const dy = nextNum();
          segments.push({ type: 'line', start: tp({ x: cx, y: cy }, flipY, matrix), end: tp({ x: cx, y: cy + dy }, flipY, matrix) });
          cy += dy; lastCp = null;
          break;
        }

        case 'C': {
          const x1 = nextNum(), y1 = nextNum();
          const x2 = nextNum(), y2 = nextNum();
          const x = nextNum(), y = nextNum();
          cubicBezierToSegments({ x: cx, y: cy }, { x: x1, y: y1 }, { x: x2, y: y2 }, { x, y }, segments, flipY, matrix);
          lastCp = { x: x2, y: y2 };
          cx = x; cy = y;
          break;
        }
        case 'c': {
          const x1 = cx + nextNum(), y1 = cy + nextNum();
          const x2 = cx + nextNum(), y2 = cy + nextNum();
          const x = cx + nextNum(), y = cy + nextNum();
          cubicBezierToSegments({ x: cx, y: cy }, { x: x1, y: y1 }, { x: x2, y: y2 }, { x, y }, segments, flipY, matrix);
          lastCp = { x: x2, y: y2 };
          cx = x; cy = y;
          break;
        }
        case 'S': {
          const cp1 = lastCp ? { x: 2 * cx - lastCp.x, y: 2 * cy - lastCp.y } : { x: cx, y: cy };
          const x2 = nextNum(), y2 = nextNum();
          const x = nextNum(), y = nextNum();
          cubicBezierToSegments({ x: cx, y: cy }, cp1, { x: x2, y: y2 }, { x, y }, segments, flipY, matrix);
          lastCp = { x: x2, y: y2 };
          cx = x; cy = y;
          break;
        }
        case 's': {
          const cp1 = lastCp ? { x: 2 * cx - lastCp.x, y: 2 * cy - lastCp.y } : { x: cx, y: cy };
          const x2 = cx + nextNum(), y2 = cy + nextNum();
          const x = cx + nextNum(), y = cy + nextNum();
          cubicBezierToSegments({ x: cx, y: cy }, cp1, { x: x2, y: y2 }, { x, y }, segments, flipY, matrix);
          lastCp = { x: x2, y: y2 };
          cx = x; cy = y;
          break;
        }

        case 'Q': {
          const x1 = nextNum(), y1 = nextNum();
          const x = nextNum(), y = nextNum();
          quadBezierToSegments({ x: cx, y: cy }, { x: x1, y: y1 }, { x, y }, segments, flipY, matrix);
          lastCp = { x: x1, y: y1 };
          cx = x; cy = y;
          break;
        }
        case 'q': {
          const x1 = cx + nextNum(), y1 = cy + nextNum();
          const x = cx + nextNum(), y = cy + nextNum();
          quadBezierToSegments({ x: cx, y: cy }, { x: x1, y: y1 }, { x, y }, segments, flipY, matrix);
          lastCp = { x: x1, y: y1 };
          cx = x; cy = y;
          break;
        }
        case 'T': {
          const cp: Point2D = lastCp ? { x: 2 * cx - lastCp.x, y: 2 * cy - lastCp.y } : { x: cx, y: cy };
          const x = nextNum(), y = nextNum();
          quadBezierToSegments({ x: cx, y: cy }, cp, { x, y }, segments, flipY, matrix);
          lastCp = cp;
          cx = x; cy = y;
          break;
        }
        case 't': {
          const cp: Point2D = lastCp ? { x: 2 * cx - lastCp.x, y: 2 * cy - lastCp.y } : { x: cx, y: cy };
          const x = cx + nextNum(), y = cy + nextNum();
          quadBezierToSegments({ x: cx, y: cy }, cp, { x, y }, segments, flipY, matrix);
          lastCp = cp;
          cx = x; cy = y;
          break;
        }

        case 'A': {
          const rx = nextNum(), ry = nextNum();
          const rotation = nextNum();
          const largeArc = nextNum();
          const sweep = nextNum();
          const x = nextNum(), y = nextNum();
          svgArcToSegments(cx, cy, rx, ry, rotation, !!largeArc, !!sweep, x, y, segments, circles, flipY, matrix);
          cx = x; cy = y; lastCp = null;
          break;
        }
        case 'a': {
          const rx = nextNum(), ry = nextNum();
          const rotation = nextNum();
          const largeArc = nextNum();
          const sweep = nextNum();
          const dx = nextNum(), dy = nextNum();
          const x = cx + dx, y = cy + dy;
          svgArcToSegments(cx, cy, rx, ry, rotation, !!largeArc, !!sweep, x, y, segments, circles, flipY, matrix);
          cx = x; cy = y; lastCp = null;
          break;
        }

        case 'Z':
        case 'z':
          if (Math.abs(cx - sx) > 0.0001 || Math.abs(cy - sy) > 0.0001) {
            segments.push({ type: 'line', start: tp({ x: cx, y: cy }, flipY, matrix), end: tp({ x: sx, y: sy }, flipY, matrix) });
          }
          cx = sx; cy = sy; lastCp = null;
          break;
      }

      lastCmd = cmd as string;
    } while (cmd !== 'Z' && cmd !== 'z' && cmd !== 'M' && cmd !== 'm' && hasMoreArgs());
  }
}

// --- Bezier tessellation ---

function cubicBezierPoint(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, t: number): Point2D {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
  };
}

function cubicBezierToSegments(
  p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D,
  segments: Segment[], flipY: number, matrix: Matrix,
) {
  // Adaptive step count based on curve length estimate
  const chordLen = Math.sqrt((p3.x - p0.x) ** 2 + (p3.y - p0.y) ** 2);
  const controlLen = Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2)
    + Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)
    + Math.sqrt((p3.x - p2.x) ** 2 + (p3.y - p2.y) ** 2);
  const scale = matrixScale(matrix);
  const estimatedLen = ((chordLen + controlLen) / 2) * scale;
  const steps = Math.max(8, Math.min(64, Math.ceil(estimatedLen / 0.5)));

  let prev = tp(p0, flipY, matrix);
  for (let i = 1; i <= steps; i++) {
    const pt = tp(cubicBezierPoint(p0, p1, p2, p3, i / steps), flipY, matrix);
    segments.push({ type: 'line', start: prev, end: pt });
    prev = pt;
  }
}

function quadBezierPoint(p0: Point2D, p1: Point2D, p2: Point2D, t: number): Point2D {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

function quadBezierToSegments(
  p0: Point2D, p1: Point2D, p2: Point2D,
  segments: Segment[], flipY: number, matrix: Matrix,
) {
  const chordLen = Math.sqrt((p2.x - p0.x) ** 2 + (p2.y - p0.y) ** 2);
  const controlLen = Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2)
    + Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
  const scale = matrixScale(matrix);
  const estimatedLen = ((chordLen + controlLen) / 2) * scale;
  const steps = Math.max(6, Math.min(48, Math.ceil(estimatedLen / 0.5)));

  let prev = tp(p0, flipY, matrix);
  for (let i = 1; i <= steps; i++) {
    const pt = tp(quadBezierPoint(p0, p1, p2, i / steps), flipY, matrix);
    segments.push({ type: 'line', start: prev, end: pt });
    prev = pt;
  }
}

// --- SVG Arc to segments ---

function svgArcToSegments(
  x1: number, y1: number,
  _rx: number, _ry: number,
  rotationDeg: number,
  largeArc: boolean,
  sweepFlag: boolean,
  x2: number, y2: number,
  segments: Segment[],
  _circles: CircleEntity[],
  flipY: number,
  matrix: Matrix,
) {
  // Degenerate: same start/end
  if (Math.abs(x1 - x2) < 0.0001 && Math.abs(y1 - y2) < 0.0001) return;

  let rx = Math.abs(_rx);
  let ry = Math.abs(_ry);
  if (rx === 0 || ry === 0) {
    segments.push({ type: 'line', start: tp({ x: x1, y: y1 }, flipY, matrix), end: tp({ x: x2, y: y2 }, flipY, matrix) });
    return;
  }

  const phi = rotationDeg * Math.PI / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  // Correct radii per SVG spec
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }

  const num = Math.max(0, rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p);
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let sq = den === 0 ? 0 : Math.sqrt(num / den);
  if (largeArc === sweepFlag) sq = -sq;

  const cxp = sq * rx * y1p / ry;
  const cyp = -sq * ry * x1p / rx;

  const cxOrig = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cyOrig = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  // If it's a true circle (rx ≈ ry and no rotation), emit an ArcSegment
  const scale = matrixScale(matrix);
  if (Math.abs(rx - ry) < 0.01 && Math.abs(rotationDeg % 360) < 0.01) {
    const r = rx * scale;

    // Compute arc direction accounting for ALL reflections:
    // 1. SVG sweep convention: sweep=0 is CCW, sweep=1 is CW (in SVG's Y-down coords)
    // 2. Base conversion to math convention (Y-up): invert once → !sweepFlag
    // 3. Matrix reflection (negative determinant): invert once more
    // 4. flipY reflection: invert once more
    // Each reflection toggles the direction.
    let cw = !sweepFlag; // base: SVG CW → math CCW
    const det = matrix[0] * matrix[3] - matrix[1] * matrix[2];
    if (det < 0) cw = !cw;
    if (flipY) cw = !cw;

    // Compute angles from the transformed center and endpoints
    const tCenter = tp({ x: cxOrig, y: cyOrig }, flipY, matrix);
    const tStart = tp({ x: x1, y: y1 }, flipY, matrix);
    const tEnd = tp({ x: x2, y: y2 }, flipY, matrix);
    const sa = Math.atan2(tStart.y - tCenter.y, tStart.x - tCenter.x);
    const ea = Math.atan2(tEnd.y - tCenter.y, tEnd.x - tCenter.x);

    const arc: ArcSegment = {
      type: 'arc',
      center: tCenter,
      radius: r,
      startAngle: sa,
      endAngle: ea,
      clockwise: cw,
      start: tStart,
      end: tEnd,
    };
    segments.push(arc);
    return;
  }

  // Tessellate elliptical arc
  const startAngle = Math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx);
  let dTheta = Math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx) - startAngle;
  if (sweepFlag && dTheta < 0) dTheta += 2 * Math.PI;
  if (!sweepFlag && dTheta > 0) dTheta -= 2 * Math.PI;

  const arcLen = Math.abs(dTheta) * Math.max(rx, ry) * scale;
  const steps = Math.max(8, Math.min(64, Math.ceil(arcLen / 0.5)));
  let prev = tp({ x: x1, y: y1 }, flipY, matrix);
  for (let s = 1; s <= steps; s++) {
    const t = startAngle + dTheta * (s / steps);
    const xr = rx * Math.cos(t);
    const yr = ry * Math.sin(t);
    const px = cosPhi * xr - sinPhi * yr + cxOrig;
    const py = sinPhi * xr + cosPhi * yr + cyOrig;
    const pt = tp({ x: px, y: py }, flipY, matrix);
    segments.push({ type: 'line', start: prev, end: pt });
    prev = pt;
  }
}
