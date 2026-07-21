import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGeometryStore } from '../../store/useGeometryStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useUIStore';
import { scaleGeometry } from '../../engine/geometry/transform';
import { analyzeGeometry } from '../../engine/geometry/loops';
import { computeBounds, segmentToPoints } from '../../engine/geometry/utils';
import type { Segment, CircleEntity, BoundingBox, Point2D } from '../../engine/geometry/types';

interface Props {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera | null;
  renderer: THREE.WebGLRenderer | null;
}

const HANDLE_COUNT = 8;

interface DragState {
  startWorld: { x: number; y: number };
  startBounds: BoundingBox;
  handleIndex: number;
  origSegments: Segment[];
  origCircles: CircleEntity[];
}

function screenToWorld(
  clientX: number, clientY: number,
  camera: THREE.OrthographicCamera, canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
  const world = new THREE.Vector3(ndcX, ndcY, 0).unproject(camera);
  return { x: world.x, y: world.y };
}

function getSelectionBounds(
  selectedIds: Set<string>, loops: { id: string; bounds: BoundingBox }[],
): BoundingBox | null {
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
  return pts.length > 0 ? computeBounds(pts) : null;
}

function getHandlePositions(bounds: BoundingBox): { x: number; y: number }[] {
  const { minX, minY, maxX, maxY } = bounds;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  return [
    { x: minX, y: maxY }, { x: maxX, y: maxY },
    { x: maxX, y: minY }, { x: minX, y: minY },
    { x: midX, y: maxY }, { x: maxX, y: midY },
    { x: midX, y: minY }, { x: minX, y: midY },
  ];
}

function getAnchorForHandle(handleIndex: number, bounds: BoundingBox): { x: number; y: number } {
  const positions = getHandlePositions(bounds);
  const oppositeMap: Record<number, number> = {
    0: 2, 1: 3, 2: 0, 3: 1, 4: 6, 5: 7, 6: 4, 7: 5,
  };
  return positions[oppositeMap[handleIndex]];
}

function getCursorForHandle(i: number): string {
  return ['nwse-resize','nesw-resize','nwse-resize','nesw-resize','ns-resize','ew-resize','ns-resize','ew-resize'][i];
}

