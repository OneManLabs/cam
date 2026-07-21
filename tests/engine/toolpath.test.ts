import { describe, it, expect } from 'vitest';
import { computeDepthPasses } from '../../src/engine/toolpath/depthPasses';
import { generateDrillToolpath } from '../../src/engine/toolpath/drill';
import { generateGcode } from '../../src/engine/gcode/generator';

describe('depth passes', () => {
  it('computes correct depth passes', () => {
    const passes = computeDepthPasses(10, 3);
    expect(passes.length).toBe(4); // -3, -6, -9, -10
    expect(passes[0].z).toBeCloseTo(-3);
    expect(passes[1].z).toBeCloseTo(-6);
    expect(passes[2].z).toBeCloseTo(-9);
    expect(passes[3].z).toBeCloseTo(-10);
    expect(passes[3].isLast).toBe(true);
  });

  it('handles exact division', () => {
    const passes = computeDepthPasses(6, 3);
    expect(passes.length).toBe(2);
    expect(passes[0].z).toBeCloseTo(-3);
    expect(passes[1].z).toBeCloseTo(-6);
    expect(passes[1].isLast).toBe(true);
  });

  it('handles single pass', () => {
    const passes = computeDepthPasses(2, 5);
    expect(passes.length).toBe(1);
    expect(passes[0].z).toBeCloseTo(-2);
    expect(passes[0].isLast).toBe(true);
  });
});

describe('drill toolpath', () => {
  it('generates simple drill', () => {
    const moves = generateDrillToolpath({
      position: { x: 50, y: 50 },
      totalDepth: 10,
      safeZ: 5,
      feedRate: 500,
      peck: false,
      peckDepth: 3,
    });
    expect(moves.length).toBe(4); // rapid to safe, rapid to approach, plunge, retract
    expect(moves[0].type).toBe('rapid');
    expect(moves[0].z).toBe(5);
    expect(moves[1].type).toBe('rapid');
    expect(moves[1].z).toBeCloseTo(0.25); // approach clearance
    expect(moves[2].type).toBe('linear');
    expect(moves[2].z).toBe(-10);
    expect(moves[3].type).toBe('rapid');
    expect(moves[3].z).toBe(5);
  });

  it('generates peck drill', () => {
    const moves = generateDrillToolpath({
      position: { x: 50, y: 50 },
      totalDepth: 6,
      safeZ: 5,
      feedRate: 500,
      peck: true,
      peckDepth: 3,
    });
    // rapid to pos, approach, plunge -3, retract to R-plane, rapid down, plunge -6, retract to safeZ
    expect(moves.length).toBeGreaterThan(3);
    expect(moves[0].z).toBe(5); // safe Z
    // Find all plunge moves
    const plunges = moves.filter(m => m.type === 'linear');
    expect(plunges.length).toBe(2);
    expect(plunges[0].z).toBeCloseTo(-3);
    expect(plunges[1].z).toBeCloseTo(-6);
    // Between pecks: retract to R-plane (approach clearance), not safeZ
    const retractAfterFirstPeck = moves[moves.indexOf(plunges[0]) + 1];
    expect(retractAfterFirstPeck.z).toBeCloseTo(0.25); // R-plane, not safeZ
    // Final retract goes to safeZ
    const lastMove = moves[moves.length - 1];
    expect(lastMove.z).toBe(5);
  });
});

describe('gcode generation', () => {
  const defaultOpts = {
    stockWidth: 100, stockHeight: 100, stockThickness: 6,
    originX: 0, originY: 0, zOrigin: 'top' as const, safeZ: 5,
  };

  it('generates valid gcode in inches', () => {
    const gcode = generateGcode({
      ...defaultOpts,
      toolpaths: [{
        operationName: 'Test',
        toolName: '1/8" Endmill',
        toolDiameter: 3.175,
        rpm: 18000,
        moves: [
          { type: 'rapid', x: 10, y: 20, z: 5 },
          { type: 'linear', x: 10, y: 20, z: -2, feedRate: 500 },
          { type: 'linear', x: 50, y: 20, z: -2, feedRate: 1500 },
          { type: 'rapid', x: 50, y: 20, z: 5 },
        ],
      }],
    });

    expect(gcode).toContain('G90');
    expect(gcode).toContain('G20'); // inches
    expect(gcode).toContain('M03S18000');
    expect(gcode).toContain('M6T1'); // tool change
    expect(gcode).toContain('M05');
    expect(gcode).toContain('M02');
  });

  it('uses modal coordinates — omits unchanged axes', () => {
    const gcode = generateGcode({
      ...defaultOpts,
      toolpaths: [{
        operationName: 'Test',
        toolName: '1/8" Endmill',
        toolDiameter: 3.175,
        rpm: 18000,
        moves: [
          { type: 'rapid', x: 10, y: 20, z: 5 },
          { type: 'rapid', x: 10, y: 20, z: 0.25 }, // only Z changes
        ],
      }],
    });

    const allLines = gcode.split('\n');
    // Find lines that are just Z moves (no X or Y) — these are modal rapids
    const zOnlyLines = allLines.filter(l => /^Z[\d.-]/.test(l));
    expect(zOnlyLines.length).toBeGreaterThan(0); // at least one Z-only modal line
  });

  it('omits feed rate when unchanged', () => {
    const gcode = generateGcode({
      ...defaultOpts,
      toolpaths: [{
        operationName: 'Test',
        toolName: '1/8" Endmill',
        toolDiameter: 3.175,
        rpm: 18000,
        moves: [
          { type: 'linear', x: 10, y: 0, z: 0, feedRate: 1000 },
          { type: 'linear', x: 20, y: 0, z: 0, feedRate: 1000 },
        ],
      }],
    });

    const lines = gcode.split('\n').filter(l => l.startsWith('G1') || (l.startsWith('X') && !l.startsWith('(')));
    const feedLines = lines.filter(l => l.includes('F'));
    expect(feedLines.length).toBe(1); // F only on first G1
  });
});
