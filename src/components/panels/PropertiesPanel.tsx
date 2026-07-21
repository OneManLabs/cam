import { useState, useEffect, useCallback } from 'react';
import { useGeometryStore } from '../../store/useGeometryStore';
import { useProjectStore } from '../../store/useProjectStore';
import {
  translateGeometry,
  scaleGeometry,
  rotateGeometry,
} from '../../engine/geometry/transform';
import { analyzeGeometry } from '../../engine/geometry/loops';
import { computeBounds, segmentToPoints } from '../../engine/geometry/utils';
import type { Point2D, BoundingBox } from '../../engine/geometry/types';

/** Number input that only commits on blur or Enter */
function NumInput({
  value,
  onChange,
  step = 0.1,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  label?: string;
}) {
  const [local, setLocal] = useState(String(value));

  useEffect(() => {
    setLocal(String(+value.toFixed(3)));
  }, [value]);

  const commit = () => {
    const v = parseFloat(local);
    if (!isNaN(v) && v !== value) onChange(v);
  };

  return (
    <>
      {label && <label className="input-label">{label}</label>}
      <input
        type="number"
        value={local}
        step={step}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </>
  );
}

/** SVG icon button for the transform grid */
function TxBtn({
  title,
  onClick,
  children,
  danger,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      className={`tx-btn${danger ? ' tx-btn-danger' : ''}`}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function PropertiesPanel() {
  const segments = useGeometryStore((s) => s.segments);
  const circles = useGeometryStore((s) => s.circles);
  const bounds = useGeometryStore((s) => s.bounds);
  const loops = useGeometryStore((s) => s.loops);
  const selectedIds = useGeometryStore((s) => s.selectedIds);
  const setGeometry = useGeometryStore((s) => s.setGeometry);
  const pushUndo = useGeometryStore((s) => s.pushUndo);
  const deleteSelected = useGeometryStore((s) => s.deleteSelected);
  const clearToolpaths = useProjectStore((s) => s.clearToolpaths);

  const hasGeometry = segments.length > 0 || circles.length > 0;
  const hasSelection = selectedIds.size > 0;

  const selectionBounds: BoundingBox | null = (() => {
    if (!hasSelection) return bounds;
    const pts: Point2D[] = [];
    for (const id of selectedIds) {
      const loop = loops.find((l) => l.id === id);
      if (loop) {
        pts.push(
          { x: loop.bounds.minX, y: loop.bounds.minY },
          { x: loop.bounds.maxX, y: loop.bounds.maxY },
        );
      }
    }
    return pts.length > 0 ? computeBounds(pts) : bounds;
  })();

  const reanalyze = useCallback((newSegments: typeof segments, newCircles: typeof circles) => {
    pushUndo();
    const { loops: l, regions, openPaths } = analyzeGeometry(newSegments, newCircles);
    const allPoints: Point2D[] = [];
    for (const seg of newSegments) allPoints.push(...segmentToPoints(seg));
    for (const c of newCircles) {
      allPoints.push(
        { x: c.center.x - c.radius, y: c.center.y - c.radius },
        { x: c.center.x + c.radius, y: c.center.y + c.radius },
      );
    }
    const newBounds = computeBounds(allPoints);
    setGeometry({ segments: newSegments, circles: newCircles, loops: l, regions, openPaths, bounds: newBounds });
    clearToolpaths();
  }, [setGeometry, pushUndo, clearToolpaths]);

  if (!hasGeometry || !selectionBounds) {
    return (
      <div className="properties-panel">
        <div className="panel-placeholder">
          {hasSelection ? 'No geometry selected' : 'Import or create geometry'}
        </div>
      </div>
    );
  }

  const bw = selectionBounds.maxX - selectionBounds.minX;
  const bh = selectionBounds.maxY - selectionBounds.minY;
  const cx = (selectionBounds.minX + selectionBounds.maxX) / 2;
  const cy = (selectionBounds.minY + selectionBounds.maxY) / 2;

  const handleResize = (newW: number, newH: number) => {
    if (bw < 0.001 || bh < 0.001) return;
    const sx = newW / bw;
    const sy = newH / bh;
    const { segments: s, circles: c } = scaleGeometry(segments, circles, sx, sy, cx, cy);
    reanalyze(s, c);
  };

  const handlePosition = (newX: number, newY: number) => {
    const dx = newX - selectionBounds.minX;
    const dy = newY - selectionBounds.minY;
    if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return;
    const { segments: s, circles: c } = translateGeometry(segments, circles, dx, dy);
    reanalyze(s, c);
  };

  const rotate = (deg: number) => {
    const { segments: s, circles: c } = rotateGeometry(segments, circles, deg, cx, cy);
    reanalyze(s, c);
  };

  const mirrorH = () => {
    const { segments: s, circles: c } = scaleGeometry(segments, circles, -1, 1, cx, 0);
    reanalyze(s, c);
  };

  const mirrorV = () => {
    const { segments: s, circles: c } = scaleGeometry(segments, circles, 1, -1, 0, cy);
    reanalyze(s, c);
  };

  const alignLeft = () => handlePosition(0, selectionBounds.minY);
  const alignBottom = () => handlePosition(selectionBounds.minX, 0);
  const alignCenterH = () => {
    const { segments: s, circles: c } = translateGeometry(segments, circles, -cx, 0);
    reanalyze(s, c);
  };
  const alignCenterV = () => {
    const { segments: s, circles: c } = translateGeometry(segments, circles, 0, -cy);
    reanalyze(s, c);
  };
  const centerOnOrigin = () => {
    const { segments: s, circles: c } = translateGeometry(segments, circles, -cx, -cy);
    reanalyze(s, c);
  };
  const moveToOrigin = () => {
    const { segments: s, circles: c } = translateGeometry(segments, circles, -selectionBounds.minX, -selectionBounds.minY);
    reanalyze(s, c);
  };

  return (
    <div className="properties-panel">
      {hasSelection && (
        <div className="prop-info">
          {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected
        </div>
      )}

      {/* Size */}
      <div className="prop-section">
        <label className="prop-label">Size (mm)</label>
        <div className="prop-row">
          <NumInput label="W" value={bw} onChange={(v) => handleResize(v, bh)} />
          <NumInput label="H" value={bh} onChange={(v) => handleResize(bw, v)} />
        </div>
      </div>

      {/* Position */}
      <div className="prop-section">
        <label className="prop-label">Position (mm)</label>
        <div className="prop-row">
          <NumInput label="X" value={selectionBounds.minX} onChange={(v) => handlePosition(v, selectionBounds.minY)} />
          <NumInput label="Y" value={selectionBounds.minY} onChange={(v) => handlePosition(selectionBounds.minX, v)} />
        </div>
      </div>

      {/* Transform icon grid */}
      <div className="prop-section">
        <label className="prop-label">Transform</label>
        <div className="tx-grid">
          {/* Row 1: Rotate + Mirror */}
          <TxBtn title="Rotate 90° CW" onClick={() => rotate(-90)}>
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" fill="currentColor"/></svg>
          </TxBtn>
          <TxBtn title="Rotate 90° CCW" onClick={() => rotate(90)}>
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 4V1l4 4-4 4V6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" fill="currentColor"/></svg>
          </TxBtn>
          <TxBtn title="Rotate 180°" onClick={() => rotate(180)}>
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 6V3l-4 4 4 4V8c2.76 0 5 2.24 5 5s-2.24 5-5 5-5-2.24-5-5H5c0 3.87 3.13 7 7 7s7-3.13 7-7-3.13-7-7-7z" fill="currentColor"/><text x="12" y="16" textAnchor="middle" fontSize="7" fill="currentColor" fontWeight="bold">180</text></svg>
          </TxBtn>
          <TxBtn title="Mirror Horizontal" onClick={mirrorH}>
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M11 0.5V23.5" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" fill="none"/><polygon points="6,6 2,12 6,18" fill="currentColor" opacity="0.4"/><polygon points="16,6 20,12 16,18" fill="currentColor"/></svg>
          </TxBtn>
          <TxBtn title="Mirror Vertical" onClick={mirrorV}>
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M0.5 12H23.5" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" fill="none"/><polygon points="6,6 12,2 18,6" fill="currentColor" opacity="0.4"/><polygon points="6,18 12,22 18,18" fill="currentColor"/></svg>
          </TxBtn>
        </div>
      </div>

      {/* Align icon grid */}
      <div className="prop-section">
        <label className="prop-label">Align</label>
        <div className="tx-grid">
          <TxBtn title="Align Left" onClick={alignLeft}>
            <svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="3" width="1.5" height="18" fill="currentColor"/><rect x="7" y="6" width="12" height="4" rx="1" fill="currentColor" opacity="0.7"/><rect x="7" y="14" width="8" height="4" rx="1" fill="currentColor" opacity="0.7"/></svg>
          </TxBtn>
          <TxBtn title="Center Horizontally" onClick={alignCenterH}>
            <svg viewBox="0 0 24 24" width="20" height="20"><rect x="11.25" y="3" width="1.5" height="18" fill="currentColor" opacity="0.4"/><rect x="5" y="6" width="14" height="4" rx="1" fill="currentColor" opacity="0.7"/><rect x="7" y="14" width="10" height="4" rx="1" fill="currentColor" opacity="0.7"/></svg>
          </TxBtn>
          <TxBtn title="Align Bottom" onClick={alignBottom}>
            <svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="19.5" width="18" height="1.5" fill="currentColor"/><rect x="5" y="8" width="4" height="10" rx="1" fill="currentColor" opacity="0.7"/><rect x="12" y="13" width="4" height="5" rx="1" fill="currentColor" opacity="0.7"/></svg>
          </TxBtn>
          <TxBtn title="Center Vertically" onClick={alignCenterV}>
            <svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="11.25" width="18" height="1.5" fill="currentColor" opacity="0.4"/><rect x="5" y="5" width="4" height="14" rx="1" fill="currentColor" opacity="0.7"/><rect x="12" y="7" width="4" height="10" rx="1" fill="currentColor" opacity="0.7"/></svg>
          </TxBtn>
          <TxBtn title="Center on Origin" onClick={centerOnOrigin}>
            <svg viewBox="0 0 24 24" width="20" height="20"><line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" strokeWidth="1" opacity="0.4"/><line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1" opacity="0.4"/><rect x="7" y="7" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
          </TxBtn>
          <TxBtn title="Move to Origin (0,0)" onClick={moveToOrigin}>
            <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="4" cy="20" r="2" fill="currentColor" opacity="0.5"/><rect x="6" y="5" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M6 15L4 20M6 10L4 20" stroke="currentColor" strokeWidth="0.8" opacity="0.3"/></svg>
          </TxBtn>
        </div>
      </div>

      {hasSelection && (
        <div className="prop-section">
          <button
            className="btn-danger"
            style={{ width: '100%' }}
            onClick={() => { deleteSelected(); clearToolpaths(); }}
          >
            Delete Selected
          </button>
        </div>
      )}
    </div>
  );
}
