# Contribute to CAM

You can submit bug reports and small pull requests.

Open an issue before you make one of these changes:

- A large new function
- A user-interface redesign
- A change to toolpath or G-code output

## Local checks

Use Node.js 22 or a newer version. Run these commands:

```bash
npm ci
npm run lint
npm test
npm run build
```

All commands must complete without an error.

## CNC changes

Add tests for changes to these functions:

- Geometry conversion
- Depth passes
- Toolpath order
- Arc output
- Coordinate transforms
- G-code output

For a machining problem, include the controller assumptions. Also include a small input file or test fixture.

Do not use the viewport or simulation as the only safety check. Make sure that a user can examine all generated G-code.

## Documentation style

Use ASD-STE100 Simplified Technical English principles.

- Use short sentences.
- Give one instruction in each step.
- Use active voice.
- Use the same term for the same item.
- Use American English spelling.
- Keep code identifiers unchanged.
