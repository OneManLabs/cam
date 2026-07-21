import { useState } from 'react';
import {
  useMachineStore,
  MACHINE_PRESETS,
  MATERIAL_PRESETS,
  type MaterialId,
} from '../../store/useMachineStore';
import { useToolStore } from '../../store/useToolStore';

export function MachineSetup() {
  const machineId = useMachineStore((s) => s.machineId);
  const machine = useMachineStore((s) => s.machine);
  const selectedMaterial = useMachineStore((s) => s.selectedMaterial);
  const setMachineId = useMachineStore((s) => s.setMachineId);
  const setSelectedMaterial = useMachineStore((s) => s.setSelectedMaterial);

  const tools = useToolStore((s) => s.tools);
  const updateTool = useToolStore((s) => s.updateTool);

  const [pendingMaterial, setPendingMaterial] = useState<MaterialId | null>(null);

  const currentPreset = MATERIAL_PRESETS.find((m) => m.id === selectedMaterial);

  const handleMaterialChange = (id: MaterialId) => {
    setPendingMaterial(id);
  };

  const applyMaterialToTools = () => {
    if (!pendingMaterial) return;
    const preset = MATERIAL_PRESETS.find((m) => m.id === pendingMaterial);
    if (!preset) return;

    for (const tool of tools) {
      // Find closest matching diameter in presets
      const presetDiameters = Object.keys(preset.toolDefaults).map(Number);
      const match = presetDiameters.find((d) => Math.abs(d - tool.diameter) < 0.1);
      if (match !== undefined) {
        const defaults = preset.toolDefaults[match];
        updateTool(tool.id, {
          rpm: defaults.rpm,
          feedRate: defaults.feedRate,
          plungeRate: defaults.plungeRate,
          stepOver: defaults.stepOver,
          depthPerPass: defaults.depthPerPass,
        });
      }
    }

    setSelectedMaterial(pendingMaterial);
    setPendingMaterial(null);
  };

  const skipApply = () => {
    if (pendingMaterial) {
      setSelectedMaterial(pendingMaterial);
      setPendingMaterial(null);
    }
  };

  const pendingPreset = pendingMaterial
    ? MATERIAL_PRESETS.find((m) => m.id === pendingMaterial)
    : null;

  // Count how many tools would be updated
  const matchCount = pendingPreset
    ? tools.filter((tool) => {
        const diameters = Object.keys(pendingPreset.toolDefaults).map(Number);
        return diameters.some((d) => Math.abs(d - tool.diameter) < 0.1);
      }).length
    : 0;

  return (
    <div className="machine-setup">
      <h3>Machine</h3>
      <div className="form-grid">
        <label>Machine</label>
        <select
          value={machineId}
          onChange={(e) => setMachineId(e.target.value)}
        >
          {Object.entries(MACHINE_PRESETS).map(([id, preset]) => (
            <option key={id} value={id}>{preset.name}</option>
          ))}
        </select>

        <label>Spindle</label>
        <input type="text" value={machine.spindleType} readOnly />

        <label>RPM Range</label>
        <input
          type="text"
          value={`${machine.minRpm.toLocaleString()} – ${machine.maxRpm.toLocaleString()}`}
          readOnly
        />

        <label>Work Area</label>
        <input
          type="text"
          value={`${machine.workArea.x} × ${machine.workArea.y} × ${machine.workArea.z} mm`}
          readOnly
        />
      </div>

      <h3 style={{ marginTop: 16 }}>Stock Material</h3>
      <div className="form-grid">
        <label>Material</label>
        <select
          value={pendingMaterial ?? selectedMaterial}
          onChange={(e) => handleMaterialChange(e.target.value as MaterialId)}
        >
          {MATERIAL_PRESETS.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {currentPreset && !pendingMaterial && (
        <div className="material-info">
          <p className="material-desc">{currentPreset.description}</p>
          <div className="material-presets-table">
            <div className="preset-header">
              <span>Tool</span>
              <span>RPM</span>
              <span>Feed</span>
              <span>DOC</span>
            </div>
            {Object.entries(currentPreset.toolDefaults).map(([diam, preset]) => {
              const d = parseFloat(diam);
              const label = d < 1 ? '1/32"' : d < 2 ? '1/16"' : d < 4 ? '1/8"' : d < 7 ? '1/4"' : `${d}mm`;
              return (
                <div key={diam} className="preset-row">
                  <span>{label}</span>
                  <span>{preset.rpm.toLocaleString()}</span>
                  <span>{preset.feedRate}</span>
                  <span>{preset.depthPerPass}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {pendingMaterial && pendingMaterial !== selectedMaterial && (
        <div className="material-confirm">
          <p>
            Apply {pendingPreset?.name} feeds & speeds to {matchCount} matching tool{matchCount !== 1 ? 's' : ''}?
          </p>
          <div className="material-confirm-buttons">
            <button className="btn-primary" onClick={applyMaterialToTools}>
              Apply to Tools
            </button>
            <button onClick={skipApply}>Skip</button>
          </div>
        </div>
      )}
    </div>
  );
}
