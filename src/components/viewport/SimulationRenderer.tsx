import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useUIStore';
import { useToolStore } from '../../store/useToolStore';
import { useMachineStore, type MaterialId } from '../../store/useMachineStore';

const MATERIAL_DEFS: Record<MaterialId, {
  color: number;
  cutColor: number;
  roughness: number;
  metalness: number;
}> = {
  aluminum:    { color: 0xc8cdd8, cutColor: 0xb0b8c8, roughness: 0.25, metalness: 0.9  },
  softwood:    { color: 0xd4b882, cutColor: 0xb89060, roughness: 0.85, metalness: 0.0  },
  hardwood:    { color: 0x8c5a38, cutColor: 0x6e3e20, roughness: 0.7,  metalness: 0.0  },
  mdf_plywood: { color: 0xc4a878, cutColor: 0xa08050, roughness: 0.9,  metalness: 0.0  },
  acrylic:     { color: 0xd8e0ea, cutColor: 0xa0b0c0, roughness: 0.15, metalness: 0.1  },
  hdpe:        { color: 0xe0e4e0, cutColor: 0xc0c4c0, roughness: 0.5,  metalness: 0.0  },
  brass:       { color: 0xd4b060, cutColor: 0xb89030, roughness: 0.3,  metalness: 0.85 },
};

interface Props {
  scene: THREE.Scene;
}

