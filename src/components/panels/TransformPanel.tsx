import { useState } from 'react';
import { useGeometryStore } from '../../store/useGeometryStore';
import { useProjectStore } from '../../store/useProjectStore';
import {
  translateGeometry,
  scaleGeometry,
  rotateGeometry,
} from '../../engine/geometry/transform';
import { analyzeGeometry } from '../../engine/geometry/loops';
import { computeBounds, segmentToPoints } from '../../engine/geometry/utils';
import type { Point2D } from '../../engine/geometry/types';

export function TransformPanel() {
  const segments = useGeometryStore((s) => s.segments);
  const circles = useGeometryStore((s) => s.circles);
  const bounds = useGeometryStore((s) => s.bounds);
  const setGeometry = useGeometryStore((s) => s.setGeometry);
  const pushUndo = useGeometryStore((s) => s.pushUndo);
  const clearToolpaths = useProjectStore((s) => s.clearToolpaths);

  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [scaleFactor, setScaleFactor] = useState(100);
  const [rotateDeg, setRotateDeg] = useState(0);

  const hasGeometry = segments.length > 0 || circles.length > 0;

  function reanalyze(newSegments: typeof segments, newCircles: typeof circles) {
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
  }

  const handleTranslate = () => {
    if (!hasGeometry) return;
    const { segments: s, circles: c } = translateGeometry(segments, circles, translateX, translateY);
    reanalyze(s, c);
    setTranslateX(0);
    setTranslateY(0);
  };

  const handleScale = () => {
    if (!hasGeometry || !bounds) return;
    const factor = scaleFactor / 100;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const { segments: s, circles: c } = scaleGeometry(segments, circles, factor, factor, cx, cy);
    reanalyze(s, c);
    setScaleFactor(100);
  };

  const handleRotate = () => {
    if (!hasGeometry || !bounds) return;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const { segments: s, circles: c } = rotateGeometry(segments, circles, rotateDeg, cx, cy);
    reanalyze(s, c);
    setRotateDeg(0);
  };

  return (
    <div className="transform-panel">
      <h3>Transform</h3>

      <div className="transform-section">
        <label className="transform-label">Move (mm)</label>
        <div className="transform-row">
          <input type="number" placeholder="X" value={translateX} onChange={(e) => setTranslateX(+e.target.value)} />
          <input type="number" placeholder="Y" value={translateY} onChange={(e) => setTranslateY(+e.target.value)} />
          <button onClick={handleTranslate} disabled={!hasGeometry}>Move</button>
        </div>
      </div>

      <div className="transform-section">
        <label className="transform-label">Scale (%)</label>
        <div className="transform-row">
          <input type="number" value={scaleFactor} onChange={(e) => setScaleFactor(+e.target.value)} />
          <button onClick={handleScale} disabled={!hasGeometry}>Scale</button>
        </div>
      </div>

      <div className="transform-section">
        <label className="transform-label">Rotate (deg)</label>
        <div className="transform-row">
          <input type="number" value={rotateDeg} onChange={(e) => setRotateDeg(+e.target.value)} />
          <button onClick={handleRotate} disabled={!hasGeometry}>Rotate</button>
        </div>
      </div>
    </div>
  );
}
