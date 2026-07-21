import { useMemo } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { useToolStore } from '../../store/useToolStore';
import { useUIStore } from '../../store/useUIStore';
import { useMachineStore, MATERIAL_PRESETS } from '../../store/useMachineStore';
import { generateGcode } from '../../engine/gcode/generator';
import type { GcodeToolpath } from '../../engine/gcode/generator';
import { saveAs } from 'file-saver';

function resolveRpm(toolDiameter: number, materialId: string, fallbackRpm: number): number {
  const mat = MATERIAL_PRESETS.find((m) => m.id === materialId);
  if (!mat) return fallbackRpm;
  const diameters = Object.keys(mat.toolDefaults).map(Number);
  let bestDiam = diameters[0];
  let bestDiff = Math.abs(toolDiameter - bestDiam);
  for (const d of diameters) {
    const diff = Math.abs(toolDiameter - d);
    if (diff < bestDiff) { bestDiff = diff; bestDiam = d; }
  }
  if (bestDiff > toolDiameter * 0.2) return fallbackRpm;
  return mat.toolDefaults[bestDiam]?.rpm ?? fallbackRpm;
}

export function GcodeModal() {
  const toolpaths = useProjectStore((s) => s.toolpaths);
  const operations = useProjectStore((s) => s.operations);
  const stock = useProjectStore((s) => s.stock);
  const safeZ = useProjectStore((s) => s.safeZ);
  const fileName = useProjectStore((s) => s.fileName);
  const tools = useToolStore((s) => s.tools);
  const selectedMaterial = useMachineStore((s) => s.selectedMaterial);
  const machineSafeZ = useMachineStore((s) => s.machine.machineSafeZ);
  const setShowGcodeModal = useUIStore((s) => s.setShowGcodeModal);

  const gcode = useMemo(() => {
    if (toolpaths.length === 0) return '';

    const gcodeToolpaths: GcodeToolpath[] = [];

    for (const tp of toolpaths) {
      const op = operations.find((o) => o.id === tp.operationId);
      if (!op) continue;
      const tool = tools.find((t) => t.id === op.toolId);
      if (!tool) continue;

      gcodeToolpaths.push({
        operationName: op.name,
        toolName: tool.name,
        toolDiameter: tool.diameter,
        rpm: resolveRpm(tool.diameter, selectedMaterial, tool.rpm),
        moves: tp.moves,
      });
    }

    return generateGcode({
      stockWidth: stock.width,
      stockHeight: stock.height,
      stockThickness: stock.thickness,
      originX: stock.originX,
      originY: stock.originY,
      zOrigin: stock.zOrigin,
      safeZ,
      machineSafeZ,
      toolpaths: gcodeToolpaths,
    });
  }, [toolpaths, operations, tools, safeZ, stock, selectedMaterial, machineSafeZ]);

  const lineCount = gcode.split('\n').filter((l) => l.trim()).length;

  const exportFile = () => {
    const blob = new Blob([gcode], { type: 'text/plain;charset=utf-8' });
    const name = fileName ? fileName.replace(/\.(dxf|svg)$/i, '.nc') : 'output.nc';
    saveAs(blob, name);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(gcode);
  };

  return (
    <div className="modal-backdrop" onClick={() => setShowGcodeModal(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>G-code Output</h3>
          <span className="modal-info">{lineCount} lines</span>
          <button className="btn-sm" onClick={() => setShowGcodeModal(false)}>×</button>
        </div>
        <div className="modal-body">
          <pre className="gcode-viewer">{gcode}</pre>
        </div>
        <div className="modal-footer">
          <button onClick={copyToClipboard}>Copy</button>
          <button className="btn-primary" onClick={exportFile}>Export .nc</button>
        </div>
      </div>
    </div>
  );
}
