import { useUIStore } from '../../store/useUIStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useGeometryStore } from '../../store/useGeometryStore';
import { OperationEditor } from '../panels/OperationEditor';
import { SimulationPanel } from '../panels/SimulationPanel';
import { PropertiesPanel } from '../panels/PropertiesPanel';

export function RightPanel() {
  const showSimulation = useUIStore((s) => s.showSimulation);
  const activeOperationId = useUIStore((s) => s.activeOperationId);
  const operations = useProjectStore((s) => s.operations);
  const operation = operations.find((o) => o.id === activeOperationId);
  const hasGeometry = useGeometryStore((s) => s.segments.length > 0 || s.circles.length > 0);

  if (showSimulation) {
    return (
      <div className="right-panel">
        <SimulationPanel />
      </div>
    );
  }

  if (operation) {
    return (
      <div className="right-panel">
        <OperationEditor operation={operation} />
      </div>
    );
  }

  return (
    <div className="right-panel">
      {hasGeometry ? (
        <PropertiesPanel />
      ) : (
        <div className="panel-placeholder">Import or create geometry</div>
      )}
    </div>
  );
}
