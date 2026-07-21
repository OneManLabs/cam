import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

export type OperationType = 'contour' | 'pocket' | 'drill';
export type CutSide = 'inside' | 'outside' | 'on';

export interface StockConfig {
  width: number;   // X
  height: number;  // Y
  thickness: number; // Z
  originX: number;
  originY: number;
  zOrigin: 'top' | 'bottom';
}

export interface Operation {
  id: string;
  name: string;
  type: OperationType;
  enabled: boolean;
  toolId: string;
  geometryIds: string[]; // loop/region IDs
  // Contour params
  cutSide?: CutSide;
  tabs?: boolean;
  tabWidth?: number;
  tabHeight?: number;
  tabCount?: number;
  // Common depth params
  totalDepth?: number;
  depthPerPass?: number;
  // Pocket params
  stepOver?: number;
  finishPass?: boolean;
  // Drill params
  peck?: boolean;
  peckDepth?: number;
  counterbore?: boolean;
  counterboreDiameter?: number; // mm
  counterboreDepth?: number;    // mm
}

export interface GeneratedToolpath {
  operationId: string;
  moves: Array<{
    type: 'rapid' | 'linear' | 'arc';
    x: number; y: number; z: number;
    feedRate?: number;
    i?: number; j?: number; clockwise?: boolean;
  }>;
}

interface ProjectState {
  fileName: string | null;
  stock: StockConfig;
  operations: Operation[];
  toolpaths: GeneratedToolpath[];
  safeZ: number;

  setFileName: (name: string | null) => void;
  setStock: (stock: Partial<StockConfig>) => void;

  addOperation: (op: Omit<Operation, 'id'>) => string;
  updateOperation: (id: string, updates: Partial<Operation>) => void;
  removeOperation: (id: string) => void;
  reorderOperations: (fromIndex: number, toIndex: number) => void;

  setToolpaths: (toolpaths: GeneratedToolpath[]) => void;
  clearToolpaths: () => void;
  setSafeZ: (z: number) => void;
  resetProject: () => void;
}

const defaultStock: StockConfig = {
  width: 300, height: 300, thickness: 20,
  originX: 0, originY: 0, zOrigin: 'top',
};

// Default safe Z: 12.7mm (0.5") — matches Carbide Create

export const useProjectStore = create<ProjectState>((set) => ({
  fileName: null,
  stock: defaultStock,
  operations: [],
  toolpaths: [],
  safeZ: 12.7,

  setFileName: (name) => set({ fileName: name }),
  setStock: (updates) => set((s) => ({ stock: { ...s.stock, ...updates } })),

  addOperation: (op) => {
    const id = uuidv4();
    set((s) => ({ operations: [...s.operations, { ...op, id }] }));
    return id;
  },
  updateOperation: (id, updates) => set((s) => ({
    operations: s.operations.map((o) => o.id === id ? { ...o, ...updates } : o),
  })),
  removeOperation: (id) => set((s) => ({
    operations: s.operations.filter((o) => o.id !== id),
    toolpaths: s.toolpaths.filter((t) => t.operationId !== id),
  })),
  reorderOperations: (from, to) => set((s) => {
    const ops = [...s.operations];
    const [moved] = ops.splice(from, 1);
    ops.splice(to, 0, moved);
    return { operations: ops };
  }),

  setToolpaths: (toolpaths) => set({ toolpaths }),
  clearToolpaths: () => set({ toolpaths: [] }),
  setSafeZ: (z) => set({ safeZ: z }),
  resetProject: () => set({
    fileName: null, stock: defaultStock,
    operations: [], toolpaths: [], safeZ: 5,
  }),
}));
