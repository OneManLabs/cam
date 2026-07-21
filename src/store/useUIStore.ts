import { create } from 'zustand';

type ActivePanel = 'setup' | 'machine' | 'import' | 'transform' | 'stock' | 'tools' | 'operations';
export type DrawingTool = 'select' | 'rectangle' | 'circle' | 'polygon' | 'text' | null;

interface UIState {
  activePanel: ActivePanel;
  showToolpaths: boolean;
  activeOperationId: string | null;
  showGrid: boolean;
  isDraggingFile: boolean;
  errorMessage: string | null;
  showGcodeModal: boolean;
  showSimulation: boolean;
  simulationProgress: number; // 0-1
  activeTool: DrawingTool;

  setActivePanel: (panel: ActivePanel) => void;
  setShowToolpaths: (show: boolean) => void;
  setActiveOperationId: (id: string | null) => void;
  setShowGrid: (show: boolean) => void;
  setIsDraggingFile: (dragging: boolean) => void;
  setErrorMessage: (msg: string | null) => void;
  setShowGcodeModal: (show: boolean) => void;
  setShowSimulation: (show: boolean) => void;
  setSimulationProgress: (progress: number) => void;
  setActiveTool: (tool: DrawingTool) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activePanel: 'machine',
  showToolpaths: true,
  activeOperationId: null,
  showGrid: true,
  isDraggingFile: false,
  errorMessage: null,
  showGcodeModal: false,
  showSimulation: false,
  simulationProgress: 1,
  activeTool: null,

  setActivePanel: (panel) => set({ activePanel: panel }),
  setShowToolpaths: (show) => set({ showToolpaths: show }),
  setActiveOperationId: (id) => set({ activeOperationId: id }),
  setShowGrid: (show) => set({ showGrid: show }),
  setIsDraggingFile: (dragging) => set({ isDraggingFile: dragging }),
  setErrorMessage: (msg) => set({ errorMessage: msg }),
  setShowGcodeModal: (show) => set({ showGcodeModal: show }),
  setShowSimulation: (show) => set({ showSimulation: show }),
  setSimulationProgress: (progress) => set({ simulationProgress: progress }),
  setActiveTool: (tool) => set({ activeTool: tool }),
}));
