# HeatMap

HeatMap is a VS Code extension that profiles a selected pytest test and visualizes the resulting hotspots as an editor heatmap.

## Current capabilities

- Discover pytest tests from the command palette
- Profile a selected test with `cProfile`
- Project function-level timing onto source lines
- Color entire lines by heat intensity
- Show inline HUD metrics for cumulative time, total time, and call count
- Toggle the current overlay from a status bar button

## Development

```bash
npm install
npm run build
```

Recommended debug entrypoint: run the `Run HeatMap Extension` launch configuration in VS Code.
