import { create } from 'zustand';
import type { Segment, CircleEntity, Loop, Region, BoundingBox, Point2D } from '../engine/geometry/types';
import { analyzeGeometry } from '../engine/geometry/loops';
import { computeBounds, segmentToPoints } from '../engine/geometry/utils';

function recomputeGeometry(segments: Segment[], circles: CircleEntity[]) {
  const { loops, regions, openPaths } = analyzeGeometry(segments, circles);
  const allPoints: Point2D[] = [];
  for (const seg of segments) allPoints.push(...segmentToPoints(seg));
  for (const c of circles) {
    allPoints.push(
      { x: c.center.x - c.radius, y: c.center.y - c.radius },
      { x: c.center.x + c.radius, y: c.center.y + c.radius },
    );
  }
  const bounds = allPoints.length > 0 ? computeBounds(allPoints) : null;
  return { segments, circles, loops, regions, openPaths, bounds };
}

interface HistorySnapshot {
  segments: Segment[];
  circles: CircleEntity[];
}

const MAX_UNDO = 50;

interface GeometryState {
  segments: Segment[];
  circles: CircleEntity[];
  loops: Loop[];
  regions: Region[];
  openPaths: Segment[][];
  bounds: BoundingBox | null;
  selectedIds: Set<string>; // loop or region ids
  hoveredId: string | null;
  selectionMode: 'entity' | 'loop' | 'region';

  // Undo/redo
  _undoStack: HistorySnapshot[];
  _redoStack: HistorySnapshot[];

  setGeometry: (data: {
    segments: Segment[];
    circles: CircleEntity[];
    loops: Loop[];
    regions: Region[];
    openPaths: Segment[][];
    bounds: BoundingBox;
  }) => void;
  /** Like setGeometry but pushes current state to undo stack first */
  setGeometryWithUndo: (data: {
    segments: Segment[];
    circles: CircleEntity[];
    loops: Loop[];
    regions: Region[];
    openPaths: Segment[][];
    bounds: BoundingBox;
  }) => void;
  pushUndo: () => void;
  undo: () => void;
  redo: () => void;
  clearGeometry: () => void;
  toggleSelection: (id: string) => void;
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
  addToSelection: (ids: string[]) => void;
  setHoveredId: (id: string | null) => void;
  setSelectionMode: (mode: 'entity' | 'loop' | 'region') => void;
  deleteSelected: () => void;
}

