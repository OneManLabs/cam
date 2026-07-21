import { useCallback } from 'react';
import { useFileImport, isSupportedFile } from '../../hooks/useFileImport';
import { useUIStore } from '../../store/useUIStore';

export function FileImport() {
  const { importFile } = useFileImport();
  const setIsDragging = useUIStore((s) => s.setIsDraggingFile);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && isSupportedFile(file.name)) {
      importFile(file);
    }
  }, [importFile, setIsDragging]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) importFile(file);
  }, [importFile]);

  return (
    <div className="file-import">
      <h3>Import File</h3>
      <div
        className="drop-zone"
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <p>Drag & drop a DXF or SVG file here</p>
        <p>or</p>
        <label className="file-btn">
          Browse Files
          <input type="file" accept=".dxf,.svg" onChange={handleFileInput} hidden />
        </label>
      </div>
    </div>
  );
}
