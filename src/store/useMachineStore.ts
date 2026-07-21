import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type MaterialId = 'aluminum' | 'softwood' | 'hardwood' | 'mdf_plywood' | 'acrylic' | 'hdpe' | 'brass';

export interface MachineConfig {
  name: string;
  spindleType: string;
  minRpm: number;
  maxRpm: number;
  maxFeedRate: number; // mm/min
  workArea: { x: number; y: number; z: number }; // mm
  machineSafeZ: number; // inches, machine coordinate — used for G53 retract during tool changes
}

export interface MaterialToolPreset {
  rpm: number;
  feedRate: number;     // mm/min
  plungeRate: number;   // mm/min
  stepOver: number;     // fraction 0-1
  depthPerPass: number; // mm
}

export interface MaterialPreset {
  id: MaterialId;
  name: string;
  description: string;
  // Keyed by tool diameter in mm (3.175 = 1/8", 6.35 = 1/4")
  toolDefaults: Record<number, MaterialToolPreset>;
}

// Machine presets
export const MACHINE_PRESETS: Record<string, MachineConfig> = {
  'shapeoko5pro': {
    name: 'Shapeoko 5 Pro',
    spindleType: '65mm VFD Spindle',
    minRpm: 8000,
    maxRpm: 24000,
    maxFeedRate: 5000,
    workArea: { x: 838, y: 838, z: 100 },
    machineSafeZ: -0.197,
  },
  'shapeoko5pro_4x4': {
    name: 'Shapeoko 5 Pro 4x4',
    spindleType: '65mm VFD Spindle',
    minRpm: 8000,
    maxRpm: 24000,
    maxFeedRate: 5000,
    workArea: { x: 1219, y: 1219, z: 100 },
    machineSafeZ: -0.197,
  },
  'shapeoko_pro': {
    name: 'Shapeoko Pro (Carbide Router)',
    spindleType: 'Carbide Compact Router',
    minRpm: 10000,
    maxRpm: 30000,
    maxFeedRate: 5000,
    workArea: { x: 838, y: 838, z: 100 },
    machineSafeZ: -0.197,
  },
  'shapeoko4': {
    name: 'Shapeoko 4',
    spindleType: 'Carbide Compact Router',
    minRpm: 10000,
    maxRpm: 30000,
    maxFeedRate: 5000,
    workArea: { x: 838, y: 838, z: 100 },
    machineSafeZ: -0.197,
  },
  'custom': {
    name: 'Custom',
    spindleType: 'Custom',
    minRpm: 5000,
    maxRpm: 24000,
    maxFeedRate: 5000,
    workArea: { x: 500, y: 500, z: 100 },
    machineSafeZ: -0.197,
  },
};

