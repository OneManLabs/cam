import { useMemo, useCallback, useRef, useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { useGeometryStore } from '../../store/useGeometryStore';
import { useToolStore } from '../../store/useToolStore';
import { useUIStore } from '../../store/useUIStore';
import { useToolpathGeneration } from '../../hooks/useToolpathGeneration';
import type { OperationType } from '../../store/useProjectStore';
import type { ArcSegment } from '../../engine/geometry/types';

function formatTime(minutes: number): string {
  if (minutes <= 0) return '—';
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function OperationsList() {
  const operations = useProjectStore((s) => s.operations);
  const addOperation = useProjectStore((s) => s.addOperation);
  const removeOperation = useProjectStore((s) => s.removeOperation);
  const updateOperation = useProjectStore((s) => s.updateOperation);
  const toolpaths = useProjectStore((s) => s.toolpaths);
  const stock = useProjectStore((s) => s.stock);
  const selectedIds = useGeometryStore((s) => s.selectedIds);
  const circles = useGeometryStore((s) => s.circles);
  const loops = useGeometryStore((s) => s.loops);
  const reorderOperations = useProjectStore((s) => s.reorderOperations);
  const tools = useToolStore((s) => s.tools);
  const setActiveOperationId = useUIStore((s) => s.setActiveOperationId);
  const activeOperationId = useUIStore((s) => s.activeOperationId);
  const { generate } = useToolpathGeneration();

  // Compute per-operation time from generated toolpaths
  const opTimes = useMemo(() => {
    const times: Record<string, number> = {};
    for (const tp of toolpaths) {
      const op = operations.find((o) => o.id === tp.operationId);
      if (!op) continue;
      const tool = tools.find((t) => t.id === op.toolId);

      let time = 0;
      let px = 0, py = 0, pz = 0;
      for (const move of tp.moves) {
        const dx = move.x - px;
        const dy = move.y - py;
        const dz = move.z - pz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (move.type !== 'rapid') {
          const feed = move.feedRate ?? tool?.feedRate ?? 1000;
          time += dist / feed;
        } else {
          time += dist / 5000;
        }
        px = move.x; py = move.y; pz = move.z;
      }
      times[tp.operationId] = (times[tp.operationId] ?? 0) + time;
    }
    return times;
  }, [toolpaths, operations, tools]);

  const totalTime = Object.values(opTimes).reduce((sum, t) => sum + t, 0);
  const hasToolpaths = toolpaths.length > 0;

  // Drag and drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    dragRef.current = index;
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Needed for Firefox
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = dragRef.current;
    if (fromIndex != null && fromIndex !== toIndex) {
      reorderOperations(fromIndex, toIndex);
      if (hasToolpaths) {
        setTimeout(() => generate(), 0);
      }
    }
    setDragIndex(null);
    setDropTarget(null);
    dragRef.current = null;
  }, [reorderOperations, hasToolpaths, generate]);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropTarget(null);
    dragRef.current = null;
  }, []);

  const handleAdd = (type: OperationType) => {
    if (selectedIds.size === 0) return;
    const defaultTool = tools[0];
    if (!defaultTool) return;

    // For drill: detect concentric circle pairs (inner=drill, outer=counterbore)
    let drillCounterbore: { counterboreDiameter?: number; drillGeoIds?: string[] } = {};
    if (type === 'drill' && selectedIds.size >= 2) {
      // Find circles among selected geometry
      const selectedCircles: Array<{ id: string; cx: number; cy: number; r: number }> = [];
      for (const geoId of selectedIds) {
        // Check circles array
        const cIdx = circles.findIndex((_c, i) => `circle-${i}` === geoId);
        if (cIdx >= 0) {
          const c = circles[cIdx];
          selectedCircles.push({ id: geoId, cx: c.center.x, cy: c.center.y, r: c.radius });
          continue;
        }
        // Check loops (circles converted to loops)
        const loop = loops.find((l) => l.id === geoId);
        if (loop && loop.closed && loop.segments.length === 2 &&
            loop.segments[0].type === 'arc' && loop.segments[1].type === 'arc') {
          const arc = loop.segments[0] as ArcSegment;
          selectedCircles.push({ id: geoId, cx: arc.center.x, cy: arc.center.y, r: arc.radius });
        }
      }

      // Find concentric pairs (same center, different radius)
      if (selectedCircles.length >= 2) {
        const grouped = new Map<string, typeof selectedCircles>();
        for (const sc of selectedCircles) {
          const key = `${Math.round(sc.cx * 10)},${Math.round(sc.cy * 10)}`;
          const arr = grouped.get(key) || [];
          arr.push(sc);
          grouped.set(key, arr);
        }
        for (const group of grouped.values()) {
          if (group.length >= 2) {
            group.sort((a, b) => a.r - b.r);
            const inner = group[0];
            const outer = group[group.length - 1];
            drillCounterbore = {
              counterboreDiameter: outer.r * 2,
              drillGeoIds: [inner.id], // drill only the inner circle
            };
            break;
          }
        }
      }
    }

    const id = addOperation({
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${operations.length + 1}`,
      type,
      enabled: true,
      toolId: defaultTool.id,
      geometryIds: drillCounterbore.drillGeoIds ?? [...selectedIds],
      cutSide: type === 'contour' ? 'outside' : undefined,
      totalDepth: undefined,
      depthPerPass: undefined,
      stepOver: type === 'pocket' ? defaultTool.stepOver : undefined,
      finishPass: type === 'pocket' ? true : undefined,
      peck: type === 'drill' ? false : undefined,
      peckDepth: type === 'drill' ? 3 : undefined,
      counterbore: drillCounterbore.counterboreDiameter ? true : undefined,
      counterboreDiameter: drillCounterbore.counterboreDiameter,
      counterboreDepth: drillCounterbore.counterboreDiameter ? 3 : undefined,
    });
    setActiveOperationId(id);
  };

  return (
    <div className="operations-list">
      <h3>Operations</h3>
      <div className="op-add-buttons">
        <button onClick={() => handleAdd('contour')} disabled={selectedIds.size === 0}>+ Contour</button>
        <button onClick={() => handleAdd('pocket')} disabled={selectedIds.size === 0}>+ Pocket</button>
        <button onClick={() => handleAdd('drill')} disabled={selectedIds.size === 0}>+ Drill</button>
      </div>
      {selectedIds.size === 0 && operations.length === 0 && (
        <p className="hint">Select geometry in the viewport, then add an operation.</p>
      )}
      <div className="op-list">
        {operations.map((op, index) => {
          const time = opTimes[op.id];
          const tool = tools.find((t) => t.id === op.toolId);
          const depth = op.totalDepth ?? stock.thickness;
          const dpp = op.depthPerPass ?? tool?.depthPerPass ?? 1;
          const passes = Math.ceil(depth / dpp);
          const isDragging = dragIndex === index;
          const isOver = dropTarget === index && dragIndex !== index;
          return (
            <div
              key={op.id}
              className={`op-item ${activeOperationId === op.id ? 'active' : ''} ${isDragging ? 'dragging' : ''} ${isOver ? 'drop-over' : ''}`}
              onClick={() => setActiveOperationId(op.id)}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
            >
              <span className="op-drag-handle" title="Drag to reorder">⠿</span>
              <input
                type="checkbox"
                checked={op.enabled}
                onChange={(e) => updateOperation(op.id, { enabled: e.target.checked })}
                onClick={(e) => e.stopPropagation()}
              />
              <span className={`op-type-badge ${op.type}`}>{op.type[0].toUpperCase()}</span>
              <div className="op-item-info">
                <span className="op-name">{op.name}</span>
                <span className="op-item-detail">
                  {tool ? `${tool.diameter}mm` : '—'}
                  {' · '}{depth.toFixed(1)}mm · {passes}p
                  {time != null ? ` · ${formatTime(time)}` : ''}
                </span>
              </div>
              <button
                className="btn-sm btn-danger"
                onClick={(e) => { e.stopPropagation(); removeOperation(op.id); }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      {operations.length > 0 && totalTime > 0 && (
        <div className="op-total-time">
          Total: {formatTime(totalTime)}
        </div>
      )}
    </div>
  );
}
