import { useState } from 'react';
import { useToolStore } from '../../store/useToolStore';
import type { Tool, ToolType } from '../../store/useToolStore';

export function ToolLibrary() {
  const tools = useToolStore((s) => s.tools);
  const addTool = useToolStore((s) => s.addTool);
  const updateTool = useToolStore((s) => s.updateTool);
  const removeTool = useToolStore((s) => s.removeTool);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleAdd = () => {
    const id = addTool({
      name: 'New Tool',
      type: 'endmill',
      diameter: 6.35,
      flutes: 2,
      rpm: 18000,
      feedRate: 1500,
      plungeRate: 750,
      stepOver: 0.4,
      depthPerPass: 2,
    });
    setEditingId(id);
  };

  return (
    <div className="tool-library">
      <h3>Tool Library</h3>
      <div className="tool-list">
        {tools.map((tool) => (
          <div key={tool.id} className="tool-item">
            {editingId === tool.id ? (
              <ToolEditForm
                tool={tool}
                onSave={(updates) => { updateTool(tool.id, updates); setEditingId(null); }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="tool-summary" onClick={() => setEditingId(tool.id)}>
                <strong>{tool.name}</strong>
                <span>{tool.diameter}mm {tool.type}</span>
                <button className="btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); removeTool(tool.id); }}>
                  ×
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <button className="btn-primary" onClick={handleAdd}>Add Tool</button>
    </div>
  );
}

function ToolEditForm({ tool, onSave, onCancel }: {
  tool: Tool;
  onSave: (u: Partial<Tool>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ ...tool });
  const set = (key: keyof Tool, val: string | number) => setForm((f) => ({ ...f, [key]: val }));

  return (
    <div className="tool-edit form-grid">
      <label>Name</label>
      <input value={form.name} onChange={(e) => set('name', e.target.value)} />
      <label>Type</label>
      <select value={form.type} onChange={(e) => set('type', e.target.value as ToolType)}>
        <option value="endmill">End Mill</option>
        <option value="ballnose">Ball Nose</option>
        <option value="vbit">V-Bit</option>
      </select>
      <label>Diameter (mm)</label>
      <input type="number" value={form.diameter} onChange={(e) => set('diameter', +e.target.value)} />
      <label>Flutes</label>
      <input type="number" value={form.flutes} onChange={(e) => set('flutes', +e.target.value)} />
      <label>RPM</label>
      <input type="number" value={form.rpm} onChange={(e) => set('rpm', +e.target.value)} />
      <label>Feed (mm/min)</label>
      <input type="number" value={form.feedRate} onChange={(e) => set('feedRate', +e.target.value)} />
      <label>Plunge (mm/min)</label>
      <input type="number" value={form.plungeRate} onChange={(e) => set('plungeRate', +e.target.value)} />
      <label>Step Over (0-1)</label>
      <input type="number" step="0.05" value={form.stepOver} onChange={(e) => set('stepOver', +e.target.value)} />
      <label>Depth/Pass (mm)</label>
      <input type="number" value={form.depthPerPass} onChange={(e) => set('depthPerPass', +e.target.value)} />
      <div className="form-actions">
        <button className="btn-primary" onClick={() => onSave(form)}>Save</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
