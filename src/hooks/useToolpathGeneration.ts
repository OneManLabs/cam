import { useCallback } from 'react';
import { useGeometryStore } from '../store/useGeometryStore';
import { useProjectStore } from '../store/useProjectStore';
import { useToolStore } from '../store/useToolStore';
import { useUIStore } from '../store/useUIStore';
import { useMachineStore, MATERIAL_PRESETS } from '../store/useMachineStore';
import { generateContourToolpath } from '../engine/toolpath/contour';
import { generatePocketToolpath } from '../engine/toolpath/pocket';
import { generateDrillToolpath } from '../engine/toolpath/drill';
import type { GeneratedToolpath } from '../store/useProjectStore';
import type { Tool } from '../store/useToolStore';

/** Resolve effective feed/speed/depth for a tool + material combo.
 *  Material preset overrides tool defaults; operation-level overrides beat both. */
function resolveToolParams(tool: Tool, materialId: string) {
  const mat = MATERIAL_PRESETS.find((m) => m.id === materialId);
  if (!mat) return tool;

  // Find closest matching diameter in the preset
  const diameters = Object.keys(mat.toolDefaults).map(Number);
  let bestDiam = diameters[0];
  let bestDiff = Math.abs(tool.diameter - bestDiam);
  for (const d of diameters) {
    const diff = Math.abs(tool.diameter - d);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestDiam = d;
    }
  }

  // Only use preset if diameter is close enough (within 20%)
  if (bestDiff > tool.diameter * 0.2) return tool;

  const preset = mat.toolDefaults[bestDiam];
  if (!preset) return tool;

  return {
    ...tool,
    rpm: preset.rpm,
    feedRate: preset.feedRate,
    plungeRate: preset.plungeRate,
    stepOver: preset.stepOver,
    depthPerPass: preset.depthPerPass,
  };
}

export function useToolpathGeneration() {
  const loops = useGeometryStore((s) => s.loops);
  const regions = useGeometryStore((s) => s.regions);
  const circles = useGeometryStore((s) => s.circles);
  const operations = useProjectStore((s) => s.operations);
  const stock = useProjectStore((s) => s.stock);
  const safeZ = useProjectStore((s) => s.safeZ);
  const setToolpaths = useProjectStore((s) => s.setToolpaths);
  const getTool = useToolStore((s) => s.getTool);
  const setErrorMessage = useUIStore((s) => s.setErrorMessage);
  const selectedMaterial = useMachineStore((s) => s.selectedMaterial);

  const generate = useCallback(() => {
    try {
      const results: GeneratedToolpath[] = [];

      for (const op of operations) {
        if (!op.enabled) continue;

        const baseTool = getTool(op.toolId);
        if (!baseTool) {
          setErrorMessage(`Tool not found for operation "${op.name}"`);
          return;
        }

        // Apply material-specific overrides
        const tool = resolveToolParams(baseTool, selectedMaterial);

        const totalDepth = op.totalDepth ?? stock.thickness;
        const depthPerPass = op.depthPerPass ?? tool.depthPerPass;

        if (op.type === 'contour') {
          for (const geoId of op.geometryIds) {
            const loop = loops.find((l) => l.id === geoId);
            if (!loop) continue;
            const moves = generateContourToolpath({
              loop,
              cutSide: op.cutSide ?? 'outside',
              toolDiameter: tool.diameter,
              totalDepth,
              depthPerPass,
              safeZ,
              feedRate: tool.feedRate,
              plungeRate: tool.plungeRate,
            });
            results.push({ operationId: op.id, moves });
          }
        } else if (op.type === 'pocket') {
          for (const geoId of op.geometryIds) {
            const region = regions.find((r) => r.id === geoId);
            if (region) {
              const moves = generatePocketToolpath({
                region,
                toolDiameter: tool.diameter,
                stepOver: op.stepOver ?? tool.stepOver,
                totalDepth,
                depthPerPass,
                safeZ,
                feedRate: tool.feedRate,
                plungeRate: tool.plungeRate,
                finishPass: op.finishPass ?? false,
              });
              results.push({ operationId: op.id, moves });
            } else {
              const loop = loops.find((l) => l.id === geoId);
              if (!loop) continue;
              const moves = generatePocketToolpath({
                region: { id: loop.id, outer: loop, islands: [] },
                toolDiameter: tool.diameter,
                stepOver: op.stepOver ?? tool.stepOver,
                totalDepth,
                depthPerPass,
                safeZ,
                feedRate: tool.feedRate,
                plungeRate: tool.plungeRate,
                finishPass: op.finishPass ?? false,
              });
              results.push({ operationId: op.id, moves });
            }
          }
        } else if (op.type === 'drill') {
          // Collect all drill hole moves into a single toolpath entry
          // so the G-code comment only appears once per operation
          const allDrillMoves: GeneratedToolpath['moves'] = [];
          for (const geoId of op.geometryIds) {
            let position: { x: number; y: number } | null = null;
            const circle = circles.find((_c, i) => `circle-${i}` === geoId);
            if (circle) {
              position = circle.center;
            } else {
              const loop = loops.find((l) => l.id === geoId);
              if (loop && loop.closed) {
                position = {
                  x: (loop.bounds.minX + loop.bounds.maxX) / 2,
                  y: (loop.bounds.minY + loop.bounds.maxY) / 2,
                };
              }
            }
            if (!position) continue;
            const moves = generateDrillToolpath({
              position,
              totalDepth,
              safeZ,
              feedRate: tool.plungeRate,
              peck: op.peck ?? false,
              peckDepth: op.peckDepth ?? 3,
              counterbore: op.counterbore ?? false,
              counterboreDiameter: op.counterboreDiameter,
              counterboreDepth: op.counterboreDepth,
              toolDiameter: tool.diameter,
            });
            allDrillMoves.push(...moves);
          }
          if (allDrillMoves.length > 0) {
            results.push({ operationId: op.id, moves: allDrillMoves });
          }
        }
      }

      setToolpaths(results);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Toolpath generation failed');
    }
  }, [operations, loops, regions, circles, stock, safeZ, getTool, setToolpaths, setErrorMessage, selectedMaterial]);

  return { generate };
}
