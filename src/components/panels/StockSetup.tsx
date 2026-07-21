import { useProjectStore } from '../../store/useProjectStore';

export function StockSetup() {
  const stock = useProjectStore((s) => s.stock);
  const setStock = useProjectStore((s) => s.setStock);
  const safeZ = useProjectStore((s) => s.safeZ);
  const setSafeZ = useProjectStore((s) => s.setSafeZ);

  return (
    <div className="stock-setup">
      <h3>Stock Setup</h3>
      <div className="form-grid">
        <label>Width (X) mm</label>
        <input type="number" value={stock.width} onChange={(e) => setStock({ width: +e.target.value })} />
        <label>Height (Y) mm</label>
        <input type="number" value={stock.height} onChange={(e) => setStock({ height: +e.target.value })} />
        <label>Thickness (Z) mm</label>
        <input type="number" value={stock.thickness} onChange={(e) => setStock({ thickness: +e.target.value })} />
        <label>Origin X mm</label>
        <input type="number" value={stock.originX} onChange={(e) => setStock({ originX: +e.target.value })} />
        <label>Origin Y mm</label>
        <input type="number" value={stock.originY} onChange={(e) => setStock({ originY: +e.target.value })} />
        <label>Z Origin</label>
        <select value={stock.zOrigin} onChange={(e) => setStock({ zOrigin: e.target.value as 'top' | 'bottom' })}>
          <option value="top">Top of stock</option>
          <option value="bottom">Bottom of stock</option>
        </select>
        <label>Safe Z mm</label>
        <input type="number" value={safeZ} onChange={(e) => setSafeZ(+e.target.value)} />
      </div>
    </div>
  );
}
