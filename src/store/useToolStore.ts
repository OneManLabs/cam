import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

export type ToolType = 'endmill' | 'ballnose' | 'vbit';

export interface Tool {
  id: string;
  name: string;
  type: ToolType;
  diameter: number;    // mm
  flutes: number;
  rpm: number;
  feedRate: number;    // mm/min
  plungeRate: number;  // mm/min
  stepOver: number;    // fraction 0-1
  depthPerPass: number; // mm
}

interface ToolState {
  tools: Tool[];
  addTool: (tool: Omit<Tool, 'id'>) => string;
  updateTool: (id: string, updates: Partial<Tool>) => void;
  removeTool: (id: string) => void;
  getTool: (id: string) => Tool | undefined;
}

const defaultTools: Tool[] = [
  {
    id: uuidv4(),
    name: '1/4" Flat Endmill',
    type: 'endmill',
    diameter: 6.35,
    flutes: 2,
    rpm: 18000,
    feedRate: 1500,
    plungeRate: 750,
    stepOver: 0.4,
    depthPerPass: 2,
  },
  {
    id: uuidv4(),
    name: '1/8" Flat Endmill',
    type: 'endmill',
    diameter: 3.175,
    flutes: 2,
    rpm: 20000,
    feedRate: 1000,
    plungeRate: 500,
    stepOver: 0.4,
    depthPerPass: 1,
  },
  {
    id: uuidv4(),
    name: '1/16" Flat Endmill',
    type: 'endmill',
    diameter: 1.5875,
    flutes: 2,
    rpm: 24000,
    feedRate: 500,
    plungeRate: 200,
    stepOver: 0.4,
    depthPerPass: 0.3,
  },
  {
    id: uuidv4(),
    name: '1/32" Flat Endmill',
    type: 'endmill',
    diameter: 0.7938,
    flutes: 2,
    rpm: 24000,
    feedRate: 250,
    plungeRate: 100,
    stepOver: 0.35,
    depthPerPass: 0.1,
  },
  {
    id: uuidv4(),
    name: '60° V-Bit',
    type: 'vbit',
    diameter: 6.35,
    flutes: 1,
    rpm: 18000,
    feedRate: 800,
    plungeRate: 400,
    stepOver: 0.3,
    depthPerPass: 0.5,
  },
];

export const useToolStore = create<ToolState>()(
  persist(
    (set, get) => ({
      tools: defaultTools,
      addTool: (tool) => {
        const id = uuidv4();
        set((s) => ({ tools: [...s.tools, { ...tool, id }] }));
        return id;
      },
      updateTool: (id, updates) => set((s) => ({
        tools: s.tools.map((t) => t.id === id ? { ...t, ...updates } : t),
      })),
      removeTool: (id) => set((s) => ({
        tools: s.tools.filter((t) => t.id !== id),
      })),
      getTool: (id) => get().tools.find((t) => t.id === id),
    }),
    {
      name: 'cam-tool-library',
      version: 1,
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as { tools?: Tool[] };
        if (version === 0 && state.tools) {
          // Add any default tools whose diameter doesn't already exist
          const existingDiameters = new Set(state.tools.map((t) => t.diameter));
          const missing = defaultTools.filter((t) => !existingDiameters.has(t.diameter));
          if (missing.length > 0) {
            state.tools = [...state.tools, ...missing];
          }
        }
        return state;
      },
    }
  )
);
