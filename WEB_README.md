## Status: React Web App Removed

The React/Vite frontend that used to live under the `web/` directory has been **fully removed** from this repository on this machine.

- A snapshot of the last React version is preserved in git as the **`react-archive`** branch.
- There is no longer any `web/` directory or React tooling required to run DandDy.

Going forward, the project is intentionally **non-React-only** and uses classic HTML/JS frontends plus the backend API.

## What to use instead

- **Backend API**: `./start-backend.sh`
- **Classic frontends (no React required)**: `./start-frontend.sh`
  - Serves `character-manager.html`, `character-builder/index.html`, etc. on `http://localhost:8080`
- **Simple static viewer**: `web-simple/index.html` (pure HTML/JS)

These flows provide the full UX for managing and viewing characters without any React dependencies.

## If you ever need the old React app

If you want to see or restore the old React web app in the future:

1. Checkout the archive branch:
   - `git checkout react-archive`
2. Restore the `web/` directory and React tooling from that branch.
3. Reintroduce the original React tooling (Node/npm, Vite, etc.) as needed.

On this machine and in this branch, however, the React path is deliberately removed to keep the setup simple and dependency-free.

