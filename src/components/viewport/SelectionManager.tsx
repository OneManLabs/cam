import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useGeometryStore } from '../../store/useGeometryStore';
import { useUIStore } from '../../store/useUIStore';
import type { ArcSegment } from '../../engine/geometry/types';

interface Props {
  renderer: THREE.WebGLRenderer | null;
  camera: THREE.OrthographicCamera | null;
  scene: THREE.Scene | null;
  onMarquee?: (rect: { left: number; top: number; width: number; height: number } | null) => void;
}

const DRAG_THRESHOLD = 5; // px — below this, treat as click

export function SelectionManager({ renderer, camera, scene, onMarquee }: Props) {
  const showSimulation = useUIStore((s) => s.showSimulation);
  const toggleSelection = useGeometryStore((s) => s.toggleSelection);
  const setSelection = useGeometryStore((s) => s.setSelection);
  const addToSelection = useGeometryStore((s) => s.addToSelection);
  const clearSelection = useGeometryStore((s) => s.clearSelection);
  const setHoveredId = useGeometryStore((s) => s.setHoveredId);
  const circles = useGeometryStore((s) => s.circles);
  const loops = useGeometryStore((s) => s.loops);

  // Stable refs so event handlers always see latest
  const stateRef = useRef({
    toggleSelection,
    setSelection,
    addToSelection,
    clearSelection,
    setHoveredId,
    circles,
    loops,
    onMarquee,
  });
  stateRef.current = {
    toggleSelection,
    setSelection,
    addToSelection,
    clearSelection,
    setHoveredId,
    circles,
    loops,
    onMarquee,
  };

  const buildCircleToLoopId = useCallback(() => {
    const { circles: c, loops: l } = stateRef.current;
    const map = new Map<string, string>();
    for (let i = 0; i < c.length; i++) {
      const circle = c[i];
      const match = l.find((lp) => {
        const first = lp.segments[0];
        const second = lp.segments[1];
        if (!lp.closed || lp.segments.length !== 2 || first?.type !== 'arc' || second?.type !== 'arc') {
          return false;
        }
        const arc = first as ArcSegment;
        return Math.abs(arc.center.x - circle.center.x) < 0.01 &&
          Math.abs(arc.center.y - circle.center.y) < 0.01 &&
          Math.abs(arc.radius - circle.radius) < 0.01;
      });
      if (match) map.set(`circle-${i}`, match.id);
    }
    return map;
  }, []);

  useEffect(() => {
    if (!renderer || !camera || !scene) return;
    // Disable all selection interactions during 3D simulation
    if (showSimulation) return;

    const activeCamera = camera;
    const activeScene = scene;
    const canvas = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 5 };
    const mouse = new THREE.Vector2();

    // --- Helpers ---
    function resolveId(obj: THREE.Object3D, circleToLoopId: Map<string, string>): string | null {
      const ud = obj.userData;
      if (ud.loopId) return ud.loopId;
      if (ud.circleId) return circleToLoopId.get(ud.circleId) ?? ud.circleId;
      return null;
    }

    function raycastBestId(clientX: number, clientY: number): string | null {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, activeCamera);

      const worldClick = new THREE.Vector3(mouse.x, mouse.y, 0).unproject(activeCamera);
      const intersects = raycaster.intersectObjects(activeScene.children, true);
      const circleToLoopId = buildCircleToLoopId();

      let bestId: string | null = null;
      let bestDist = Infinity;

      for (const hit of intersects) {
        if (!hit.object.userData?.selectable) continue;
        const id = resolveId(hit.object, circleToLoopId);
        if (id) {
          const dx = hit.point.x - worldClick.x;
          const dy = hit.point.y - worldClick.y;
          const dist = dx * dx + dy * dy;
          if (dist < bestDist) {
            bestDist = dist;
            bestId = id;
          }
        }
      }
      return bestId;
    }

    function getWorldBoundsForObject(obj: THREE.Object3D): { minX: number; minY: number; maxX: number; maxY: number } | null {
      if (!(obj instanceof THREE.Line)) return null;
      const posAttr = obj.geometry.getAttribute('position');
      if (!posAttr) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      return { minX, minY, maxX, maxY };
    }

    // --- Drag state ---
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragButton = -1;

    // --- Hover (throttled) ---
    let hoverRaf = 0;
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging && dragButton === 0) {
        // Update marquee overlay
        const rect = canvas.getBoundingClientRect();
        const left = Math.min(dragStartX, e.clientX) - rect.left;
        const top = Math.min(dragStartY, e.clientY) - rect.top;
        const w = Math.abs(e.clientX - dragStartX);
        const h = Math.abs(e.clientY - dragStartY);
        if (w > DRAG_THRESHOLD || h > DRAG_THRESHOLD) {
          stateRef.current.onMarquee?.({ left, top, width: w, height: h });
        }
        return;
      }

      // Hover highlight (throttled via rAF)
      if (hoverRaf) return;
      hoverRaf = requestAnimationFrame(() => {
        hoverRaf = 0;
        if (isDragging) return;
        const id = raycastBestId(e.clientX, e.clientY);
        stateRef.current.setHoveredId(id);
      });
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // only left button
      if (e.ctrlKey || e.metaKey) return; // Ctrl+click is pan
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragButton = e.button;
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!isDragging || dragButton !== 0) {
        isDragging = false;
        return;
      }

      const dx = Math.abs(e.clientX - dragStartX);
      const dy = Math.abs(e.clientY - dragStartY);
      const wasDrag = dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD;

      // Hide marquee
      stateRef.current.onMarquee?.(null);
      isDragging = false;
      dragButton = -1;

      if (!wasDrag) {
        // --- Click behavior ---
        const id = raycastBestId(e.clientX, e.clientY);
        if (id) {
          if (e.shiftKey) {
            stateRef.current.toggleSelection(id);
          } else {
            stateRef.current.setSelection([id]);
          }
        } else {
          // Clicked empty space
          stateRef.current.clearSelection();
        }
      } else {
        // --- Marquee selection ---
        const rect = canvas.getBoundingClientRect();

        // Convert marquee corners to world space
        const ndcX1 = ((Math.min(dragStartX, e.clientX) - rect.left) / rect.width) * 2 - 1;
        const ndcY1 = -(((Math.min(dragStartY, e.clientY) - rect.top) / rect.height) * 2 - 1);
        const ndcX2 = ((Math.max(dragStartX, e.clientX) - rect.left) / rect.width) * 2 - 1;
        const ndcY2 = -(((Math.max(dragStartY, e.clientY) - rect.top) / rect.height) * 2 - 1);

        const worldMin = new THREE.Vector3(ndcX1, ndcY1, 0).unproject(activeCamera);
        const worldMax = new THREE.Vector3(ndcX2, ndcY2, 0).unproject(activeCamera);

        const boxMinX = Math.min(worldMin.x, worldMax.x);
        const boxMaxX = Math.max(worldMin.x, worldMax.x);
        const boxMinY = Math.min(worldMin.y, worldMax.y);
        const boxMaxY = Math.max(worldMin.y, worldMax.y);

        const circleToLoopId = buildCircleToLoopId();
        const hitIds: string[] = [];

        // Check all selectable objects
        activeScene.traverse((obj) => {
          if (!obj.userData?.selectable) return;
          const id = resolveId(obj, circleToLoopId);
          if (!id) return;

          const bounds = getWorldBoundsForObject(obj);
          if (!bounds) return;

          // Object must be fully contained within the marquee box
          const contained =
            bounds.minX >= boxMinX && bounds.maxX <= boxMaxX &&
            bounds.minY >= boxMinY && bounds.maxY <= boxMaxY;

          if (contained) {
            hitIds.push(id);
          }
        });

        if (hitIds.length > 0) {
          if (e.shiftKey) {
            stateRef.current.addToSelection(hitIds);
          } else {
            stateRef.current.setSelection(hitIds);
          }
        } else if (!e.shiftKey) {
          stateRef.current.clearSelection();
        }
      }
    };

    const onMouseLeave = () => {
      stateRef.current.setHoveredId(null);
    };

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);

    return () => {
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      if (hoverRaf) cancelAnimationFrame(hoverRaf);
    };
  }, [renderer, camera, scene, buildCircleToLoopId, showSimulation]);

  return null;
}
