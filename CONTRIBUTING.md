# Contributing

Thanks for helping make Director better. This project is a local-first TypeScript CLI and SDK for creating live-app presentations from storyboards.

## Setup

```bash
npm install
npx playwright install chromium
```

`ffmpeg` and `ffprobe` must be available on `PATH` for render tests and local productions.

## Development Commands

```bash
npm run typecheck
npm test
npm run build
npm audit --audit-level=moderate
npm run pack:dry
```

Use the development CLI from the repo root:

```bash
npm run director -- check examples/basic/storyboard.yaml
```

## Coding Expectations

- Keep the Director vocabulary consistent: Director, Storyboard, Scene, Shot, Stage Direction, Camera Rig, Dailies, Final Cut, and Pitch Deck.
- Preserve the SDK as the source of truth. CLI, MCP, and A2A should stay thin adapters over SDK operations.
- Validate external input with Zod or existing schema helpers.
- Keep Playwright as the supported default camera rig. OBS is experimental for this alpha.
- Add or update tests for validation, provider selection, manifests, adapters, and artifact behavior when changing those areas.

## Generated Artifacts And Secrets

Do not commit generated or private material. Keep local productions under `.director/` or another ignored dot directory.

Never commit real credentials, private URLs, tenant/customer names, raw videos, screenshots, transcripts, generated decks, `.env` files, or local bridge scripts with embedded secrets.

## Pull Request Checklist

- `npm run typecheck` passes.
- `npm test` passes.
- `npm run build` passes.
- `npm audit --audit-level=moderate` passes or any exception is documented.
- `npm run pack:dry` has been inspected for private or generated files.
- Public docs and examples stay free of local absolute paths, credentials, private URLs, and private demo material.
