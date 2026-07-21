# CAM technical description

## Purpose

CAM is a client-side CNC application. It converts DXF and SVG geometry to GRBL-compatible G-code.

CAM has no server component. The browser keeps the project state and tool library in local storage.

## Supported input

| Format | Entities |
| --- | --- |
| DXF | `LINE`, `ARC`, `CIRCLE`, `LWPOLYLINE`, and `POLYLINE` |
| SVG | Path, polygon, circle, line, curve, and arc |

The import engine does these operations:

- Finds loops and contours.
- Identifies open and closed paths.
- Sets a standard winding direction.
- Makes regions for pocket operations.

## Design functions

- Make rectangles, circles, and polygons.
- Move, scale, rotate, align, and mirror geometry.
- Select one item or multiple items.
- Undo or redo as many as 50 changes.
- Set exact position and size values.

## Machine data

CAM includes presets for Shapeoko machines. You can also set a custom work area and spindle.

The stock data includes these values:

- Width
- Height
- Thickness
- X and Y origin
- Top or bottom Z origin
- Safe Z height

The tool library supports flat end mills, ball end mills, and V-bits. Each tool has diameter, flute, speed, feed, plunge, step-over, and depth data.

## Toolpath operations

### Contour

A contour can follow the inside, outside, or center of a path. The operation supports depth passes and holding tabs.

### Pocket

A pocket uses concentric offsets. It can remove islands from the cut region. It can also add a finish pass.

### Drill

A drill operation supports a direct plunge and peck drilling. It can use the center of a circle as the drill point.

## Simulation

The simulation uses a height map for the stock. A Web Worker calculates material removal.

The interface shows this data:

- Current operation
- Tool position
- Cut depth
- Move type
- Cut distance
- Elapsed and remaining time
- Operation progress

The simulation is a visual aid. It is not a machine-safety system.

## G-code output

CAM makes GRBL-compatible RS274 output. The output uses inches, absolute positions, and the XY plane.

The generator supports these commands:

- `G0` rapid moves
- `G1` linear moves
- `G2` and `G3` arc moves
- `M3` and `M5` spindle control
- `M6` tool changes
- `G53` machine-coordinate retracts
- `M2` program end

CAM emits a feed value again after each rapid move. This behavior prevents a known GRBL feed-state problem.

## Data flow

1. `useFileImport` reads the input file.
2. The DXF or SVG parser makes geometry objects.
3. The geometry store keeps the objects and the selection state.
4. The project store keeps stock, operation, and toolpath data.
5. `useToolpathGeneration` calls the selected toolpath engine.
6. The viewport shows the geometry and toolpaths.
7. The G-code generator converts toolpath moves to controller commands.

## Source map

```text
src/components   User interface and Three.js viewport
src/engine       Geometry, toolpath, and G-code functions
src/hooks        Import, toolpath, and scene control
src/store        Application state
src/workers      Material-removal simulation
tests/engine     Engine tests
```

## Technology

| Area | Technology |
| --- | --- |
| Interface | React 19 and TypeScript 5.9 |
| Build | Vite 8 |
| 3D view | Three.js 0.183 |
| State | Zustand 5 |
| Geometry | `clipper-lib` and `dxf-parser` |
| Tests | Vitest |

## Keyboard controls

| Key | Operation |
| --- | --- |
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` | Redo |
| `Delete` or `Backspace` | Delete selected geometry |

## Current verification

The project has engine tests for geometry, SVG import, and toolpath functions. The current verification target is GRBL output for a Shapeoko 5 Pro 4x4.
