# Security Sweep

Run this before publishing, creating public examples, or committing demo material.

## Secret And Reference Scan

```bash
rg --hidden -n "(kis_|kic_|kat_|kctx_|tail[0-9a-z]+\\.ts\\.net|/Users/|password|secret|token|CLIENT_SECRET)" \
  --glob "!node_modules/**" \
  --glob "!dist/**" \
  --glob "!.git/**" \
  --glob "!package-lock.json" \
  .
```

Review every match. Allowed matches should be documentation about secret handling or placeholder environment variable names. Real values are never acceptable.

## Generated Artifact Scan

```bash
rg --files --hidden \
  --glob "!node_modules/**" \
  --glob "!dist/**" \
  --glob "!.git/**" \
  | rg "(^|/)(productions|\.director)(/|$)|\.(mp4|mov|webm|m4a|mp3|wav|pptx|png|jpg|jpeg)$"
```

Public source should not include generated productions, recordings, screenshots, decks, transcripts, or private dailies.

## Package Scan

```bash
npm pack --dry-run --json
```

Inspect the `files` list in the JSON output. It must exclude:

- `.director/`
- `.env` files
- `productions/`
- generated media and decks
- private storyboards
- local absolute paths
- secret-bearing scripts or transcripts

## What Must Stay Ignored

These are intentionally ignored:

- `.director/`
- `.env` and `.env.*`
- `node_modules/`
- `dist/`
- generated audio/video files
- generated PowerPoint decks
- local Playwright reports and test artifacts

Keep `.env.example` public and placeholder-only.
