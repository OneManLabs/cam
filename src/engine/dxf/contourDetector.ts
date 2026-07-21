import { parseDxf } from './parseDxf';
import { parseSvg } from '../svg/parseSvg';
import { analyzeGeometry } from '../geometry/loops';
import { computeBounds, segmentToPoints } from '../geometry/utils';
import type { ParsedGeometry, Point2D, Segment, CircleEntity } from '../geometry/types';

function buildParsedGeometry(
  segments: Segment[],
  circles: CircleEntity[],
  closedPaths?: Segment[][],
): ParsedGeometry {
  const { loops, regions, openPaths } = analyzeGeometry(segments, circles, closedPaths);

  const allPoints: Point2D[] = [];
  for (const seg of segments) {
    allPoints.push(...segmentToPoints(seg));
  }
  if (closedPaths) {
    for (const path of closedPaths) {
      for (const seg of path) {
        allPoints.push(...segmentToPoints(seg));
      }
    }
  }
  for (const circle of circles) {
    allPoints.push(
      { x: circle.center.x - circle.radius, y: circle.center.y - circle.radius },
      { x: circle.center.x + circle.radius, y: circle.center.y + circle.radius },
    );
  }

  const bounds = computeBounds(allPoints);
  return { segments, circles, loops, regions, openPaths, bounds };
}

export function processDxf(dxfContent: string): ParsedGeometry {
  const { segments, circles } = parseDxf(dxfContent);
  return buildParsedGeometry(segments, circles);
}

export function processSvg(svgContent: string): ParsedGeometry {
  const { segments, circles, closedPaths } = parseSvg(svgContent);
  return buildParsedGeometry(segments, circles, closedPaths);
}

export function processFile(content: string, fileName: string): ParsedGeometry {
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext === 'svg') {
    return processSvg(content);
  }
  return processDxf(content);
}
