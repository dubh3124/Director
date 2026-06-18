# Agent Contribution Guide

This file is for future agents working in this repository.

## Purpose

Director is a local-first, AI-first system for creating live-application presentations. The package and repository slug are `ai-recorder`; the CLI command is `director`. Director exposes a TypeScript SDK, a local MCP server, and an A2A-shaped adapter. The SDK is the source of truth; adapters should call SDK operations instead of duplicating behavior.

Use movie/director nomenclature consistently:

- `Director`: the production system and operator.
- `Storyboard`: the versioned production plan.
- `Scene`: a grouped chapter of related shots.
- `Shot`: one captured app moment.
- `Stage Direction`: a browser action such as `goto`, `click`, `fill`, `press`, `waitForText`, or `capture`.
- `Camera Rig`: capture backend, usually Playwright.
- `Dailies`: raw screenshots, recordings, diagnostics, and timing data.
- `Final Cut`: rendered MP4.
- `Pitch Deck`: editable PPTX.

## Commands

Run these before handing work back:

```bash
npm run typecheck
npm test
npm run build
```

Run these for release or packaging work:

```bash
npm audit --audit-level=moderate
npm run pack:dry
```

Use the development CLI from the repo root:

```bash
npm run director -- check examples/basic/storyboard.yaml
```

## Approval Gates

`shoot` and `premiere` operate a browser and write production artifacts, so they require approval. Do not bypass approval in agent workflows unless the user explicitly configures trusted local automation with `DIRECTOR_APPROVED=1` or passes `--approved`.

Agents may scout, draft, and check storyboards without approval.

## No-Secret Rules

Never commit:

- Real API keys, client secrets, passwords, bearer tokens, or session material.
- Private URLs, tailnet domains, tenant/customer names, or production credentials.
- `.env` files, raw transcripts, screenshots, videos, generated decks, or local demo bridge scripts.
- Anything under `.director/`.

Use placeholder env var names in docs and examples. Keep generated/private demos in `.director/local-demos/` or another ignored dot directory.

## Artifact Policy

Source-controlled examples should be generic and safe to run against `http://localhost:3000`.

Generated outputs belong under `.director/<production-name>/` and stay ignored:

- `final/final-cut.mp4`
- `final/pitch-deck.pptx`
- `manifests/*.json`
- `dailies/screenshots/`
- `dailies/raw-video/`
- `dailies/diagnostics/`

## Release Checks

Before public release:

1. Run `npm run release:check`.
2. Inspect `npm pack --dry-run --json` output.
3. Run a secret/reference sweep for private tokens, URLs, local absolute paths, generated media, and local demo text.
4. Confirm GitHub metadata is filled in `package.json` after the remote exists.
5. Confirm docs still describe the current maturity: public alpha / developer preview.
