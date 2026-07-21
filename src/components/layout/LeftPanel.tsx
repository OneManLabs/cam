import { useUIStore } from '../../store/useUIStore';
import { MachineSetup } from '../panels/MachineSetup';
import { FileImport } from '../panels/FileImport';
import { TransformPanel } from '../panels/TransformPanel';
import { StockSetup } from '../panels/StockSetup';
import { ToolLibrary } from '../panels/ToolLibrary';
import { OperationsList } from '../panels/OperationsList';

const tabs = [
  {
    id: 'machine' as const,
    label: 'MACHINE',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="6" r="2" /><line x1="12" y1="8" x2="12" y2="4" />
        <circle cx="6" cy="14" r="2" /><line x1="6" y1="16" x2="6" y2="12" />
        <circle cx="18" cy="11" r="2" /><line x1="18" y1="13" x2="18" y2="9" />
        <line x1="12" y1="2" x2="12" y2="22" opacity="0.3" />
        <line x1="6" y1="2" x2="6" y2="22" opacity="0.3" />
        <line x1="18" y1="2" x2="18" y2="22" opacity="0.3" />
      </svg>
    ),
  },
  {
    id: 'stock' as const,
    label: 'STOCK',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
        <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" />
        <path d="M3 7l9 5 9-5" />
        <line x1="12" y1="12" x2="12" y2="22" />
      </svg>
    ),
  },
  {
    id: 'import' as const,
    label: 'IMPORT',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 15V3" />
        <path d="M8 7l4-4 4 4" />
        <path d="M20 21H4" />
        <path d="M20 17v4" />
        <path d="M4 17v4" />
      </svg>
    ),
  },
  {
    id: 'transform' as const,
    label: 'TRANSFORM',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 3 21 3 21 9" />
        <polyline points="9 21 3 21 3 15" />
        <line x1="21" y1="3" x2="14" y2="10" />
        <line x1="3" y1="21" x2="10" y2="14" />
      </svg>
    ),
  },
  {
    id: 'tools' as const,
    label: 'TOOLS',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
  {
    id: 'operations' as const,
    label: 'OPS',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
];

export function LeftPanel() {
  const activePanel = useUIStore((s) => s.activePanel);
  const setActivePanel = useUIStore((s) => s.setActivePanel);

  return (
    <div className="left-panel">
      <div className="icon-rail">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`icon-rail-btn ${activePanel === t.id ? 'active' : ''}`}
            onClick={() => setActivePanel(t.id)}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>
      <div className="panel-main">
        <div className="panel-header">{tabs.find((t) => t.id === activePanel)?.label}</div>
        <div className="panel-content">
          {activePanel === 'machine' && <MachineSetup />}
          {activePanel === 'stock' && <StockSetup />}
          {activePanel === 'import' && <FileImport />}
          {activePanel === 'transform' && <TransformPanel />}
          {activePanel === 'tools' && <ToolLibrary />}
          {activePanel === 'operations' && <OperationsList />}
        </div>
      </div>
    </div>
  );
}
