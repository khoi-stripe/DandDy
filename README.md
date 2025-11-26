## DandDy Project Layout

- **Frontend entrypoints**
  - `character-manager.html` – full-screen character manager
  - `character-builder/index.html` – terminal-style character builder
  - `index.html` – simple landing / launcher

- **Backends & scripts**
  - `backend/` – FastAPI backend and SQLite/PostgreSQL storage
  - `start-backend.sh` – run backend API on port 8000
  - `start-frontend.sh` – serve static frontends on port 8080
  - `start-dev.sh` – combined dev helper (backend + frontend)

- **Docs**
  - `QUICK_START.md` – how to run the project locally
  - `DEVELOPMENT_GUIDE.md` – deeper development notes
  - `WEB_README.md` – notes about the classic (non‑React) web frontends
  - `docs/` – all detailed design, bug-fix, and feature notes moved out of the root

- **Debug & experiments**
  - `debug/` – storage/sort/ASCII/import test pages and other one‑off helpers

Everything else under `backend/`, `character-builder/`, and `generated_portraits/` is left where it is to avoid breaking existing paths; the root has been trimmed down to just entrypoints, scripts, and top‑level docs.


