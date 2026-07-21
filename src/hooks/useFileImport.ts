import { useCallback } from 'react';
import { processFile } from '../engine/dxf/contourDetector';
import { useGeometryStore } from '../store/useGeometryStore';
import { useProjectStore } from '../store/useProjectStore';
import { useUIStore } from '../store/useUIStore';

const SUPPORTED_EXTENSIONS = ['.dxf', '.svg'];

export function isSupportedFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function useFileImport() {
  const setGeometry = useGeometryStore((s) => s.setGeometry);
  const clearSelection = useGeometryStore((s) => s.clearSelection);
  const setFileName = useProjectStore((s) => s.setFileName);
  const setErrorMessage = useUIStore((s) => s.setErrorMessage);
  const setActivePanel = useUIStore((s) => s.setActivePanel);

  const importFile = useCallback((file: File) => {
    if (!isSupportedFile(file.name)) {
      setErrorMessage('Unsupported file type. Please use .dxf or .svg files.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const geometry = processFile(content, file.name);
        clearSelection();
        setGeometry(geometry);
        setFileName(file.name);
        setErrorMessage(null);
        setActivePanel('transform');
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to parse file');
      }
    };
    reader.readAsText(file);
  }, [setGeometry, clearSelection, setFileName, setErrorMessage, setActivePanel]);

  return { importFile };
}
