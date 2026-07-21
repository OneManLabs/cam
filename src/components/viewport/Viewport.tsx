import { useRef, useEffect, useState, useCallback } from 'react';
import { useThreeScene } from '../../hooks/useThreeScene';
import { GeometryRenderer } from './GeometryRenderer';
import { ToolpathRenderer } from './ToolpathRenderer';
import { SimulationRenderer } from './SimulationRenderer';
import { SelectionManager } from './SelectionManager';
import { ShapeCreationTool } from './ShapeCreationTool';
import { TransformGizmo } from './TransformGizmo';
import { DesignToolbar } from './DesignToolbar';
import { useGeometryStore } from '../../store/useGeometryStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useUIStore';

interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { sceneRef, cameraRef, rendererRef, fitToView, setMode3D } = useThreeScene(containerRef);
  const bounds = useGeometryStore((s) => s.bounds);
  const deleteSelected = useGeometryStore((s) => s.deleteSelected);
  const selectedIds = useGeometryStore((s) => s.selectedIds);
  const clearToolpaths = useProjectStore((s) => s.clearToolpaths);
  const showSimulation = useUIStore((s) => s.showSimulation);
  const stock = useProjectStore((s) => s.stock);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);

  useEffect(() => {
    if (bounds) fitToView(bounds);
  }, [bounds, fitToView]);

  const undo = useGeometryStore((s) => s.undo);
  const redo = useGeometryStore((s) => s.redo);

  // Keyboard: Delete/Backspace to delete, Cmd+Z undo, Cmd+Shift+Z redo
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // Undo/Redo (works even when focused on inputs)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        clearToolpaths();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (isInput) return;
        if (selectedIds.size > 0) {
          e.preventDefault();
          deleteSelected();
          clearToolpaths();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteSelected, selectedIds, clearToolpaths, undo, redo]);

  useEffect(() => {
    if (showSimulation && stock.width > 0 && stock.height > 0) {
      const cx = stock.originX + stock.width / 2;
      const cy = stock.originY + stock.height / 2;
      const cz = stock.thickness / 2;
      const size = Math.max(stock.width, stock.height);
      setMode3D(true, { x: cx, y: cy, z: cz }, size);
    } else {
      setMode3D(false);
    }
  }, [showSimulation, stock, setMode3D]);

  const handleMarquee = useCallback((rect: MarqueeRect | null) => {
    setMarquee(rect);
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      {sceneRef.current && (
        <>
          <GeometryRenderer scene={sceneRef.current} />
          <ToolpathRenderer scene={sceneRef.current} />
          <SimulationRenderer scene={sceneRef.current} />
          <SelectionManager
            renderer={rendererRef.current}
            camera={cameraRef.current}
            scene={sceneRef.current}
            onMarquee={handleMarquee}
          />
          <ShapeCreationTool
            scene={sceneRef.current}
            camera={cameraRef.current}
            renderer={rendererRef.current}
          />
          <TransformGizmo
            scene={sceneRef.current}
            camera={cameraRef.current}
            renderer={rendererRef.current}
          />
        </>
      )}
      <DesignToolbar />
      {marquee && (
        <div
          className="marquee-selection"
          style={{
            left: marquee.left,
            top: marquee.top,
            width: marquee.width,
            height: marquee.height,
          }}
        />
      )}
    </div>
  );
}
