# CI workflows — how to enable

This folder contains ready-to-use GitHub Actions workflows for both the
backend and the frontend. They are kept here as references because the
push that introduced them was made with a token that lacks the `workflow`
scope, so GitHub refused to write to `.github/workflows/` directly.

## To activate

Pick **one** of these options:

### Option A — via GitHub web UI (recommended, 2 minutes)

1. Open the repo on GitHub.
2. Click **Add file → Create new file**.
3. For the filename, type `.github/workflows/backend-ci.yml`.
4. Paste the contents of [`backend-ci.yml`](./backend-ci.yml).
5. Commit directly to `main`.
6. Repeat for `.github/workflows/frontend-ci.yml` using
   [`frontend-ci.yml`](./frontend-ci.yml).

### Option B — with a token that has `workflow` scope

1. Generate a new PAT at <https://github.com/settings/tokens> with
   scopes `repo` **and** `workflow`.
2. Move the files:

   ```bash
   mv docs/ci-examples/backend-ci.yml .github/workflows/
   mv docs/ci-examples/frontend-ci.yml .github/workflows/
   rmdir docs/ci-examples
   git add .github/workflows/
   git commit -m "ci: add backend + frontend workflows"
   git push
   ```

3. (Optional) delete `docs/ci-examples/` afterwards.

## What the workflows do

### `backend-ci.yml`

- Triggers on push/PR to `main` when files under `app/`, `tests/`,
  `migrations/`, `pyproject.toml`, or `requirements-dev.txt` change.
- Sets up Python 3.12 + Postgres 15 + Redis 7 services.
- Runs `ruff check`, `mypy app`, and `pytest` with coverage.
- Uploads coverage to Codecov (optional, set `CODECOV_TOKEN` secret).

### `frontend-ci.yml`

- Triggers on push/PR to `main` when files under `frontend/` change.
- Sets up Bun.
- Runs `bun run lint`, `tsc --noEmit`, and `bun run build`.

Both workflows also support `workflow_dispatch` so you can run them
manually from the Actions tab.

## Badges

After activation, add these badges to the top of `README.md`:

```markdown
[![Backend CI](https://github.com/imronaxl/websocket-chat/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/imronaxl/websocket-chat/actions/workflows/backend-ci.yml)
[![Frontend CI](https://github.com/imronaxl/websocket-chat/actions/workflows/frontend-ci.yml/badge.svg)](https://github.com/imronaxl/websocket-chat/actions/workflows/frontend-ci.yml)
```
