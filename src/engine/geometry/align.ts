import type { BoundingBox } from './types';

export type AlignMode = 'left' | 'right' | 'top' | 'bottom' | 'centerH' | 'centerV';
export type DistributeMode = 'horizontal' | 'vertical';

export interface AlignTarget {
  id: string;
  bounds: BoundingBox;
}

export function computeAlignDeltas(
  targets: AlignTarget[],
  mode: AlignMode,
  reference?: BoundingBox, // optional reference bounds (e.g., stock)
): Map<string, { dx: number; dy: number }> {
  const result = new Map<string, { dx: number; dy: number }>();
  if (targets.length < 2 && !reference) return result;

  // Compute combined bounds or use reference
  let refBounds: BoundingBox;
  if (reference) {
    refBounds = reference;
  } else {
    refBounds = {
      minX: Math.min(...targets.map((t) => t.bounds.minX)),
      minY: Math.min(...targets.map((t) => t.bounds.minY)),
      maxX: Math.max(...targets.map((t) => t.bounds.maxX)),
      maxY: Math.max(...targets.map((t) => t.bounds.maxY)),
    };
  }

  for (const t of targets) {
    let dx = 0;
    let dy = 0;

    switch (mode) {
      case 'left':
        dx = refBounds.minX - t.bounds.minX;
        break;
      case 'right':
        dx = refBounds.maxX - t.bounds.maxX;
        break;
      case 'top':
        dy = refBounds.maxY - t.bounds.maxY;
        break;
      case 'bottom':
        dy = refBounds.minY - t.bounds.minY;
        break;
      case 'centerH': {
        const refCx = (refBounds.minX + refBounds.maxX) / 2;
        const tCx = (t.bounds.minX + t.bounds.maxX) / 2;
        dx = refCx - tCx;
        break;
      }
      case 'centerV': {
        const refCy = (refBounds.minY + refBounds.maxY) / 2;
        const tCy = (t.bounds.minY + t.bounds.maxY) / 2;
        dy = refCy - tCy;
        break;
      }
    }

    result.set(t.id, { dx, dy });
  }

  return result;
}

export function computeDistributeDeltas(
  targets: AlignTarget[],
  mode: DistributeMode,
): Map<string, { dx: number; dy: number }> {
  const result = new Map<string, { dx: number; dy: number }>();
  if (targets.length < 3) return result;

  const sorted = [...targets].sort((a, b) => {
    if (mode === 'horizontal') {
      return (a.bounds.minX + a.bounds.maxX) / 2 - (b.bounds.minX + b.bounds.maxX) / 2;
    }
    return (a.bounds.minY + a.bounds.maxY) / 2 - (b.bounds.minY + b.bounds.maxY) / 2;
  });

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (mode === 'horizontal') {
    const firstCenter = (first.bounds.minX + first.bounds.maxX) / 2;
    const lastCenter = (last.bounds.minX + last.bounds.maxX) / 2;
    const spacing = (lastCenter - firstCenter) / (sorted.length - 1);

    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      const currentCenter = (t.bounds.minX + t.bounds.maxX) / 2;
      const targetCenter = firstCenter + spacing * i;
      result.set(t.id, { dx: targetCenter - currentCenter, dy: 0 });
    }
  } else {
    const firstCenter = (first.bounds.minY + first.bounds.maxY) / 2;
    const lastCenter = (last.bounds.minY + last.bounds.maxY) / 2;
    const spacing = (lastCenter - firstCenter) / (sorted.length - 1);

    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      const currentCenter = (t.bounds.minY + t.bounds.maxY) / 2;
      const targetCenter = firstCenter + spacing * i;
      result.set(t.id, { dx: 0, dy: targetCenter - currentCenter });
    }
  }

  return result;
}
