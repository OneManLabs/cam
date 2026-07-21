import { LeftPanel } from './LeftPanel';
import { RightPanel } from './RightPanel';
import { BottomBar } from './BottomBar';
import { Viewport } from '../viewport/Viewport';
import { GcodeModal } from '../panels/GcodeModal';
import { useUIStore } from '../../store/useUIStore';
import { useFileImport, isSupportedFile } from '../../hooks/useFileImport';

export function AppLayout() {
  const isDragging = useUIStore((s) => s.isDraggingFile);
  const setIsDragging = useUIStore((s) => s.setIsDraggingFile);
  const errorMessage = useUIStore((s) => s.errorMessage);
  const setErrorMessage = useUIStore((s) => s.setErrorMessage);
  const showGcodeModal = useUIStore((s) => s.showGcodeModal);
  const { importFile } = useFileImport();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && isSupportedFile(file.name)) {
      importFile(file);
    }
  };

  return (
    <div
      className="app-layout"
      onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer.types.includes('Files')) setIsDragging(true); }}
      onDragLeave={(e) => { if (e.dataTransfer.types.includes('Files')) setIsDragging(false); }}
      onDrop={handleDrop}
    >
      <div className="panel-left"><LeftPanel /></div>
      <div className="viewport">
        <Viewport />
        {isDragging && <div className="drop-overlay">Drop DXF or SVG file here</div>}
      </div>
      <div className="panel-right"><RightPanel /></div>
      <div className="bottom-bar"><BottomBar /></div>
      {errorMessage && (
        <div className="error-toast" onClick={() => setErrorMessage(null)}>
          {errorMessage}
        </div>
      )}
      {showGcodeModal && <GcodeModal />}
    </div>
  );
}