export const useGeometryStore = create<GeometryState>((set, get) => ({
  segments: [],
  circles: [],
  loops: [],
  regions: [],
  openPaths: [],
  bounds: null,
  selectedIds: new Set(),
  hoveredId: null,
  selectionMode: 'loop',
  _undoStack: [],
  _redoStack: [],

  pushUndo: () => {
    const { segments, circles, _undoStack } = get();
    const snapshot: HistorySnapshot = {
      segments: [...segments],
      circles: [...circles],
    };
    const stack = [..._undoStack, snapshot];
    if (stack.length > MAX_UNDO) stack.shift();
    set({ _undoStack: stack, _redoStack: [] });
  },

  setGeometry: (data) => set({
    segments: data.segments,
    circles: data.circles,
    loops: data.loops,
    regions: data.regions,
    openPaths: data.openPaths,
    bounds: data.bounds,
  }),

  setGeometryWithUndo: (data) => {
    const { segments, circles, _undoStack } = get();
    const snapshot: HistorySnapshot = {
      segments: [...segments],
      circles: [...circles],
    };
    const stack = [..._undoStack, snapshot];
    if (stack.length > MAX_UNDO) stack.shift();
    set({
      segments: data.segments,
      circles: data.circles,
      loops: data.loops,
      regions: data.regions,
      openPaths: data.openPaths,
      bounds: data.bounds,
      _undoStack: stack,
      _redoStack: [],
    });
  },

  undo: () => {
    const { _undoStack, segments, circles } = get();
    if (_undoStack.length === 0) return;
    const stack = [..._undoStack];
    const snapshot = stack.pop()!;
    // Push current state to redo
    const { _redoStack } = get();
    const redoSnapshot: HistorySnapshot = {
      segments: [...segments],
      circles: [...circles],
    };
    const result = recomputeGeometry(snapshot.segments, snapshot.circles);
    set({
      ...result,
      selectedIds: new Set(),
      hoveredId: null,
      _undoStack: stack,
      _redoStack: [..._redoStack, redoSnapshot],
    });
  },

  redo: () => {
    const { _redoStack, segments, circles } = get();
    if (_redoStack.length === 0) return;
    const stack = [..._redoStack];
    const snapshot = stack.pop()!;
    // Push current state to undo
    const { _undoStack } = get();
    const undoSnapshot: HistorySnapshot = {
      segments: [...segments],
      circles: [...circles],
    };
    const result = recomputeGeometry(snapshot.segments, snapshot.circles);
    set({
      ...result,
      selectedIds: new Set(),
      hoveredId: null,
      _undoStack: [..._undoStack, undoSnapshot],
      _redoStack: stack,
    });
  },

  clearGeometry: () => set({
    segments: [], circles: [], loops: [], regions: [],
    openPaths: [], bounds: null, selectedIds: new Set(), hoveredId: null,
    _undoStack: [], _redoStack: [],
  }),
  toggleSelection: (id) => set((state) => {
    const next = new Set(state.selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { selectedIds: next };
  }),
  setSelection: (ids) => set({ selectedIds: new Set(ids) }),
  clearSelection: () => set({ selectedIds: new Set() }),
  addToSelection: (ids) => set((state) => {
    const next = new Set(state.selectedIds);
    for (const id of ids) next.add(id);
    return { selectedIds: next };
  }),
  setHoveredId: (id) => set({ hoveredId: id }),
  setSelectionMode: (mode) => set({ selectionMode: mode }),

  deleteSelected: () => {
    const { selectedIds, loops, circles, segments } = get();
    if (selectedIds.size === 0) return;

    // Push undo before deleting
    get().pushUndo();

    // Collect segments that belong to selected loops
    const segmentsToRemove = new Set<Segment>();
    const circlesToRemove = new Set<number>();

    for (const id of selectedIds) {
      // Check if it's a loop
      const loop = loops.find((l) => l.id === id);
      if (loop) {
        // Check if this loop is a circle (2 arc segments, same center/radius)
        const isCircleLoop =
          loop.closed &&
          loop.segments.length === 2 &&
          loop.segments[0].type === 'arc' &&
          loop.segments[1].type === 'arc';

        if (isCircleLoop) {
          const arcSeg = loop.segments[0] as { center: Point2D; radius: number };
          // Find matching circle entity
          for (let ci = 0; ci < circles.length; ci++) {
            const c = circles[ci];
            if (
              Math.abs(c.center.x - arcSeg.center.x) < 0.01 &&
              Math.abs(c.center.y - arcSeg.center.y) < 0.01 &&
              Math.abs(c.radius - arcSeg.radius) < 0.01
            ) {
              circlesToRemove.add(ci);
              break;
            }
          }
        } else {
          // Mark all segments in this loop for removal
          for (const seg of loop.segments) {
            // Find matching segment in the global segments array
            for (const globalSeg of segments) {
              if (segmentsMatch(seg, globalSeg)) {
                segmentsToRemove.add(globalSeg);
              }
            }
          }
        }
      }
    }

    const newSegments = segments.filter((s) => !segmentsToRemove.has(s));
    const newCircles = circles.filter((_, i) => !circlesToRemove.has(i));

    const result = recomputeGeometry(newSegments, newCircles);
    set({
      ...result,
      selectedIds: new Set(),
      hoveredId: null,
    });
  },
}));

function segmentsMatch(a: Segment, b: Segment): boolean {
  if (a.type !== b.type) return false;
  const eps = 0.001;
  if (a.type === 'line' && b.type === 'line') {
    return (
      Math.abs(a.start.x - b.start.x) < eps &&
      Math.abs(a.start.y - b.start.y) < eps &&
      Math.abs(a.end.x - b.end.x) < eps &&
      Math.abs(a.end.y - b.end.y) < eps
    );
  }
  if (a.type === 'arc' && b.type === 'arc') {
    return (
      Math.abs(a.center.x - b.center.x) < eps &&
      Math.abs(a.center.y - b.center.y) < eps &&
      Math.abs(a.radius - b.radius) < eps &&
      Math.abs(a.startAngle - b.startAngle) < eps &&
      Math.abs(a.endAngle - b.endAngle) < eps
    );
  }
  return false;
}