// Material presets based on Shapeoko community chipload guidelines
// Source: https://shapeokoenthusiasts.gitbook.io/shapeoko-cnc-a-to-z/feeds-and-speeds-basics
// Chipload formula: Feed = chipload × flutes × RPM
// DOC for metals: 5-10% of endmill diameter
// DOC for wood: 10-50% of endmill diameter
// Plunge: metals 10-30% of feed, wood 30-40%, plastic 40-50%
export const MATERIAL_PRESETS: MaterialPreset[] = [
  {
    id: 'aluminum',
    name: 'Aluminum',
    description: '6061 aluminum, carbide tools — cutting fluid recommended',
    toolDefaults: {
      // Matched to Carbide Create defaults for aluminum
      // 1/32" 2-flute
      0.7938: { rpm: 24000, feedRate: 127, plungeRate: 50, stepOver: 0.28, depthPerPass: 0.05 },
      // 1/16" 2-flute
      1.5875: { rpm: 22000, feedRate: 305, plungeRate: 100, stepOver: 0.28, depthPerPass: 0.127 },
      // 1/8" (#102) 2-flute: 16000 RPM, 20 in/min feed, 9.8 in/min plunge, 0.01" DOC
      3.175: { rpm: 16000, feedRate: 508, plungeRate: 249, stepOver: 0.35, depthPerPass: 0.254 },
      // 1/4" (#201) 2-flute: 18000 RPM, 24 in/min feed, 10 in/min plunge, 0.008" DOC
      6.35:  { rpm: 18000, feedRate: 609.6, plungeRate: 254, stepOver: 0.35, depthPerPass: 0.2032 },
      // 1/2" 2-flute
      12.7:  { rpm: 14000, feedRate: 1016, plungeRate: 305, stepOver: 0.35, depthPerPass: 0.762 },
    },
  },
  {
    id: 'softwood',
    name: 'Softwood',
    description: 'Pine, cedar, spruce, balsa',
    toolDefaults: {
      // 1/32" 2-flute: chipload 0.0008", 24000 RPM → ~975 mm/min
      0.7938: { rpm: 24000, feedRate: 900, plungeRate: 300, stepOver: 0.35, depthPerPass: 0.15 },
      // 1/16" 2-flute: chipload 0.001", 24000 RPM → ~1220 mm/min
      1.5875: { rpm: 24000, feedRate: 1200, plungeRate: 450, stepOver: 0.40, depthPerPass: 0.40 },
      // 1/8" 2-flute: chipload 0.002", 18000 RPM → ~1830 mm/min
      3.175: { rpm: 18000, feedRate: 1800, plungeRate: 700, stepOver: 0.45, depthPerPass: 1.5 },
      // 1/4" 2-flute: chipload 0.003", 18000 RPM → ~2740 mm/min, capped conservatively
      6.35:  { rpm: 18000, feedRate: 2500, plungeRate: 1000, stepOver: 0.45, depthPerPass: 3.0 },
    },
  },
  {
    id: 'hardwood',
    name: 'Hardwood',
    description: 'Oak, maple, walnut, cherry, birch, ash',
    toolDefaults: {
      // 1/32" 2-flute: chipload 0.0005", 24000 RPM → ~610 mm/min
      0.7938: { rpm: 24000, feedRate: 600, plungeRate: 150, stepOver: 0.35, depthPerPass: 0.08 },
      // 1/16" 2-flute: chipload 0.0008", 24000 RPM → ~975 mm/min
      1.5875: { rpm: 24000, feedRate: 900, plungeRate: 300, stepOver: 0.40, depthPerPass: 0.25 },
      // 1/8" 2-flute: chipload 0.0015", 18000 RPM → ~1370 mm/min
      3.175: { rpm: 18000, feedRate: 1200, plungeRate: 400, stepOver: 0.40, depthPerPass: 0.8 },
      // 1/4" 2-flute: chipload 0.002", 18000 RPM → ~1830 mm/min
      6.35:  { rpm: 18000, feedRate: 1800, plungeRate: 600, stepOver: 0.40, depthPerPass: 1.5 },
    },
  },
  {
    id: 'mdf_plywood',
    name: 'MDF / Plywood',
    description: 'MDF, plywood, particle board, bamboo ply',
    toolDefaults: {
      0.7938: { rpm: 24000, feedRate: 700, plungeRate: 200, stepOver: 0.35, depthPerPass: 0.10 },
      1.5875: { rpm: 24000, feedRate: 1000, plungeRate: 400, stepOver: 0.40, depthPerPass: 0.30 },
      3.175: { rpm: 18000, feedRate: 1500, plungeRate: 600, stepOver: 0.45, depthPerPass: 1.0 },
      6.35:  { rpm: 18000, feedRate: 2200, plungeRate: 900, stepOver: 0.45, depthPerPass: 2.0 },
    },
  },
  {
    id: 'acrylic',
    name: 'Acrylic',
    description: 'Cast & extruded acrylic, polycarbonate — single flute preferred',
    toolDefaults: {
      // 1/32" single flute: chipload 0.001", 24000 RPM → ~610 mm/min
      0.7938: { rpm: 24000, feedRate: 400, plungeRate: 100, stepOver: 0.35, depthPerPass: 0.08 },
      // 1/16" single flute: chipload 0.002", 24000 RPM → ~1220 mm/min
      1.5875: { rpm: 24000, feedRate: 700, plungeRate: 250, stepOver: 0.40, depthPerPass: 0.20 },
      // 1/8" single flute: chipload 0.003", 18000 RPM → ~1370 mm/min
      3.175: { rpm: 18000, feedRate: 1000, plungeRate: 450, stepOver: 0.40, depthPerPass: 0.5 },
      // 1/4" single flute: chipload 0.005", 16000 RPM → ~2030 mm/min
      6.35:  { rpm: 16000, feedRate: 1500, plungeRate: 650, stepOver: 0.40, depthPerPass: 1.0 },
    },
  },
  {
    id: 'hdpe',
    name: 'HDPE / Delrin',
    description: 'HDPE, Delrin, UHMW, nylon — soft plastics',
    toolDefaults: {
      0.7938: { rpm: 24000, feedRate: 500, plungeRate: 150, stepOver: 0.35, depthPerPass: 0.10 },
      1.5875: { rpm: 24000, feedRate: 800, plungeRate: 300, stepOver: 0.40, depthPerPass: 0.30 },
      3.175: { rpm: 18000, feedRate: 1200, plungeRate: 550, stepOver: 0.45, depthPerPass: 1.0 },
      6.35:  { rpm: 16000, feedRate: 2000, plungeRate: 900, stepOver: 0.45, depthPerPass: 2.0 },
    },
  },
  {
    id: 'brass',
    name: 'Brass',
    description: 'Brass, copper — use single flute, cutting fluid recommended',
    toolDefaults: {
      // 1/32": very light cuts, high RPM
      0.7938: { rpm: 20000, feedRate: 100, plungeRate: 20, stepOver: 0.30, depthPerPass: 0.03 },
      // 1/16": conservative
      1.5875: { rpm: 20000, feedRate: 180, plungeRate: 40, stepOver: 0.30, depthPerPass: 0.08 },
      3.175: { rpm: 16000, feedRate: 300, plungeRate: 80, stepOver: 0.35, depthPerPass: 0.15 },
      6.35:  { rpm: 12000, feedRate: 500, plungeRate: 150, stepOver: 0.35, depthPerPass: 0.30 },
    },
  },
];

