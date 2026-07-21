import { useProjectStore } from '../../store/useProjectStore';
import { useGeometryStore } from '../../store/useGeometryStore';
import { useUIStore } from '../../store/useUIStore';
import { useToolpathGeneration } from '../../hooks/useToolpathGeneration';

export function BottomBar() {
  const fileName = useProjectStore((s) => s.fileName);
  const loops = useGeometryStore((s) => s.loops);
  const circles = useGeometryStore((s) => s.circles);
  const operations = useProjectStore((s) => s.operations);
  const toolpaths = useProjectStore((s) => s.toolpaths);
  const showToolpaths = useUIStore((s) => s.showToolpaths);
  const setShowToolpaths = useUIStore((s) => s.setShowToolpaths);
  const setShowGcodeModal = useUIStore((s) => s.setShowGcodeModal);
  const showSimulation = useUIStore((s) => s.showSimulation);
  const setShowSimulation = useUIStore((s) => s.setShowSimulation);
  const { generate } = useToolpathGeneration();

  return (
    <div className="bottom-bar-content">
      <div className="status">
        {fileName || 'No file loaded'} | Loops: {loops.length} | Circles: {circles.length} | Ops: {operations.length}
      </div>
      <div className="actions">
        <label>
          <input
            type="checkbox"
            checked={showToolpaths}
            onChange={(e) => setShowToolpaths(e.target.checked)}
          />
          Toolpaths
        </label>
        <button
          className={showSimulation ? 'btn-primary' : ''}
          onClick={() => setShowSimulation(!showSimulation)}
          disabled={toolpaths.length === 0}
        >
          {showSimulation ? 'Stop Sim' : 'Simulate'}
        </button>
        <button onClick={generate} disabled={operations.length === 0}>
          Generate
        </button>
        <button onClick={() => setShowGcodeModal(true)} disabled={toolpaths.length === 0}>
          G-code
        </button>
      </div>
    </div>
  );
}
