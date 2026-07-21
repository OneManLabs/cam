// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseSvg } from '../../src/engine/svg/parseSvg';

describe('SVG parser', () => {
  it('parses rect element', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
      <rect x="10" y="10" width="80" height="60" />
    </svg>`;
    const { segments, circles } = parseSvg(svg);
    expect(segments.length).toBe(4);
    expect(circles.length).toBe(0);
    // All should be line segments forming a rectangle
    for (const seg of segments) {
      expect(seg.type).toBe('line');
    }
  });

  it('parses circle element', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="25" />
    </svg>`;
    const { circles } = parseSvg(svg);
    expect(circles.length).toBe(1);
    expect(circles[0].radius).toBeCloseTo(25);
  });

  it('parses path with lines', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
      <path d="M 10 10 L 90 10 L 90 90 L 10 90 Z" />
    </svg>`;
    const { segments } = parseSvg(svg);
    // 3 L commands + 1 Z closing = 4 segments
    expect(segments.length).toBe(4);
  });

  it('parses path with cubic bezier', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
      <path d="M 10 80 C 40 10 65 10 95 80" />
    </svg>`;
    const { segments } = parseSvg(svg);
    // Bezier tessellated into multiple line segments (adaptive)
    expect(segments.length).toBeGreaterThanOrEqual(8);
  });

  it('parses polygon element', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="200mm" viewBox="0 0 200 200">
      <polygon points="100,10 40,198 190,78 10,78 160,198" />
    </svg>`;
    const { segments } = parseSvg(svg);
    expect(segments.length).toBe(5); // 5-pointed star
  });

  it('parses path with arc', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
      <path d="M 10 50 A 40 40 0 1 1 90 50" />
    </svg>`;
    const { segments } = parseSvg(svg);
    expect(segments.length).toBeGreaterThan(0);
  });

  it('handles transform attribute', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="200mm" viewBox="0 0 200 200">
      <g transform="translate(50, 50)">
        <rect x="0" y="0" width="20" height="20" />
      </g>
    </svg>`;
    const { segments } = parseSvg(svg);
    expect(segments.length).toBe(4);
    // Check that translation was applied — first corner should be at (50, 150) after Y-flip
    const xs = segments.map(s => s.start.x);
    expect(Math.min(...xs)).toBeCloseTo(50);
  });

  it('handles h/v shorthand commands', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
      <path d="M 10 10 h 80 v 80 h -80 Z" />
    </svg>`;
    const { segments } = parseSvg(svg);
    expect(segments.length).toBe(4);
  });

  it('handles FreeCAD-style filled edge paths (forward+back dedup)', () => {
    // FreeCAD exports each edge as: M A L B L B L A L A Z
    // This should produce 1 segment (A→B), not 2 (A→B and B→A)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
      <path d="M 10 10 L 50 10 L 50 10 L 10 10 L 10 10 Z" />
      <path d="M 50 10 L 50 50 L 50 50 L 50 10 L 50 10 Z" />
      <path d="M 50 50 L 10 50 L 10 50 L 50 50 L 50 50 Z" />
      <path d="M 10 50 L 10 10 L 10 10 L 10 50 L 10 50 Z" />
    </svg>`;
    const { segments } = parseSvg(svg);
    // Should be 4 segments (one per edge), not 8
    expect(segments.length).toBe(4);
  });

  it('deduplicates reverse segments from CAD exports', () => {
    // Hexagon with 6 edges, each as separate path with forward+back
    const hex = [
      [0, 10, 8.66, 5],
      [8.66, 5, 8.66, -5],
      [8.66, -5, 0, -10],
      [0, -10, -8.66, -5],
      [-8.66, -5, -8.66, 5],
      [-8.66, 5, 0, 10],
    ];
    const paths = hex.map(([x1, y1, x2, y2]) =>
      `<path d="M ${x1} ${y1} L ${x2} ${y2} L ${x2} ${y2} L ${x1} ${y1} L ${x1} ${y1} Z" />`
    ).join('\n');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
      <g transform="translate(50,50)">${paths}</g>
    </svg>`;
    const { segments } = parseSvg(svg);
    expect(segments.length).toBe(6);
  });
});