export function SimulationRenderer({ scene }: Props) {
  const groupRef = useRef(new THREE.Group());
  const lightsRef = useRef(new THREE.Group());
  const toolMeshRef = useRef<THREE.Group | null>(null);

  const stock = useProjectStore((s) => s.stock);
  const toolpaths = useProjectStore((s) => s.toolpaths);
  const operations = useProjectStore((s) => s.operations);
  const showSimulation = useUIStore((s) => s.showSimulation);
  const simulationProgress = useUIStore((s) => s.simulationProgress);
  const tools = useToolStore((s) => s.tools);
  const selectedMaterial = useMachineStore((s) => s.selectedMaterial);

  useEffect(() => {
    const simulationGroup = groupRef.current;
    const lightsGroup = lightsRef.current;
    scene.add(simulationGroup);
    scene.add(lightsGroup);
    return () => {
      scene.remove(simulationGroup);
      scene.remove(lightsGroup);
    };
  }, [scene]);

  useEffect(() => {
    const group = groupRef.current;
    const lights = lightsRef.current;

    while (group.children.length) {
      const child = group.children[0];
      group.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const mat = child.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    }
    while (lights.children.length) {
      lights.remove(lights.children[0]);
    }

    if (!showSimulation || toolpaths.length === 0) return;

    const { width, height, thickness, originX, originY } = stock;
    if (width <= 0 || height <= 0 || thickness <= 0) return;

    const stockMinX = originX;
    const stockMinY = originY;
    const stockMaxX = originX + width;
    const stockMaxY = originY + height;

    // --- Lighting ---
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    lights.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(stockMinX - width * 0.5, stockMinY - height * 0.5, thickness * 5);
    keyLight.target.position.set(stockMinX + width / 2, stockMinY + height / 2, 0);
    lights.add(keyLight);
    lights.add(keyLight.target);

    const fillLight = new THREE.DirectionalLight(0xc0d0ff, 0.3);
    fillLight.position.set(stockMaxX + width * 0.5, stockMaxY + height * 0.5, thickness * 3);
    lights.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xfff0e0, 0.2);
    rimLight.position.set(stockMinX + width / 2, stockMaxY + height, thickness * 2);
    lights.add(rimLight);

    // Back side lighting (below stock, mirrored)
    const backKey = new THREE.DirectionalLight(0xffffff, 0.6);
    backKey.position.set(stockMaxX + width * 0.5, stockMaxY + height * 0.5, -thickness * 5);
    backKey.target.position.set(stockMinX + width / 2, stockMinY + height / 2, 0);
    lights.add(backKey);
    lights.add(backKey.target);

    const backFill = new THREE.DirectionalLight(0xc0d0ff, 0.3);
    backFill.position.set(stockMinX - width * 0.5, stockMinY - height * 0.5, -thickness * 3);
    lights.add(backFill);

    // --- Heightmap computation ---
    const resX = Math.min(512, Math.max(32, Math.round(width * 4)));
    const resY = Math.min(512, Math.max(32, Math.round(height * 4)));

    const heightmap = new Float32Array(resX * resY);
    heightmap.fill(thickness);

    const allMoves: Array<{
      type: 'rapid' | 'linear' | 'arc';
      x: number; y: number; z: number;
      toolRadius: number;
    }> = [];

    for (const tp of toolpaths) {
      const op = operations.find((o) => o.id === tp.operationId);
      if (!op || !op.enabled) continue;
      const tool = tools.find((t) => t.id === op.toolId);
      const toolRadius = tool ? tool.diameter / 2 : 3;
      for (const move of tp.moves) {
        allMoves.push({ type: move.type, x: move.x, y: move.y, z: move.z, toolRadius });
      }
    }

    const maxMove = Math.floor(allMoves.length * simulationProgress);

    function worldToPixX(wx: number): number {
      return ((wx - stockMinX) / (stockMaxX - stockMinX)) * resX;
    }
    function worldToPixY(wy: number): number {
      return ((wy - stockMinY) / (stockMaxY - stockMinY)) * resY;
    }

    function carveAt(worldX: number, worldY: number, worldZ: number, toolRadius: number) {
      const cutDepth = -worldZ;
      if (cutDepth <= 0) return;
      const remaining = Math.max(0, thickness - cutDepth);

      const pixCX = worldToPixX(worldX);
      const pixCY = worldToPixY(worldY);
      const pixRX = (toolRadius / (stockMaxX - stockMinX)) * resX;
      const pixRY = (toolRadius / (stockMaxY - stockMinY)) * resY;

      const minPX = Math.max(0, Math.floor(pixCX - pixRX));
      const maxPX = Math.min(resX - 1, Math.ceil(pixCX + pixRX));
      const minPY = Math.max(0, Math.floor(pixCY - pixRY));
      const maxPY = Math.min(resY - 1, Math.ceil(pixCY + pixRY));

      for (let py = minPY; py <= maxPY; py++) {
        for (let px = minPX; px <= maxPX; px++) {
          const ndx = (px - pixCX) / pixRX;
          const ndy = (py - pixCY) / pixRY;
          if (ndx * ndx + ndy * ndy <= 1) {
            const idx = py * resX + px;
            if (remaining < heightmap[idx]) {
              heightmap[idx] = remaining;
            }
          }
        }
      }
    }

    let prevX = 0, prevY = 0, prevZ = 0;
    for (let m = 0; m < maxMove; m++) {
      const move = allMoves[m];
      if (move.type === 'rapid') {
        prevX = move.x; prevY = move.y; prevZ = move.z;
        continue;
      }
      const dx = move.x - prevX;
      const dy = move.y - prevY;
      const dz = move.z - prevZ;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.max(1, Math.ceil(dist / 0.25));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        carveAt(prevX + dx * t, prevY + dy * t, prevZ + dz * t, move.toolRadius);
      }
      prevX = move.x; prevY = move.y; prevZ = move.z;
    }

    // --- Build 3D mesh from heightmap ---
    const matDef = MATERIAL_DEFS[selectedMaterial] ?? MATERIAL_DEFS.softwood;

    const vx = resX + 1;
    const vy = resY + 1;
    const cellW = width / resX;
    const cellH = height / resY;

    const topPositions = new Float32Array(vx * vy * 3);
    const topColors = new Float32Array(vx * vy * 3);

    const surfColor = new THREE.Color(matDef.color);
    const cutColor = new THREE.Color(matDef.cutColor);

    for (let iy = 0; iy < vy; iy++) {
      for (let ix = 0; ix < vx; ix++) {
        const vi = iy * vx + ix;
        const wx = stockMinX + ix * cellW;
        const wy = stockMinY + iy * cellH;

        const px = Math.min(resX - 1, Math.max(0, Math.round(ix * resX / vx - 0.5)));
        const py = Math.min(resY - 1, Math.max(0, Math.round(iy * resY / vy - 0.5)));
        const h = heightmap[py * resX + px];

        topPositions[vi * 3] = wx;
        topPositions[vi * 3 + 1] = wy;
        topPositions[vi * 3 + 2] = h;

        const t = h / thickness;
        const c = surfColor.clone().lerp(cutColor, 1 - t);
        topColors[vi * 3] = c.r;
        topColors[vi * 3 + 1] = c.g;
        topColors[vi * 3 + 2] = c.b;
      }
    }

    const topIndices: number[] = [];
    for (let iy = 0; iy < resY; iy++) {
      for (let ix = 0; ix < resX; ix++) {
        // Skip quads where all corners are cut through — leaves a hole you can see through
        const h00 = heightmap[iy * resX + ix];
        const h10 = heightmap[iy * resX + Math.min(ix + 1, resX - 1)];
        const h01 = heightmap[Math.min(iy + 1, resY - 1) * resX + ix];
        const h11 = heightmap[Math.min(iy + 1, resY - 1) * resX + Math.min(ix + 1, resX - 1)];
        if (h00 <= 0.01 && h10 <= 0.01 && h01 <= 0.01 && h11 <= 0.01) continue;

        const a = iy * vx + ix;
        const b = a + 1;
        const c = a + vx;
        const d = c + 1;
        topIndices.push(a, b, d);
        topIndices.push(a, d, c);
      }
    }

    const topGeom = new THREE.BufferGeometry();
    topGeom.setAttribute('position', new THREE.BufferAttribute(topPositions, 3));
    topGeom.setAttribute('color', new THREE.BufferAttribute(topColors, 3));
    topGeom.setIndex(topIndices);
    topGeom.computeVertexNormals();

    const topMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: matDef.roughness,
      metalness: matDef.metalness,
      side: THREE.FrontSide,
      flatShading: false,
    });

    group.add(new THREE.Mesh(topGeom, topMat));

    // --- Bottom face ---
    {
      const botPositions: number[] = [];
      const botIndices: number[] = [];

      for (let iy = 0; iy < vy; iy++) {
        for (let ix = 0; ix < vx; ix++) {
          const wx = stockMinX + ix * cellW;
          const wy = stockMinY + iy * cellH;
          botPositions.push(wx, wy, 0);
        }
      }

      for (let iy = 0; iy < resY; iy++) {
        for (let ix = 0; ix < resX; ix++) {
          const h00 = heightmap[iy * resX + ix];
          const h10 = heightmap[iy * resX + Math.min(ix + 1, resX - 1)];
          const h01 = heightmap[Math.min(iy + 1, resY - 1) * resX + ix];
          const h11 = heightmap[Math.min(iy + 1, resY - 1) * resX + Math.min(ix + 1, resX - 1)];

          if (h00 <= 0.01 || h10 <= 0.01 || h01 <= 0.01 || h11 <= 0.01) continue;

          const a = iy * vx + ix;
          const b = a + 1;
          const c = a + vx;
          const d = c + 1;
          botIndices.push(a, d, b);
          botIndices.push(a, c, d);
        }
      }

      if (botIndices.length > 0) {
        const botGeom = new THREE.BufferGeometry();
        botGeom.setAttribute('position', new THREE.Float32BufferAttribute(botPositions, 3));
        botGeom.setIndex(botIndices);
        botGeom.computeVertexNormals();
        const bottomMat = new THREE.MeshStandardMaterial({
          color: matDef.color,
          roughness: matDef.roughness,
          metalness: matDef.metalness,
          side: THREE.FrontSide,
        });
        group.add(new THREE.Mesh(botGeom, bottomMat));
      }
    }

    // --- Side walls ---
    const sideMat = new THREE.MeshStandardMaterial({
      color: matDef.color,
      roughness: matDef.roughness,
      metalness: matDef.metalness,
      side: THREE.DoubleSide,
    });

    function buildSideWall(
      getWorldPos: (i: number) => [number, number],
      getHeight: (i: number) => number,
      count: number,
      flipNormal: boolean
    ) {
      const positions: number[] = [];
      const indices: number[] = [];

      for (let i = 0; i < count; i++) {
        const [wx, wy] = getWorldPos(i);
        const h = getHeight(i);
        positions.push(wx, wy, h);
        positions.push(wx, wy, 0);
      }

      for (let i = 0; i < count - 1; i++) {
        const t0 = i * 2;
        const b0 = t0 + 1;
        const t1 = (i + 1) * 2;
        const b1 = t1 + 1;
        if (flipNormal) {
          indices.push(t0, t1, b1);
          indices.push(t0, b1, b0);
        } else {
          indices.push(t0, b1, t1);
          indices.push(t0, b0, b1);
        }
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setIndex(indices);
      geom.computeVertexNormals();
      return new THREE.Mesh(geom, sideMat);
    }

    group.add(buildSideWall(
      (i) => [stockMinX + (i / resX) * width, stockMinY],
      (i) => heightmap[0 * resX + Math.min(i, resX - 1)],
      resX + 1, true
    ));
    group.add(buildSideWall(
      (i) => [stockMinX + (i / resX) * width, stockMaxY],
      (i) => heightmap[(resY - 1) * resX + Math.min(i, resX - 1)],
      resX + 1, false
    ));
    group.add(buildSideWall(
      (i) => [stockMinX, stockMinY + (i / resY) * height],
      (i) => heightmap[Math.min(i, resY - 1) * resX + 0],
      resY + 1, false
    ));
    group.add(buildSideWall(
      (i) => [stockMaxX, stockMinY + (i / resY) * height],
      (i) => heightmap[Math.min(i, resY - 1) * resX + (resX - 1)],
      resY + 1, true
    ));

  }, [showSimulation, toolpaths, operations, tools, stock, simulationProgress, selectedMaterial, scene]);

  // --- 3D Tool visualization ---
  useEffect(() => {
    // Clean up previous tool
    if (toolMeshRef.current) {
      scene.remove(toolMeshRef.current);
      toolMeshRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const mat = child.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else (mat as THREE.Material).dispose();
        }
      });
      toolMeshRef.current = null;
    }

    if (!showSimulation || toolpaths.length === 0) return;

    // Build flat move list with tool info
    const allMoves: Array<{ x: number; y: number; z: number; toolRadius: number; toolType: string }> = [];
    for (const tp of toolpaths) {
      const op = operations.find((o) => o.id === tp.operationId);
      if (!op || !op.enabled) continue;
      const tool = tools.find((t) => t.id === op.toolId);
      const toolRadius = tool ? tool.diameter / 2 : 1.5875;
      const toolType = tool ? tool.type : 'endmill';
      for (const move of tp.moves) {
        allMoves.push({ x: move.x, y: move.y, z: move.z, toolRadius, toolType });
      }
    }

    if (allMoves.length === 0) return;

    const moveIdx = Math.min(Math.floor(allMoves.length * simulationProgress), allMoves.length - 1);
    const currentMove = allMoves[moveIdx];
    const { thickness } = stock;

    // Tool dimensions
    const radius = currentMove.toolRadius;
    const shankRadius = radius * 0.8;
    const fluteLength = Math.max(thickness * 1.5, 15);
    const shankLength = fluteLength * 1.5;

    const toolGroup = new THREE.Group();

    // Flute (cutting portion) — cylinder from tool tip upward
    // CylinderGeometry is Y-up, position children along Y; parent rotation converts Y→Z
    const fluteGeom = new THREE.CylinderGeometry(radius, radius, fluteLength, 24);
    const fluteMat = new THREE.MeshStandardMaterial({
      color: 0xc0c0c0,
      roughness: 0.2,
      metalness: 0.9,
    });
    const fluteMesh = new THREE.Mesh(fluteGeom, fluteMat);
    fluteMesh.position.set(0, fluteLength / 2, 0);
    toolGroup.add(fluteMesh);

    // Shank (upper portion)
    const shankGeom = new THREE.CylinderGeometry(shankRadius, shankRadius, shankLength, 24);
    const shankMat = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.3,
      metalness: 0.8,
    });
    const shankMesh = new THREE.Mesh(shankGeom, shankMat);
    shankMesh.position.set(0, fluteLength + shankLength / 2, 0);
    toolGroup.add(shankMesh);

    // Rotate Y-up to Z-up (PI/2 around X maps local Y to world Z)
    toolGroup.rotation.x = Math.PI / 2;

    // Wrap in another group so we can position in world space
    const toolWrapper = new THREE.Group();
    toolWrapper.add(toolGroup);
    toolWrapper.position.set(currentMove.x, currentMove.y, currentMove.z);

    scene.add(toolWrapper);
    toolMeshRef.current = toolWrapper;

    return () => {
      if (toolMeshRef.current) {
        scene.remove(toolMeshRef.current);
        toolMeshRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            const mat = child.material;
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
            else (mat as THREE.Material).dispose();
          }
        });
        toolMeshRef.current = null;
      }
    };
  }, [showSimulation, toolpaths, operations, tools, stock, simulationProgress, scene]);

  return null;
}
