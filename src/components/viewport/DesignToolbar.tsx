import { useUIStore, type DrawingTool } from '../../store/useUIStore';

const tools: { id: DrawingTool; label: string; icon: string }[] = [
  { id: 'select', label: 'Select', icon: '↖' },
  { id: 'rectangle', label: 'Rectangle', icon: '▭' },
  { id: 'circle', label: 'Circle', icon: '○' },
  { id: 'polygon', label: 'Polygon', icon: '⬠' },
  { id: 'text', label: 'Text', icon: 'T' },
];

export function DesignToolbar() {
  const activeTool = useUIStore((s) => s.activeTool);
  const setActiveTool = useUIStore((s) => s.setActiveTool);
  const showSimulation = useUIStore((s) => s.showSimulation);

  if (showSimulation) return null;

  return (
    <div className="design-toolbar">
      {tools.map((t) => (
        <button
          key={t.id}
          className={`design-tool-btn ${activeTool === t.id ? 'active' : ''}`}
          onClick={() => setActiveTool(activeTool === t.id ? null : t.id)}
          title={t.label}
        >
          <span className="design-tool-icon">{t.icon}</span>
        </button>
      ))}
    </div>
  );
}
