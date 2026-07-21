import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGeometryStore } from '../../store/useGeometryStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useUIStore';
import { loopToPoints } from '../../engine/geometry/utils';
import type { ArcSegment } from '../../engine/geometry/types';

// Color constants
const COLOR_UNSELECTED = 0x4488ff;
const COLOR_OPEN_PATH = 0x666666;
const COLOR_SELECTED = 0x00ffff;
const COLOR_HOVERED = 0x88ccff;

interface Props {
  scene: THREE.Scene;
}

export function GeometryRenderer({ scene }: Props) {
  const groupRef = useRef(new THREE.Group());
  const stockRef = useRef(new THREE.Group());
  const loops = useGeometryStore((s) => s.loops);
  const circles = useGeometryStore((s) => s.circles);
  const openPaths = useGeometryStore((s) => s.openPaths);
  const selectedIds = useGeometryStore((s) => s.selectedIds);
  const hoveredId = useGeometryStore((s) => s.hoveredId);
  const stock = useProjectStore((s) => s.stock);
  const showSimulation = useUIStore((s) => s.showSimulation);

  useEffect(() => {
    const geometryGroup = groupRef.current;
    const stockGroup = stockRef.current;
    scene.add(geometryGroup);
    scene.add(stockGroup);
    return () => {
      scene.remove(geometryGroup);
      scene.remove(stockGroup);
    };
  }, [scene]);

  // Build geometry (only when geometry data changes)
  useEffect(() => {
    const group = groupRef.current;
    while (group.children.length) group.remove(group.children[0]);

    for (const loop of loops) {
      const points = loopToPoints(loop);
      const pts = points.map((p) => new THREE.Vector3(p.x, p.y, 0));
      if (loop.closed && pts.length > 1) {
        pts.push(pts[0].clone());
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(pts);
      const material = new THREE.LineBasicMaterial({ color: COLOR_UNSELECTED });
      const line = new THREE.Line(geometry, material);
      line.userData = { loopId: loop.id, selectable: true };
      group.add(line);
    }

    for (const path of openPaths) {
      const pts: THREE.Vector3[] = [];
      for (const seg of path) {
        if (seg.type === 'line') {
          if (pts.length === 0) pts.push(new THREE.Vector3(seg.start.x, seg.start.y, 0));
          pts.push(new THREE.Vector3(seg.end.x, seg.end.y, 0));
        } else {
          const arcPts = tessellateArcSimple(seg);
          for (const p of arcPts) {
            pts.push(new THREE.Vector3(p.x, p.y, 0));
          }
        }
      }
      if (pts.length > 1) {
        const geometry = new THREE.BufferGeometry().setFromPoints(pts);
        const material = new THREE.LineBasicMaterial({ color: COLOR_OPEN_PATH });
        group.add(new THREE.Line(geometry, material));
      }
    }

    for (let i = 0; i < circles.length; i++) {
      const c = circles[i];
      const id = `circle-${i}`;
      const circlePoints: THREE.Vector3[] = [];
      const segments = 64;
      for (let j = 0; j <= segments; j++) {
        const a = (j / segments) * Math.PI * 2;
        circlePoints.push(new THREE.Vector3(
          c.center.x + c.radius * Math.cos(a),
          c.center.y + c.radius * Math.sin(a),
          0
        ));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(circlePoints);
      const material = new THREE.LineBasicMaterial({ color: COLOR_UNSELECTED });
      const line = new THREE.Line(geometry, material);
      line.userData = { circleId: id, selectable: true };
      group.add(line);
    }
  }, [loops, circles, openPaths]);

  // Update colors only (cheap — runs on selection/hover change without rebuilding geometry)
  useEffect(() => {
    const group = groupRef.current;

    // Build circle->loop mapping for selection check
    const circleToLoopId = new Map<string, string>();
    for (let i = 0; i < circles.length; i++) {
      const c = circles[i];
      const match = loops.find((l) => {
        const first = l.segments[0];
        const second = l.segments[1];
        if (!l.closed || l.segments.length !== 2 || first?.type !== 'arc' || second?.type !== 'arc') {
          return false;
        }
        const arc = first as ArcSegment;
        return Math.abs(arc.center.x - c.center.x) < 0.01 &&
          Math.abs(arc.center.y - c.center.y) < 0.01 &&
          Math.abs(arc.radius - c.radius) < 0.01;
      });
      if (match) circleToLoopId.set(`circle-${i}`, match.id);
    }

    for (const child of group.children) {
      if (!(child instanceof THREE.Line)) continue;
      const mat = child.material as THREE.LineBasicMaterial;
      const ud = child.userData;

      let id: string | null = ud.loopId ?? null;
      if (!id && ud.circleId) {
        id = circleToLoopId.get(ud.circleId) ?? ud.circleId;
      }

      if (!id) continue; // open path, skip

      const isSelected = selectedIds.has(id) || (ud.circleId && selectedIds.has(ud.circleId));
      const isHovered = hoveredId === id || (ud.circleId && hoveredId === ud.circleId);

      if (isSelected) {
        mat.color.setHex(COLOR_SELECTED);
        mat.linewidth = 1;
      } else if (isHovered) {
        mat.color.setHex(COLOR_HOVERED);
        mat.linewidth = 1;
      } else {
        mat.color.setHex(ud.loopId ? COLOR_UNSELECTED : COLOR_UNSELECTED);
        mat.linewidth = 1;
      }
    }
  }, [selectedIds, hoveredId, loops, circles]);

  useEffect(() => {
    const group = stockRef.current;
    while (group.children.length) group.remove(group.children[0]);

    if (showSimulation) return;

    const { width, height, originX, originY } = stock;
    const pts = [
      new THREE.Vector3(originX, originY, 0),
      new THREE.Vector3(originX + width, originY, 0),
      new THREE.Vector3(originX + width, originY + height, 0),
      new THREE.Vector3(originX, originY + height, 0),
      new THREE.Vector3(originX, originY, 0),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(pts);
    const material = new THREE.LineDashedMaterial({ color: 0xff8800, dashSize: 5, gapSize: 3 });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    group.add(line);
  }, [stock, showSimulation]);

  return null;
}

function tessellateArcSimple(arc: { center: { x: number; y: number }; radius: number; startAngle: number; endAngle: number; clockwise: boolean }) {
  const points: { x: number; y: number }[] = [];
  const start = arc.startAngle;
  let end = arc.endAngle;
  if (arc.clockwise) {
    if (end >= start) end -= Math.PI * 2;
  } else {
    if (end <= start) end += Math.PI * 2;
  }
  const steps = Math.max(8, Math.ceil(Math.abs(end - start) / (Math.PI / 16)));
  for (let i = 0; i <= steps; i++) {
    const t = start + (end - start) * (i / steps);
    points.push({
      x: arc.center.x + arc.radius * Math.cos(t),
      y: arc.center.y + arc.radius * Math.sin(t),
    });
  }
  return points;
}
