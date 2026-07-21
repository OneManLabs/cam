import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useUIStore';

interface Props {
  scene: THREE.Scene;
}

export function ToolpathRenderer({ scene }: Props) {
  const groupRef = useRef(new THREE.Group());
  const toolpaths = useProjectStore((s) => s.toolpaths);
  const showToolpaths = useUIStore((s) => s.showToolpaths);
  const activeOperationId = useUIStore((s) => s.activeOperationId);

  useEffect(() => {
    const toolpathGroup = groupRef.current;
    scene.add(toolpathGroup);
    return () => { scene.remove(toolpathGroup); };
  }, [scene]);

  useEffect(() => {
    const group = groupRef.current;
    while (group.children.length) group.remove(group.children[0]);
    if (!showToolpaths) return;

    for (const tp of toolpaths) {
      if (activeOperationId && tp.operationId !== activeOperationId) continue;

      const rapids: THREE.Vector3[] = [];
      const cuts: THREE.Vector3[] = [];
      const plunges: THREE.Vector3[] = [];

      let prevPos = new THREE.Vector3(0, 0, 0);

      for (const move of tp.moves) {
        const pos = new THREE.Vector3(move.x, move.y, move.z);
        if (move.type === 'rapid') {
          rapids.push(prevPos.clone(), pos.clone());
        } else if (move.z < prevPos.z) {
          plunges.push(prevPos.clone(), pos.clone());
        } else {
          cuts.push(prevPos.clone(), pos.clone());
        }
        prevPos = pos;
      }

      if (rapids.length) {
        const geom = new THREE.BufferGeometry().setFromPoints(rapids);
        const mat = new THREE.LineDashedMaterial({ color: 0xff4444, dashSize: 3, gapSize: 2 });
        const line = new THREE.LineSegments(geom, mat);
        line.computeLineDistances();
        group.add(line);
      }
      if (cuts.length) {
        const geom = new THREE.BufferGeometry().setFromPoints(cuts);
        const mat = new THREE.LineBasicMaterial({ color: 0x44ff44 });
        group.add(new THREE.LineSegments(geom, mat));
      }
      if (plunges.length) {
        const geom = new THREE.BufferGeometry().setFromPoints(plunges);
        const mat = new THREE.LineBasicMaterial({ color: 0xffff44 });
        group.add(new THREE.LineSegments(geom, mat));
      }
    }
  }, [toolpaths, showToolpaths, activeOperationId]);

  return null;
}
