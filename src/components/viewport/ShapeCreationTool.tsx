import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useUIStore } from '../../store/useUIStore';
import { useGeometryStore } from '../../store/useGeometryStore';
import { useProjectStore } from '../../store/useProjectStore';
import { createRectangle, createCircleEntity, createPolygon } from '../../engine/geometry/shapes';
import { analyzeGeometry } from '../../engine/geometry/loops';
import { computeBounds, segmentToPoints } from '../../engine/geometry/utils';
import type { Segment, CircleEntity, Point2D } from '../../engine/geometry/types';

interface Props {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera | null;
  renderer: THREE.WebGLRenderer | null;
}

function screenToWorld(
  clientX: number,
  clientY: number,
  camera: THREE.OrthographicCamera,
  canvas: HTMLCanvasElement,
): Point2D {
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
  const world = new THREE.Vector3(ndcX, ndcY, 0).unproject(camera);
  return { x: world.x, y: world.y };
}

export function ShapeCreationTool({ scene, camera, renderer }: Props) {
  const activeTool = useUIStore((s) => s.activeTool);
  const setActiveTool = useUIStore((s) => s.setActiveTool);
  const segments = useGeometryStore((s) => s.segments);
  const circles = useGeometryStore((s) => s.circles);
  const setGeometry = useGeometryStore((s) => s.setGeometry);
  const pushUndo = useGeometryStore((s) => s.pushUndo);
  const clearSelection = useGeometryStore((s) => s.clearSelection);
  const clearToolpaths = useProjectStore((s) => s.clearToolpaths);

  const previewRef = useRef<THREE.Line | null>(null);
  const dragRef = useRef<{
    startWorld: Point2D;
    active: boolean;
  } | null>(null);

  // Stable refs for event handlers
  const stateRef = useRef({
    activeTool, segments, circles, setGeometry, pushUndo, clearSelection, clearToolpaths, setActiveTool,
  });
  stateRef.current = {
    activeTool, segments, circles, setGeometry, pushUndo, clearSelection, clearToolpaths, setActiveTool,
  };

  useEffect(() => {
    if (!renderer || !camera) return;
    if (!activeTool || activeTool === 'select' || activeTool === 'text') return;

    const canvas = renderer.domElement;

    function clearPreview() {
      if (previewRef.current) {
        scene.remove(previewRef.current);
        previewRef.current.geometry.dispose();
        (previewRef.current.material as THREE.Material).dispose();
        previewRef.current = null;
      }
    }

    function buildPreviewPoints(start: Point2D, end: Point2D): Float32Array | null {
      const { activeTool: tool } = stateRef.current;
      const cx = (start.x + end.x) / 2;
      const cy = (start.y + end.y) / 2;
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);

      if (w < 0.01 && h < 0.01) return null;

      if (tool === 'rectangle') {
        const hx = w / 2;
        const hy = h / 2;
        return new Float32Array([
          cx - hx, cy - hy, 0,
          cx + hx, cy - hy, 0,
          cx + hx, cy + hy, 0,
          cx - hx, cy + hy, 0,
          cx - hx, cy - hy, 0,
        ]);
      }

      if (tool === 'circle') {
        const radius = Math.sqrt(w * w + h * h) / 2;
        const pts: number[] = [];
        const steps = 64;
        for (let i = 0; i <= steps; i++) {
          const angle = (i / steps) * Math.PI * 2;
          pts.push(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), 0);
        }
        return new Float32Array(pts);
      }

      if (tool === 'polygon') {
        const radius = Math.sqrt(w * w + h * h) / 2;
        const sides = 6; // default hexagon
        const pts: number[] = [];
        for (let i = 0; i <= sides; i++) {
          const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
          pts.push(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), 0);
        }
        return new Float32Array(pts);
      }

      return null;
    }

    function updatePreview(start: Point2D, end: Point2D) {
      clearPreview();
      const pts = buildPreviewPoints(start, end);
      if (!pts) return;

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      const mat = new THREE.LineDashedMaterial({
        color: 0x00aaff,
        dashSize: 2,
        gapSize: 1,
        linewidth: 1,
      });
      const line = new THREE.Line(geom, mat);
      line.computeLineDistances();
      previewRef.current = line;
      scene.add(line);
    }

    function addGeometry(newSegs: Segment[], newCircles: CircleEntity[]) {
      const { segments: existingSegs, circles: existingCircles, setGeometry: setGeo, pushUndo: pushUndoFn, clearSelection: clearSel, clearToolpaths: clearTp } = stateRef.current;
      pushUndoFn();
      clearSel();
      const allSegs = [...existingSegs, ...newSegs];
      const allCircles = [...existingCircles, ...newCircles];
      const { loops, regions, openPaths } = analyzeGeometry(allSegs, allCircles);
      const allPoints: Point2D[] = [];
      for (const seg of allSegs) allPoints.push(...segmentToPoints(seg));
      for (const c of allCircles) {
        allPoints.push(
          { x: c.center.x - c.radius, y: c.center.y - c.radius },
          { x: c.center.x + c.radius, y: c.center.y + c.radius },
        );
      }
      const bounds = computeBounds(allPoints);
      setGeo({ segments: allSegs, circles: allCircles, loops, regions, openPaths, bounds });
      clearTp();
    }

    function finishShape(start: Point2D, end: Point2D) {
      const { activeTool: tool } = stateRef.current;
      const cx = (start.x + end.x) / 2;
      const cy = (start.y + end.y) / 2;
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);

      if (w < 0.1 && h < 0.1) return;

      if (tool === 'rectangle') {
        const segs = createRectangle(cx, cy, w, h);
        addGeometry(segs, []);
      } else if (tool === 'circle') {
        const radius = Math.sqrt(w * w + h * h) / 2;
        const circle = createCircleEntity(cx, cy, radius);
        addGeometry([], [circle]);
      } else if (tool === 'polygon') {
        const radius = Math.sqrt(w * w + h * h) / 2;
        const segs = createPolygon(cx, cy, radius, 6);
        addGeometry(segs, []);
      }
    }

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (e.ctrlKey || e.metaKey) return; // Ctrl+click is pan
      const world = screenToWorld(e.clientX, e.clientY, camera, canvas);
      dragRef.current = { startWorld: world, active: true };
      e.stopPropagation();
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current?.active) return;
      const world = screenToWorld(e.clientX, e.clientY, camera, canvas);
      updatePreview(dragRef.current.startWorld, world);
      e.stopPropagation();
      e.preventDefault();
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!dragRef.current?.active) return;
      const world = screenToWorld(e.clientX, e.clientY, camera, canvas);
      finishShape(dragRef.current.startWorld, world);
      clearPreview();
      dragRef.current = null;
    };

    canvas.addEventListener('mousedown', onMouseDown, { capture: true });
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown, { capture: true } as EventListenerOptions);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      clearPreview();
    };
  }, [activeTool, renderer, camera, scene]);

  return null;
}
