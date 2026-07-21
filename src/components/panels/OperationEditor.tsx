import type { Operation } from '../../store/useProjectStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useToolStore } from '../../store/useToolStore';
import { useMachineStore, MATERIAL_PRESETS } from '../../store/useMachineStore';

interface Props {
  operation: Operation;
}

export function OperationEditor({ operation }: Props) {
  const updateOperation = useProjectStore((s) => s.updateOperation);
  const stock = useProjectStore((s) => s.stock);
  const tools = useToolStore((s) => s.tools);
  const selectedMaterial = useMachineStore((s) => s.selectedMaterial);
  const tool = tools.find((t) => t.id === operation.toolId);

  const update = (updates: Partial<Operation>) => updateOperation(operation.id, updates);

  const materialPreset = MATERIAL_PRESETS.find((m) => m.id === selectedMaterial);

  // Resolve material-specific tool params (same logic as toolpath generation)
  const matToolDefaults = (() => {
    if (!tool || !materialPreset) return null;
    const diameters = Object.keys(materialPreset.toolDefaults).map(Number);
    let bestDiam = diameters[0];
    let bestDiff = Math.abs(tool.diameter - bestDiam);
    for (const d of diameters) {
      const diff = Math.abs(tool.diameter - d);
      if (diff < bestDiff) { bestDiff = diff; bestDiam = d; }
    }
    if (bestDiff > tool.diameter * 0.2) return null;
    return materialPreset.toolDefaults[bestDiam] ?? null;
  })();

  const effectiveRpm = matToolDefaults?.rpm ?? tool?.rpm ?? 0;
  const effectiveFeed = matToolDefaults?.feedRate ?? tool?.feedRate ?? 0;
  const effectivePlunge = matToolDefaults?.plungeRate ?? tool?.plungeRate ?? 0;
  const effectiveDpp = matToolDefaults?.depthPerPass ?? tool?.depthPerPass ?? 1;
  const effectiveStepOver = matToolDefaults?.stepOver ?? tool?.stepOver ?? 0.4;

  // Resolved values (operation overrides > material preset > tool default)
  const resolvedDepth = operation.totalDepth ?? stock.thickness;
  const resolvedDpp = operation.depthPerPass ?? effectiveDpp;
  const resolvedStepOver = operation.stepOver ?? effectiveStepOver;
  const estimatedPasses = Math.ceil(resolvedDepth / resolvedDpp);

  const typeBadge = operation.type === 'contour' ? 'C' : operation.type === 'pocket' ? 'P' : 'D';
  const typeClass = operation.type;

  return (
    <div className="operation-editor">
      <div className="op-editor-header">
        <span className={`op-type-badge ${typeClass}`}>{typeBadge}</span>
        <input
          className="op-name-input"
          value={operation.name}
          onChange={(e) => update({ name: e.target.value })}
        />
      </div>

      {/* Tool Selection */}
      <div className="op-section">
        <div className="op-section-title">Tool</div>
        <select value={operation.toolId} onChange={(e) => update({ toolId: e.target.value })}>
          {tools.map((t) => (
            <option key={t.id} value={t.id}>{t.name} ({t.diameter}mm)</option>
          ))}
        </select>
        {tool && (
          <div className="op-tool-info">
            <span>{effectiveRpm.toLocaleString()} RPM</span>
            <span>{effectiveFeed} mm/min</span>
            <span>{effectivePlunge} mm/min plunge</span>
            {matToolDefaults && (
              <span className="op-material-note">({materialPreset?.name})</span>
            )}
          </div>
        )}
      </div>

      {/* Depth Settings */}
      <div className="op-section">
        <div className="op-section-title">Depth</div>
        <div className="op-field">
          <label>Total Depth</label>
          <div className="op-input-group">
            <input
              type="number"
              step="0.1"
              value={operation.totalDepth ?? ''}
              placeholder={`${stock.thickness} (stock)`}
              onChange={(e) => update({ totalDepth: e.target.value ? +e.target.value : undefined })}
            />
            <span className="op-unit">mm</span>
          </div>
        </div>
        <div className="op-field">
          <label>Depth per Pass</label>
          <div className="op-input-group">
            <input
              type="number"
              step="0.1"
              value={operation.depthPerPass ?? ''}
              placeholder={`${effectiveDpp} (${matToolDefaults ? materialPreset?.name : 'tool'})`}
              onChange={(e) => update({ depthPerPass: e.target.value ? +e.target.value : undefined })}
            />
            <span className="op-unit">mm</span>
          </div>
        </div>
        <div className="op-summary">
          {resolvedDepth.toFixed(1)}mm deep in {estimatedPasses} pass{estimatedPasses !== 1 ? 'es' : ''} @ {resolvedDpp.toFixed(1)}mm each
        </div>
      </div>

      {/* Contour-specific */}
      {operation.type === 'contour' && (
        <>
          <div className="op-section">
            <div className="op-section-title">Contour Settings</div>
            <div className="op-field">
              <label>Cut Side</label>
              <div className="op-radio-group">
                {(['outside', 'inside', 'on'] as const).map((side) => (
                  <label key={side} className={`op-radio ${(operation.cutSide ?? 'outside') === side ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name={`cutside-${operation.id}`}
                      value={side}
                      checked={(operation.cutSide ?? 'outside') === side}
                      onChange={() => update({ cutSide: side })}
                    />
                    {side.charAt(0).toUpperCase() + side.slice(1)}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="op-section">
            <div className="op-section-title">
              <label className="op-toggle">
                <input
                  type="checkbox"
                  checked={operation.tabs ?? false}
                  onChange={(e) => update({ tabs: e.target.checked })}
                />
                Holding Tabs
              </label>
            </div>
            {operation.tabs && (
              <div className="op-tab-grid">
                <div className="op-field">
                  <label>Count</label>
                  <input type="number" value={operation.tabCount ?? 4} min={1} max={20}
                    onChange={(e) => update({ tabCount: +e.target.value })} />
                </div>
                <div className="op-field">
                  <label>Width</label>
                  <div className="op-input-group">
                    <input type="number" step="0.5" value={operation.tabWidth ?? 6}
                      onChange={(e) => update({ tabWidth: +e.target.value })} />
                    <span className="op-unit">mm</span>
                  </div>
                </div>
                <div className="op-field">
                  <label>Height</label>
                  <div className="op-input-group">
                    <input type="number" step="0.5" value={operation.tabHeight ?? 2}
                      onChange={(e) => update({ tabHeight: +e.target.value })} />
                    <span className="op-unit">mm</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Pocket-specific */}
      {operation.type === 'pocket' && (
        <div className="op-section">
          <div className="op-section-title">Pocket Settings</div>
          <div className="op-field">
            <label>Step Over</label>
            <div className="op-input-group">
              <input
                type="number"
                step="5"
                min={5}
                max={95}
                value={Math.round((operation.stepOver ?? tool?.stepOver ?? 0.4) * 100)}
                onChange={(e) => update({ stepOver: +e.target.value / 100 })}
              />
              <span className="op-unit">%</span>
            </div>
          </div>
          <div className="op-summary">
            Step: {(resolvedStepOver * (tool?.diameter ?? 6.35)).toFixed(1)}mm ({Math.round(resolvedStepOver * 100)}% of {tool?.diameter ?? 6.35}mm tool)
          </div>
          <div className="op-field">
            <label className="op-toggle">
              <input
                type="checkbox"
                checked={operation.finishPass ?? true}
                onChange={(e) => update({ finishPass: e.target.checked })}
              />
              Finish Pass
            </label>
          </div>
        </div>
      )}

      {/* Drill-specific */}
      {operation.type === 'drill' && (
        <div className="op-section">
          <div className="op-section-title">Drill Settings</div>
          <div className="op-field">
            <label className="op-toggle">
              <input
                type="checkbox"
                checked={operation.peck ?? false}
                onChange={(e) => update({ peck: e.target.checked })}
              />
              Peck Drilling
            </label>
          </div>
          {operation.peck && (
            <div className="op-field">
              <label>Peck Depth</label>
              <div className="op-input-group">
                <input
                  type="number"
                  step="0.5"
                  value={operation.peckDepth ?? 3}
                  onChange={(e) => update({ peckDepth: +e.target.value })}
                />
                <span className="op-unit">mm</span>
              </div>
              <div className="op-summary">
                {Math.ceil(resolvedDepth / (operation.peckDepth ?? 3))} peck cycles
              </div>
            </div>
          )}
          <div className="op-field" style={{ marginTop: 8 }}>
            <label className="op-toggle">
              <input
                type="checkbox"
                checked={operation.counterbore ?? false}
                onChange={(e) => {
                  const checked = e.target.checked;
                  if (checked) {
                    update({
                      counterbore: true,
                      counterboreDiameter: operation.counterboreDiameter ?? (tool ? tool.diameter * 3 : 10),
                      counterboreDepth: operation.counterboreDepth ?? 3,
                    });
                  } else {
                    update({ counterbore: false });
                  }
                }}
              />
              Counterbore (Sunken Header)
            </label>
          </div>
          {operation.counterbore && (
            <>
              <div className="op-field">
                <label>Counterbore Diameter</label>
                <div className="op-input-group">
                  <input
                    type="number"
                    step="0.5"
                    value={operation.counterboreDiameter ?? (tool ? tool.diameter * 3 : 10)}
                    onChange={(e) => update({ counterboreDiameter: +e.target.value })}
                  />
                  <span className="op-unit">mm</span>
                </div>
              </div>
              <div className="op-field">
                <label>Counterbore Depth</label>
                <div className="op-input-group">
                  <input
                    type="number"
                    step="0.5"
                    value={operation.counterboreDepth ?? 3}
                    onChange={(e) => update({ counterboreDepth: +e.target.value })}
                  />
                  <span className="op-unit">mm</span>
                </div>
              </div>
              <div className="op-summary">
                {(operation.counterboreDiameter ?? (tool ? tool.diameter * 3 : 10)).toFixed(1)}mm wide × {(operation.counterboreDepth ?? 3).toFixed(1)}mm deep pocket before drill
              </div>
            </>
          )}
        </div>
      )}

      {/* Material info */}
      {materialPreset && (
        <div className="op-section">
          <div className="op-section-title">Material</div>
          <div className="op-material-badge">{materialPreset.name}</div>
        </div>
      )}

      {/* Geometry info */}
      <div className="op-section">
        <div className="op-section-title">Geometry</div>
        <div className="op-geometry-info">
          {operation.geometryIds.length} item{operation.geometryIds.length !== 1 ? 's' : ''} selected
        </div>
      </div>
    </div>
  );
}
