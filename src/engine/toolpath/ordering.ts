import type { ToolpathMove } from './contour';

/**
 * Orders multiple operations for efficient cutting.
 * Currently concatenates in order; could implement nearest-neighbor later.
 */
export function orderOperations(
  operations: ToolpathMove[][],
): ToolpathMove[] {
  return operations.flat();
}