interface MachineState {
  machineId: string;
  machine: MachineConfig;
  selectedMaterial: MaterialId;
  setMachineId: (id: string) => void;
  setMachine: (config: Partial<MachineConfig>) => void;
  setSelectedMaterial: (id: MaterialId) => void;
}

export const useMachineStore = create<MachineState>()(
  persist(
    (set) => ({
      machineId: 'shapeoko5pro_4x4',
      machine: { ...MACHINE_PRESETS['shapeoko5pro_4x4'] },
      selectedMaterial: 'aluminum',

      setMachineId: (id) => {
        const preset = MACHINE_PRESETS[id];
        if (preset) {
          set({ machineId: id, machine: { ...preset } });
        }
      },

      setMachine: (config) => set((s) => ({
        machine: { ...s.machine, ...config },
        machineId: 'custom',
      })),

      setSelectedMaterial: (id) => set({ selectedMaterial: id }),
    }),
    {
      name: 'cam-machine-config',
      version: 2,
      merge: (persisted, current) => {
        const p = persisted as Partial<MachineState> | undefined;
        if (!p) return current;
        // Deep-merge machine config so new fields (like machineSafeZ) get defaults
        const defaultMachine = MACHINE_PRESETS[p.machineId ?? 'shapeoko5pro_4x4'] ?? current.machine;
        return {
          ...current,
          ...p,
          machine: { ...defaultMachine, ...(p.machine ?? {}) },
        };
      },
    }
  )
);