export function TransformGizmo({ scene, camera, renderer }: Props) {
  const segments = useGeometryStore((s) => s.segments);
  const circles = useGeometryStore((s) => s.circles);
  const bounds = useGeometryStore((s) => s.bounds);
  const loops = useGeometryStore((s) => s.loops);
  const selectedIds = useGeometryStore((s) => s.selectedIds);
  const setGeometry = useGeometryStore((s) => s.setGeometry);
  const pushUndo = useGeometryStore((s) => s.pushUndo);
  const clearToolpaths = useProjectStore((s) => s.clearToolpaths);
  const showSimulation = useUIStore((s) => s.showSimulation);
  const activeTool = useUIStore((s) => s.activeTool);

  const hasSelection = selectedIds.size > 0;
  const selBounds = hasSelection ? getSelectionBounds(selectedIds, loops) : null;
  const effectiveBounds = selBounds || bounds;

  const stateRef = useRef({
    segments, circles, bounds: effectiveBounds, setGeometry, clearToolpaths, pushUndo,
  });
  stateRef.current = { segments, circles, bounds: effectiveBounds, setGeometry, clearToolpaths, pushUndo };

  const dragRef = useRef<DragState | null>(null);
  const gizmoGroupRef = useRef<THREE.Group | null>(null);

  const isToolActive = activeTool !== null && activeTool !== 'select';
  const visible = hasSelection && !showSimulation && !isToolActive && effectiveBounds !== null;

  // Build gizmo — subtle bbox + corner/edge handles only
  useEffect(() => {
    if (!camera) return;

    if (gizmoGroupRef.current) {
      scene.remove(gizmoGroupRef.current);
      gizmoGroupRef.current.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else (obj.material as THREE.Material).dispose();
        }
      });
      gizmoGroupRef.current = null;
    }

    if (!visible || !effectiveBounds) return;

    const frustumH = (camera.top - camera.bottom) / camera.zoom;
    const handleSize = frustumH * 0.01;
    const { minX, minY, maxX, maxY } = effectiveBounds;

    const group = new THREE.Group();
    group.name = 'transform-gizmo';
    group.renderOrder = 999;

    // Thin solid bounding box
    const bboxVerts = new Float32Array([
      minX, minY, 0, maxX, minY, 0,
      maxX, minY, 0, maxX, maxY, 0,
      maxX, maxY, 0, minX, maxY, 0,
      minX, maxY, 0, minX, minY, 0,
    ]);
    const bboxGeom = new THREE.BufferGeometry();
    bboxGeom.setAttribute('position', new THREE.BufferAttribute(bboxVerts, 3));
    const bboxMat = new THREE.LineBasicMaterial({
      color: 0x4488ff, depthTest: false, transparent: true, opacity: 0.5,
    });
    const bboxLine = new THREE.LineSegments(bboxGeom, bboxMat);
    bboxLine.renderOrder = 999;
    group.add(bboxLine);

    // Resize handles (all 8)
    const handlePositions = getHandlePositions(effectiveBounds);
    for (let i = 0; i < HANDLE_COUNT; i++) {
      const pos = handlePositions[i];
      const isCorner = i < 4;
      const sz = isCorner ? handleSize * 0.8 : handleSize * 0.6;

      const fillGeom = new THREE.PlaneGeometry(sz, sz);
      const fillMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
      const fillMesh = new THREE.Mesh(fillGeom, fillMat);
      fillMesh.position.set(pos.x, pos.y, 0);
      fillMesh.renderOrder = 1000;
      group.add(fillMesh);

      const borderGeom = new THREE.PlaneGeometry(sz * 1.3, sz * 1.3);
      const borderMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, depthTest: false });
      const borderMesh = new THREE.Mesh(borderGeom, borderMat);
      borderMesh.position.set(pos.x, pos.y, -0.001);
      borderMesh.renderOrder = 999;
      group.add(borderMesh);
    }

    scene.add(group);
    gizmoGroupRef.current = group;

    return () => {
      if (gizmoGroupRef.current) {
        scene.remove(gizmoGroupRef.current);
        gizmoGroupRef.current.traverse((obj) => {
          if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
            obj.geometry.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
            else (obj.material as THREE.Material).dispose();
          }
        });
        gizmoGroupRef.current = null;
      }
    };
  }, [scene, camera, visible, effectiveBounds]);

  // Resize-only drag events
  useEffect(() => {
    if (!camera || !renderer) return;
    if (!visible) return;

    const canvas = renderer.domElement;

    function reanalyze(newSegments: Segment[], newCircles: CircleEntity[]) {
      const { loops, regions, openPaths } = analyzeGeometry(newSegments, newCircles);
      const allPoints: { x: number; y: number }[] = [];
      for (const seg of newSegments) allPoints.push(...segmentToPoints(seg));
      for (const c of newCircles) {
        allPoints.push(
          { x: c.center.x - c.radius, y: c.center.y - c.radius },
          { x: c.center.x + c.radius, y: c.center.y + c.radius },
        );
      }
      const newBounds = computeBounds(allPoints);
      stateRef.current.setGeometry({
        segments: newSegments, circles: newCircles,
        loops, regions, openPaths, bounds: newBounds,
      });
      stateRef.current.clearToolpaths();
    }

    function hitTestHandle(worldX: number, worldY: number): number {
      const currentBounds = stateRef.current.bounds;
      if (!currentBounds || !camera) return -1;

      const frustumH = (camera.top - camera.bottom) / camera.zoom;
      const hitRadius = frustumH * 0.015;

      const positions = getHandlePositions(currentBounds);
      for (let i = 0; i < HANDLE_COUNT; i++) {
        const dx = worldX - positions[i].x;
        const dy = worldY - positions[i].y;
        if (Math.sqrt(dx * dx + dy * dy) < hitRadius) return i;
      }
      return -1;
    }

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || !camera) return;
      if (e.ctrlKey || e.metaKey) return;

      const world = screenToWorld(e.clientX, e.clientY, camera, canvas);
      const handleIndex = hitTestHandle(world.x, world.y);
      if (handleIndex < 0) return;

      e.stopPropagation();
      e.preventDefault();
      stateRef.current.pushUndo();

      dragRef.current = {
        startWorld: world,
        startBounds: { ...stateRef.current.bounds! },
        handleIndex,
        origSegments: [...stateRef.current.segments],
        origCircles: [...stateRef.current.circles],
      };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!camera) return;
      const world = screenToWorld(e.clientX, e.clientY, camera, canvas);
      const drag = dragRef.current;

      if (!drag) {
        // Hover cursor
        const h = hitTestHandle(world.x, world.y);
        canvas.style.cursor = h >= 0 ? getCursorForHandle(h) : '';
        return;
      }

      e.stopPropagation();
      e.preventDefault();

      const anchor = getAnchorForHandle(drag.handleIndex, drag.startBounds);
      const handlePos = getHandlePositions(drag.startBounds)[drag.handleIndex];
      const origDx = handlePos.x - anchor.x;
      const origDy = handlePos.y - anchor.y;
      const newDx = world.x - anchor.x;
      const newDy = world.y - anchor.y;

      let sx = origDx !== 0 ? newDx / origDx : 1;
      let sy = origDy !== 0 ? newDy / origDy : 1;

      // Edge handles constrain one axis
      if (drag.handleIndex === 4 || drag.handleIndex === 6) sx = 1;
      else if (drag.handleIndex === 5 || drag.handleIndex === 7) sy = 1;

      if (Math.abs(sx) < 0.01) sx = 0.01 * Math.sign(sx || 1);
      if (Math.abs(sy) < 0.01) sy = 0.01 * Math.sign(sy || 1);

      const { segments: s, circles: c } = scaleGeometry(drag.origSegments, drag.origCircles, sx, sy, anchor.x, anchor.y);
      reanalyze(s, c);
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!dragRef.current) return;
      e.stopPropagation();
      e.preventDefault();
      dragRef.current = null;
      canvas.style.cursor = '';
    };

    canvas.addEventListener('mousedown', onMouseDown, { capture: true });
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown, { capture: true });
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.style.cursor = '';
    };
  }, [camera, renderer, visible]);

  return null;
}
