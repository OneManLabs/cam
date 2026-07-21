// Web Worker for simulation heightmap + mesh computation
// All heavy number crunching happens here, off the main thread.

export interface SimWorkerInput {
  stockMinX: number;
  stockMinY: number;
  width: number;
  height: number;
  thickness: number;
  resX: number;  // heightmap resolution (high, for carving accuracy)
  resY: number;
  meshResX: number; // mesh resolution (lower, for rendering performance)
  meshResY: number;
  moves: Float64Array; // packed: [type, x, y, z, toolRadius] × N (type: 0=rapid, 1=linear)
  moveCount: number;
  progress: number;
  surfColor: [number, number, number];
  cutColor: [number, number, number];
  wallThreshold: number;
}

export interface SimWorkerOutput {
  // Top surface
  topPositions: Float32Array;
  topColors: Float32Array;
  topIndices: Uint32Array;
  topNormals: Float32Array;
  // Internal walls
  wallPositions: Float32Array;
  wallNormals: Float32Array;
  wallColors: Float32Array;
  wallIndices: Uint32Array;
  // Bottom face
  botPositions: Float32Array;
  botIndices: Uint32Array;
  // Side walls (4 sides)
  sidePositions: Float32Array[];
  sideIndices: Uint32Array[];
}

self.onmessage = (e: MessageEvent<SimWorkerInput>) => {
  const {
    stockMinX, stockMinY, width, height, thickness,
    resX, resY, meshResX, meshResY, moves, moveCount, progress,
    surfColor, cutColor, wallThreshold,
  } = e.data;

  const stockMaxX = stockMinX + width;
  const stockMaxY = stockMinY + height;

  // --- Heightmap ---
  const heightmap = new Float32Array(resX * resY);
  heightmap.fill(thickness);

  const maxMove = Math.floor(moveCount * progress);

  // Pre-compute pixel scale factors
  const scaleX = resX / width;
  const scaleY = resY / height;
  const invScaleX = width / resX;
  const invScaleY = height / resY;

  // Carving with inlined math (no function calls in hot loop)
  let prevX = 0, prevY = 0, prevZ = 0;
  const stepBase = Math.max(invScaleX, invScaleY) * 0.5; // half pixel step

  for (let m = 0; m < maxMove; m++) {
    const base = m * 5;
    const mtype = moves[base];     // 0=rapid, 1=linear
    const mx = moves[base + 1];
    const my = moves[base + 2];
    const mz = moves[base + 3];
    const toolRadius = moves[base + 4];

    if (mtype === 0) { // rapid
      prevX = mx; prevY = my; prevZ = mz;
      continue;
    }

    const dx = mx - prevX;
    const dy = my - prevY;
    const dz = mz - prevZ;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.ceil(dist / stepBase));
    const invSteps = 1 / steps;

    const pixRX = toolRadius * scaleX;
    const pixRY = toolRadius * scaleY;
    const pixRX2 = pixRX * pixRX;
    const pixRY2 = pixRY * pixRY;

    for (let s = 0; s <= steps; s++) {
      const t = s * invSteps;
      const wx = prevX + dx * t;
      const wy = prevY + dy * t;
      const wz = prevZ + dz * t;

      const cutDepth = -wz;
      if (cutDepth <= 0) continue;
      const remaining = thickness - cutDepth;
      const rem = remaining > 0 ? remaining : 0;

      const pixCX = (wx - stockMinX) * scaleX;
      const pixCY = (wy - stockMinY) * scaleY;

      const minPX = Math.max(0, (pixCX - pixRX) | 0);
      const maxPX = Math.min(resX - 1, Math.ceil(pixCX + pixRX));
      const minPY = Math.max(0, (pixCY - pixRY) | 0);
      const maxPY = Math.min(resY - 1, Math.ceil(pixCY + pixRY));

      for (let py = minPY; py <= maxPY; py++) {
        const ndy = (py - pixCY);
        const ndy2Norm = (ndy * ndy) / pixRY2;
        const rowBase = py * resX;

        for (let px = minPX; px <= maxPX; px++) {
          const ndx = (px - pixCX);
          if ((ndx * ndx) / pixRX2 + ndy2Norm <= 1) {
            const idx = rowBase + px;
            if (rem < heightmap[idx]) {
              heightmap[idx] = rem;
            }
          }
        }
      }
    }
    prevX = mx; prevY = my; prevZ = mz;
  }

  // --- Downsample heightmap to mesh resolution ---
  const mResX = meshResX;
  const mResY = meshResY;
  const meshHeightmap = new Float32Array(mResX * mResY);
  for (let my = 0; my < mResY; my++) {
    for (let mx = 0; mx < mResX; mx++) {
      // Map mesh pixel to heightmap pixel (nearest sample — take minimum for conservative cuts)
      const hx = Math.min(resX - 1, Math.round(mx * (resX - 1) / (mResX - 1)));
      const hy = Math.min(resY - 1, Math.round(my * (resY - 1) / (mResY - 1)));
      meshHeightmap[my * mResX + mx] = heightmap[hy * resX + hx];
    }
  }

  // --- Build top surface (from mesh-resolution heightmap) ---
  const vx = mResX + 1;
  const vy = mResY + 1;
  const cellW = width / mResX;
  const cellH = height / mResY;
  const totalVerts = vx * vy;

  const topPositions = new Float32Array(totalVerts * 3);
  const topColors = new Float32Array(totalVerts * 3);

  const sr = surfColor[0], sg = surfColor[1], sb = surfColor[2];
  const cr = cutColor[0], cg = cutColor[1], cb = cutColor[2];
  const invThickness = 1 / thickness;

  for (let iy = 0; iy < vy; iy++) {
    for (let ix = 0; ix < vx; ix++) {
      const vi = iy * vx + ix;
      const vi3 = vi * 3;

      const px = Math.min(mResX - 1, Math.max(0, Math.round(ix * mResX / vx - 0.5)));
      const py = Math.min(mResY - 1, Math.max(0, Math.round(iy * mResY / vy - 0.5)));
      const h = meshHeightmap[py * mResX + px];

      topPositions[vi3] = stockMinX + ix * cellW;
      topPositions[vi3 + 1] = stockMinY + iy * cellH;
      topPositions[vi3 + 2] = h;

      // Color lerp
      const t = h * invThickness;
      const mt = 1 - t;
      topColors[vi3] = sr * t + cr * mt;
      topColors[vi3 + 1] = sg * t + cg * mt;
      topColors[vi3 + 2] = sb * t + cb * mt;
    }
  }

  // Top indices
  const topIdxCount = mResX * mResY * 6;
  const topIndices = new Uint32Array(topIdxCount);
  let ti = 0;
  for (let iy = 0; iy < mResY; iy++) {
    for (let ix = 0; ix < mResX; ix++) {
      const a = iy * vx + ix;
      const b = a + 1;
      const c = a + vx;
      const d = c + 1;
      topIndices[ti++] = a; topIndices[ti++] = b; topIndices[ti++] = d;
      topIndices[ti++] = a; topIndices[ti++] = d; topIndices[ti++] = c;
    }
  }

  // Compute vertex normals for top surface
  const topNormals = new Float32Array(totalVerts * 3);
  for (let i = 0; i < topIdxCount; i += 3) {
    const ia = topIndices[i], ib = topIndices[i + 1], ic = topIndices[i + 2];
    const ax = topPositions[ia * 3], ay = topPositions[ia * 3 + 1], az = topPositions[ia * 3 + 2];
    const bx = topPositions[ib * 3] - ax, by = topPositions[ib * 3 + 1] - ay, bz = topPositions[ib * 3 + 2] - az;
    const cx = topPositions[ic * 3] - ax, cy = topPositions[ic * 3 + 1] - ay, cz = topPositions[ic * 3 + 2] - az;
    const nx = by * cz - bz * cy;
    const ny = bz * cx - bx * cz;
    const nz = bx * cy - by * cx;
    topNormals[ia * 3] += nx; topNormals[ia * 3 + 1] += ny; topNormals[ia * 3 + 2] += nz;
    topNormals[ib * 3] += nx; topNormals[ib * 3 + 1] += ny; topNormals[ib * 3 + 2] += nz;
    topNormals[ic * 3] += nx; topNormals[ic * 3 + 1] += ny; topNormals[ic * 3 + 2] += nz;
  }
  for (let i = 0; i < totalVerts; i++) {
    const i3 = i * 3;
    const nx = topNormals[i3], ny = topNormals[i3 + 1], nz = topNormals[i3 + 2];
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    topNormals[i3] = nx / len; topNormals[i3 + 1] = ny / len; topNormals[i3 + 2] = nz / len;
  }

  // --- Internal cut walls (using mesh-resolution heightmap) ---
  const wallStride = Math.max(1, Math.round(Math.max(mResX, mResY) / 512));
  const wPositions: number[] = [];
  const wNormals: number[] = [];
  const wColors: number[] = [];
  const wIndices: number[] = [];
  const wcr = cr, wcg = cg, wcb = cb;

  for (let iy = 0; iy < mResY; iy += wallStride) {
    for (let ix = 0; ix < mResX; ix += wallStride) {
      const h = meshHeightmap[iy * mResX + ix];

      // Right neighbor
      const rix = Math.min(ix + wallStride, mResX - 1);
      const hRight = meshHeightmap[iy * mResX + rix];
      const diffR = Math.abs(h - hRight);
      if (diffR > wallThreshold) {
        const vi = wPositions.length / 3;
        const wx = stockMinX + rix * cellW;
        const wy0 = stockMinY + iy * cellH;
        const wy1 = stockMinY + Math.min(iy + wallStride, mResY) * cellH;
        const zH = h > hRight ? h : hRight;
        const zL = h < hRight ? h : hRight;
        const nx = h > hRight ? 1 : -1;
        wPositions.push(wx, wy0, zH, wx, wy0, zL, wx, wy1, zH, wx, wy1, zL);
        for (let k = 0; k < 4; k++) { wNormals.push(nx, 0, 0); wColors.push(wcr, wcg, wcb); }
        wIndices.push(vi, vi + 2, vi + 3, vi, vi + 3, vi + 1);
      }

      // Upper neighbor
      const uiy = Math.min(iy + wallStride, mResY - 1);
      const hUp = meshHeightmap[uiy * mResX + ix];
      const diffU = Math.abs(h - hUp);
      if (diffU > wallThreshold) {
        const vi = wPositions.length / 3;
        const wy = stockMinY + uiy * cellH;
        const wx0 = stockMinX + ix * cellW;
        const wx1 = stockMinX + Math.min(ix + wallStride, mResX) * cellW;
        const zH = h > hUp ? h : hUp;
        const zL = h < hUp ? h : hUp;
        const ny = h > hUp ? 1 : -1;
        wPositions.push(wx0, wy, zH, wx0, wy, zL, wx1, wy, zH, wx1, wy, zL);
        for (let k = 0; k < 4; k++) { wNormals.push(0, ny, 0); wColors.push(wcr, wcg, wcb); }
        wIndices.push(vi, vi + 2, vi + 3, vi, vi + 3, vi + 1);
      }
    }
  }

  const wallPositions = new Float32Array(wPositions);
  const wallNormals = new Float32Array(wNormals);
  const wallColors = new Float32Array(wColors);
  const wallIndices = new Uint32Array(wIndices);

  // --- Bottom face ---
  const botPositions = new Float32Array(totalVerts * 3);
  for (let iy = 0; iy < vy; iy++) {
    for (let ix = 0; ix < vx; ix++) {
      const vi3 = (iy * vx + ix) * 3;
      botPositions[vi3] = stockMinX + ix * cellW;
      botPositions[vi3 + 1] = stockMinY + iy * cellH;
      botPositions[vi3 + 2] = 0;
    }
  }

  const bIndices: number[] = [];
  for (let iy = 0; iy < mResY; iy++) {
    for (let ix = 0; ix < mResX; ix++) {
      const h00 = meshHeightmap[iy * mResX + ix];
      const h10 = meshHeightmap[iy * mResX + Math.min(ix + 1, mResX - 1)];
      const h01 = meshHeightmap[Math.min(iy + 1, mResY - 1) * mResX + ix];
      const h11 = meshHeightmap[Math.min(iy + 1, mResY - 1) * mResX + Math.min(ix + 1, mResX - 1)];
      if (h00 <= 0.01 || h10 <= 0.01 || h01 <= 0.01 || h11 <= 0.01) continue;
      const a = iy * vx + ix;
      const b = a + 1;
      const c = a + vx;
      const d = c + 1;
      bIndices.push(a, d, b, a, c, d);
    }
  }
  const botIndices = new Uint32Array(bIndices);

  // --- Side walls ---
  function buildSideArrays(
    getWorldPos: (i: number) => [number, number],
    getHeight: (i: number) => number,
    count: number,
    flipNormal: boolean,
  ): { positions: Float32Array; indices: Uint32Array } {
    const pos = new Float32Array(count * 6); // 2 verts per step, 3 floats each
    const idx: number[] = [];

    for (let i = 0; i < count; i++) {
      const [wx, wy] = getWorldPos(i);
      const h = getHeight(i);
      pos[i * 6] = wx; pos[i * 6 + 1] = wy; pos[i * 6 + 2] = h;
      pos[i * 6 + 3] = wx; pos[i * 6 + 4] = wy; pos[i * 6 + 5] = 0;
    }

    for (let i = 0; i < count - 1; i++) {
      const t0 = i * 2, b0 = t0 + 1, t1 = (i + 1) * 2, b1 = t1 + 1;
      if (flipNormal) {
        idx.push(t0, t1, b1, t0, b1, b0);
      } else {
        idx.push(t0, b1, t1, t0, b0, b1);
      }
    }
    return { positions: pos, indices: new Uint32Array(idx) };
  }

  const sides: { positions: Float32Array; indices: Uint32Array }[] = [
    buildSideArrays(
      (i) => [stockMinX + (i / mResX) * width, stockMinY],
      (i) => meshHeightmap[0 * mResX + Math.min(i, mResX - 1)],
      mResX + 1, true
    ),
    buildSideArrays(
      (i) => [stockMinX + (i / mResX) * width, stockMaxY],
      (i) => meshHeightmap[(mResY - 1) * mResX + Math.min(i, mResX - 1)],
      mResX + 1, false
    ),
    buildSideArrays(
      (i) => [stockMinX, stockMinY + (i / mResY) * height],
      (i) => meshHeightmap[Math.min(i, mResY - 1) * mResX + 0],
      mResY + 1, false
    ),
    buildSideArrays(
      (i) => [stockMaxX, stockMinY + (i / mResY) * height],
      (i) => meshHeightmap[Math.min(i, mResY - 1) * mResX + (mResX - 1)],
      mResX + 1, true
    ),
  ];

  const sidePositions = sides.map((s) => s.positions);
  const sideIndices = sides.map((s) => s.indices);

  // Collect all transferable buffers
  const transferables: ArrayBuffer[] = [
    topPositions.buffer as ArrayBuffer,
    topColors.buffer as ArrayBuffer,
    topIndices.buffer as ArrayBuffer,
    topNormals.buffer as ArrayBuffer,
    wallPositions.buffer as ArrayBuffer,
    wallNormals.buffer as ArrayBuffer,
    wallColors.buffer as ArrayBuffer,
    wallIndices.buffer as ArrayBuffer,
    botPositions.buffer as ArrayBuffer,
    botIndices.buffer as ArrayBuffer,
    ...sidePositions.map((p) => p.buffer as ArrayBuffer),
    ...sideIndices.map((i) => i.buffer as ArrayBuffer),
  ];

  const result: SimWorkerOutput = {
    topPositions, topColors, topIndices, topNormals,
    wallPositions, wallNormals, wallColors, wallIndices,
    botPositions, botIndices,
    sidePositions, sideIndices,
  };

  (self as unknown as Worker).postMessage(result, transferables);
};
