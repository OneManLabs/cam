import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useUIStore';
import { useMachineStore, MATERIAL_PRESETS } from '../../store/useMachineStore';

export function SimulationPanel() {
  const toolpaths = useProjectStore((s) => s.toolpaths);
  const operations = useProjectStore((s) => s.operations);
  const stock = useProjectStore((s) => s.stock);
  const setShowSimulation = useUIStore((s) => s.setShowSimulation);
  const simulationProgress = useUIStore((s) => s.simulationProgress);
  const setSimulationProgress = useUIStore((s) => s.setSimulationProgress);
  const showToolpaths = useUIStore((s) => s.showToolpaths);
  const setShowToolpaths = useUIStore((s) => s.setShowToolpaths);
  const selectedMaterial = useMachineStore((s) => s.selectedMaterial);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const animRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const materialPreset = MATERIAL_PRESETS.find((m) => m.id === selectedMaterial);

  // Build move index for each operation boundary with per-op timing
  const { allMoves, opBoundaries, totalCutDistance, estimatedTime } = useMemo(() => {
    const moves: Array<{
      type: 'rapid' | 'linear' | 'arc';
      x: number; y: number; z: number;
      opId: string;
      feedRate?: number;
    }> = [];
    const boundaries: Array<{
      opId: string; startIdx: number; endIdx: number; name: string;
      cutDistance: number; time: number;
    }> = [];

    for (const tp of toolpaths) {
      const op = operations.find((o) => o.id === tp.operationId);
      if (!op || !op.enabled) continue;
      const startIdx = moves.length;
      for (const move of tp.moves) {
        moves.push({ type: move.type, x: move.x, y: move.y, z: move.z, opId: op.id, feedRate: move.feedRate });
      }
      boundaries.push({ opId: op.id, startIdx, endIdx: moves.length, name: op.name, cutDistance: 0, time: 0 });
    }

    // Calculate distances and times per-operation and total
    let totalCutDist = 0;
    let totalTime = 0;
    let px = 0, py = 0, pz = 0;
    let bIdx = 0;

    for (let i = 0; i < moves.length; i++) {
      // Advance boundary index
      while (bIdx < boundaries.length - 1 && i >= boundaries[bIdx].endIdx) bIdx++;

      const move = moves[i];
      const dx = move.x - px;
      const dy = move.y - py;
      const dz = move.z - pz;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (move.type !== 'rapid') {
        totalCutDist += dist;
        const feed = move.feedRate ?? 1000;
        const moveTime = dist / feed;
        totalTime += moveTime;
        if (boundaries[bIdx]) {
          boundaries[bIdx].cutDistance += dist;
          boundaries[bIdx].time += moveTime;
        }
      } else {
        const moveTime = dist / 5000;
        totalTime += moveTime;
        if (boundaries[bIdx]) {
          boundaries[bIdx].time += moveTime;
        }
      }
      px = move.x; py = move.y; pz = move.z;
    }

    return { allMoves: moves, opBoundaries: boundaries, totalCutDistance: totalCutDist, estimatedTime: totalTime };
  }, [toolpaths, operations]);

  const totalMoves = allMoves.length;
  const currentMoveIdx = Math.floor(totalMoves * simulationProgress);

  // Current operation at progress point
  const currentOp = useMemo(() => {
    for (const b of opBoundaries) {
      if (currentMoveIdx >= b.startIdx && currentMoveIdx < b.endIdx) {
        return b;
      }
    }
    return opBoundaries[opBoundaries.length - 1] ?? null;
  }, [currentMoveIdx, opBoundaries]);

  // Current position and depth
  const currentMove = allMoves[Math.min(currentMoveIdx, totalMoves - 1)];
  const currentZ = currentMove?.z ?? 0;
  // Min Z reached so far
  const minZReached = useMemo(() => {
    let minZ = 0;
    for (let i = 0; i < currentMoveIdx && i < allMoves.length; i++) {
      if (allMoves[i].z < minZ) minZ = allMoves[i].z;
    }
    return -minZ;
  }, [currentMoveIdx, allMoves]);

  // Animation loop
  const animate = useCallback((timestamp: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = timestamp;
    const dt = (timestamp - lastTimeRef.current) / 1000;
    lastTimeRef.current = timestamp;

    const increment = dt * 0.05 * playSpeed; // base: 5% per second
    const newProgress = Math.min(1, simulationProgress + increment);
    setSimulationProgress(newProgress);

    if (newProgress >= 1) {
      setIsPlaying(false);
      return;
    }
    animRef.current = requestAnimationFrame(animate);
  }, [playSpeed, simulationProgress, setSimulationProgress]);

  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = 0;
      animRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, animate]);

  const handlePlay = () => {
    if (simulationProgress >= 1) setSimulationProgress(0);
    setIsPlaying(true);
  };
  const handlePause = () => setIsPlaying(false);
  const handleReset = () => {
    setIsPlaying(false);
    setSimulationProgress(0);
  };
  const handleStepForward = () => {
    setIsPlaying(false);
    setSimulationProgress(Math.min(1, simulationProgress + 0.01));
  };
  const handleStepBack = () => {
    setIsPlaying(false);
    setSimulationProgress(Math.max(0, simulationProgress - 0.01));
  };

  const formatTime = (minutes: number): string => {
    if (minutes < 1) return `${Math.round(minutes * 60)}s`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  return (
    <div className="sim-panel">
      <div className="sim-header">
        <h3>Simulation</h3>
        <button
          className="btn-sm"
          onClick={() => setShowSimulation(false)}
          title="Exit simulation"
        >
          Exit
        </button>
      </div>

      {/* Transport Controls */}
      <div className="sim-section">
        <div className="sim-transport">
          <button className="sim-btn" onClick={handleReset} title="Reset">
            <span>|&lt;</span>
          </button>
          <button className="sim-btn" onClick={handleStepBack} title="Step back">
            <span>&lt;</span>
          </button>
          {isPlaying ? (
            <button className="sim-btn sim-btn-primary" onClick={handlePause} title="Pause">
              <span>||</span>
            </button>
          ) : (
            <button className="sim-btn sim-btn-primary" onClick={handlePlay} title="Play">
              <span>&#9654;</span>
            </button>
          )}
          <button className="sim-btn" onClick={handleStepForward} title="Step forward">
            <span>&gt;</span>
          </button>
          <button className="sim-btn" onClick={() => { setIsPlaying(false); setSimulationProgress(1); }} title="Go to end">
            <span>&gt;|</span>
          </button>
        </div>

        <div className="sim-slider-row">
          <input
            type="range"
            className="sim-slider-full"
            min="0"
            max="1"
            step="0.002"
            value={simulationProgress}
            onChange={(e) => {
              setIsPlaying(false);
              setSimulationProgress(parseFloat(e.target.value));
            }}
          />
        </div>

        <div className="sim-progress-label">
          {Math.round(simulationProgress * 100)}%
          <span className="sim-move-count">{currentMoveIdx.toLocaleString()} / {totalMoves.toLocaleString()} moves</span>
        </div>

        <div className="sim-speed">
          <label>Speed</label>
          <div className="sim-speed-btns">
            {[0.25, 0.5, 1, 2, 4].map((s) => (
              <button
                key={s}
                className={`sim-speed-btn ${playSpeed === s ? 'active' : ''}`}
                onClick={() => setPlaySpeed(s)}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Current State */}
      <div className="sim-section">
        <div className="sim-section-title">Current State</div>
        <div className="sim-stats">
          <div className="sim-stat">
            <span className="sim-stat-label">Operation</span>
            <span className="sim-stat-value">{currentOp?.name ?? '—'}</span>
          </div>
          <div className="sim-stat">
            <span className="sim-stat-label">Position</span>
            <span className="sim-stat-value">
              X{currentMove?.x.toFixed(1) ?? '0'} Y{currentMove?.y.toFixed(1) ?? '0'}
            </span>
          </div>
          <div className="sim-stat">
            <span className="sim-stat-label">Current Z</span>
            <span className="sim-stat-value">{currentZ.toFixed(2)} mm</span>
          </div>
          <div className="sim-stat">
            <span className="sim-stat-label">Deepest Cut</span>
            <span className="sim-stat-value">{minZReached.toFixed(2)} mm</span>
          </div>
          <div className="sim-stat">
            <span className="sim-stat-label">Move Type</span>
            <span className={`sim-stat-value sim-move-type ${currentMove?.type ?? ''}`}>
              {currentMove?.type ?? '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Job Info */}
      <div className="sim-section">
        <div className="sim-section-title">Job Summary</div>
        <div className="sim-stats">
          <div className="sim-stat">
            <span className="sim-stat-label">Material</span>
            <span className="sim-stat-value">{materialPreset?.name ?? '—'}</span>
          </div>
          <div className="sim-stat">
            <span className="sim-stat-label">Stock</span>
            <span className="sim-stat-value">{stock.width} x {stock.height} x {stock.thickness}mm</span>
          </div>
          <div className="sim-stat">
            <span className="sim-stat-label">Cut Distance</span>
            <span className="sim-stat-value">{(totalCutDistance / 1000).toFixed(1)} m</span>
          </div>
          <div className="sim-stat">
            <span className="sim-stat-label">Total Time</span>
            <span className="sim-stat-value">{formatTime(estimatedTime)}</span>
          </div>
          <div className="sim-stat">
            <span className="sim-stat-label">Elapsed</span>
            <span className="sim-stat-value">{formatTime(estimatedTime * simulationProgress)}</span>
          </div>
          <div className="sim-stat">
            <span className="sim-stat-label">Remaining</span>
            <span className="sim-stat-value">{formatTime(estimatedTime * (1 - simulationProgress))}</span>
          </div>
          <div className="sim-stat">
            <span className="sim-stat-label">Operations</span>
            <span className="sim-stat-value">{opBoundaries.length}</span>
          </div>
        </div>
      </div>

      {/* Operations Progress */}
      <div className="sim-section">
        <div className="sim-section-title">Operations</div>
        <div className="sim-op-list">
          {opBoundaries.map((b) => {
            const total = b.endIdx - b.startIdx;
            const done = Math.max(0, Math.min(total, currentMoveIdx - b.startIdx));
            const pct = total > 0 ? (done / total) * 100 : 0;
            const status = currentMoveIdx < b.startIdx ? 'pending' : currentMoveIdx >= b.endIdx ? 'done' : 'active';
            // Elapsed time for this op based on progress
            const opElapsed = status === 'done' ? b.time : status === 'active' ? b.time * (pct / 100) : 0;
            return (
              <div key={b.opId + b.startIdx} className={`sim-op-item ${status}`}>
                <div className="sim-op-header-row">
                  <span className="sim-op-name">{b.name}</span>
                  <span className="sim-op-time">{formatTime(b.time)}</span>
                </div>
                <div className="sim-op-bar">
                  <div className="sim-op-bar-fill" style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <div className="sim-op-details">
                  <span>{(b.cutDistance / 1000).toFixed(1)}m cut</span>
                  {status === 'active' && <span>{formatTime(opElapsed)} / {formatTime(b.time)}</span>}
                  {status === 'done' && <span>complete</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* View Options */}
      <div className="sim-section">
        <div className="sim-section-title">View</div>
        <label className="op-toggle">
          <input
            type="checkbox"
            checked={showToolpaths}
            onChange={(e) => setShowToolpaths(e.target.checked)}
          />
          Show toolpath lines
        </label>
      </div>
    </div>
  );
}
