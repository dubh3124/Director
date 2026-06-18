# Director User Guide

This guide is for a local agent or human operator using Director through the CLI.

Director creates live-application presentations from a storyboard. It can scout an app, validate a storyboard, shoot browser dailies, render a `final-cut.mp4`, and create an editable `pitch-deck.pptx`.

## Requirements

- Node.js 20 or newer
- `ffmpeg` and `ffprobe` available on `PATH`
- Playwright browser dependencies installed
- The target app running locally or reachable from this machine

Install project dependencies:

```bash
npm install
```

Install Playwright Chromium if it has not already been installed:

```bash
npx playwright install chromium
```

Check that ffmpeg is available:

```bash
ffmpeg -version
ffprobe -version
```

## Command Style

From the repo root:

```bash
npm run director -- <command>
```

After building, the compiled CLI can also be run as:

```bash
node dist/cli/director.js <command>
```

## Fast Path

Use this flow when an app is already running:

```bash
npm run director -- init storyboard.yaml --title "Live App Walkthrough" --url http://localhost:3000
npm run director -- check storyboard.yaml
npm run director -- shoot storyboard.yaml --approved
npm run director -- render storyboard.yaml
```

Or run the full production in one command:

```bash
npm run director -- premiere storyboard.yaml --approved
```

`premiere` runs `check`, then `shoot`, then `render`.

## Approval Gate

Director requires explicit approval before shooting or premiering because those commands operate a browser, use local credentials/browser state if configured, and write artifacts to disk.

Use one of these approval methods:

```bash
npm run director -- shoot storyboard.yaml --approved
npm run director -- premiere storyboard.yaml --approved
```

For trusted local automation:

```bash
DIRECTOR_APPROVED=1 npm run director -- shoot storyboard.yaml
DIRECTOR_APPROVED=1 npm run director -- premiere storyboard.yaml
```

Agents should draft and check freely, then ask for approval before `shoot` or `premiere`.

## CLI Commands

### `director init`

Creates a starter storyboard.

```bash
npm run director -- init storyboard.yaml --title "Product Demo" --url http://localhost:3000
```

Output:

- `storyboard.yaml`

### `director scout`

Inspects a live app and captures a scouting report.

```bash
npm run director -- scout --url http://localhost:3000
```

Optional output directory:

```bash
npm run director -- scout --url http://localhost:3000 --output-dir .director/scout
```

Use this before drafting a better storyboard.

### `director storyboard`

Drafts a storyboard from a URL and brief.

```bash
npm run director -- storyboard --url http://localhost:3000 --title "Onboarding Demo" --brief "Show the homepage and primary onboarding action." --write storyboard.yaml
```

Alias:

```bash
npm run director -- draft --url http://localhost:3000 --write storyboard.yaml
```

### `director check`

Validates the storyboard and local production dependencies.

```bash
npm run director -- check storyboard.yaml
```

This checks:

- Storyboard schema
- Camera rig configuration
- Voiceover provider configuration
- `ffmpeg`
- `ffprobe`
- Optional app health URL, if configured

### `director shoot`

Runs the storyboard against the app and creates dailies.

```bash
npm run director -- shoot storyboard.yaml --approved
```

Dry run:

```bash
npm run director -- shoot storyboard.yaml --approved --dry-run
```

### `director render`

Creates the final video and deck from existing dailies.

```bash
npm run director -- render storyboard.yaml
```

Run `shoot` first. `render` intentionally does not drive the app again.

### `director premiere`

Runs the complete production.

```bash
npm run director -- premiere storyboard.yaml --approved
```

Dry run:

```bash
npm run director -- premiere storyboard.yaml --approved --dry-run
```

### `director mcp`

Runs the local MCP server over stdio for local agents.

```bash
npm run director -- mcp
```

Equivalent script:

```bash
npm run mcp
```

### `director a2a`

Runs the A2A-shaped Director Agent adapter.

```bash
npm run director -- a2a --port 4129
```

Equivalent script:

```bash
npm run a2a
```

Agent Card:

```text
http://localhost:4129/.well-known/agent-card.json
```

A2A endpoint:

```text
http://localhost:4129/a2a
```

## Storyboard Basics

A storyboard is YAML or JSON. YAML is usually easiest for agents to edit.

Minimal example:

```yaml
schemaVersion: "1"
title: Live App Walkthrough
app:
  name: Live App
  baseUrl: http://localhost:3000
outputDir: .director/live-app-walkthrough
camera:
  type: playwright
  recordVideo: true
voiceover:
  provider: none
deck:
  enabled: true
  fileName: pitch-deck.pptx
timing:
  defaultHoldMs: 500
  transitionBufferMs: 150
scenes:
  - id: opening
    title: Application Overview
    shots:
      - id: overview
        title: Overview
        stageDirections:
          - type: goto
            url: ${app.baseUrl}
          - type: waitForSelector
            selector: body
          - type: capture
            name: overview
```

## Director Nomenclature

- `Storyboard`: the production plan
- `Scene`: a grouped chapter of the presentation
- `Shot`: one captured app moment
- `Stage Direction`: one browser action
- `Camera Rig`: capture backend, such as Playwright or OBS
- `Dailies`: raw screenshots, captures, diagnostics, and timing data
- `Final Cut`: rendered MP4
- `Pitch Deck`: editable PPTX

## Stage Directions

Supported browser stage directions:

```yaml
- type: goto
  url: ${app.baseUrl}

- type: waitForSelector
  selector: body

- type: waitForText
  text: Dashboard

- type: click
  selector: button[type="submit"]

- type: clickLink
  text: Settings

- type: clickLink
  hrefIncludes: /settings

- type: fill
  selector: input[name="email"]
  value: user@example.com

- type: press
  key: Enter

- type: press
  selector: input[name="search"]
  key: Enter

- type: wait
  ms: 1000

- type: capture
  name: dashboard
  fullPage: true
```

## Placeholders

Storyboards support placeholders:

```yaml
url: ${app.baseUrl}/projects/${PROJECT_ID}
```

`${app.baseUrl}` comes from the storyboard. `${PROJECT_ID}` comes from the environment.

Example:

```bash
PROJECT_ID=abc123 npm run director -- shoot storyboard.yaml --approved
```

If a placeholder cannot be resolved, storyboard loading fails.

## Artifacts

Artifacts are written under `outputDir`.

For this storyboard:

```yaml
outputDir: .director/live-app-walkthrough
```

Expected outputs:

```text
.director/live-app-walkthrough/final/final-cut.mp4
.director/live-app-walkthrough/final/pitch-deck.pptx
.director/live-app-walkthrough/manifests/production-manifest.json
.director/live-app-walkthrough/manifests/shoot-manifest.json
.director/live-app-walkthrough/manifests/voiceover-manifest.json
.director/live-app-walkthrough/dailies/screenshots/
.director/live-app-walkthrough/dailies/raw-video/
.director/live-app-walkthrough/dailies/diagnostics/
```

## Recommended Agent Workflow

1. Confirm the target app URL.
2. Run `scout` to inspect the app.
3. Draft or update `storyboard.yaml`.
4. Run `check`.
5. Ask the user for approval to shoot.
6. Run `shoot --approved`.
7. Run `render`.
8. Report the Final Cut, Pitch Deck, and Production Manifest paths.

Example:

```bash
npm run director -- scout --url http://localhost:3000 --output-dir .director/scout
npm run director -- storyboard --url http://localhost:3000 --title "Demo" --brief "Show the main workflow." --write storyboard.yaml
npm run director -- check storyboard.yaml
npm run director -- shoot storyboard.yaml --approved
npm run director -- render storyboard.yaml
```

## MCP Tool Names

When using Director through MCP, use these tools:

- `director_scout_app`
- `director_draft_storyboard`
- `director_check_storyboard`
- `director_shoot_storyboard`
- `director_render_premiere`
- `director_get_dailies`

MCP should be preferred for local agents that need tool calls instead of shell commands. CLI should be preferred for simple automation and first-time testing.

## A2A Skills

The A2A adapter exposes these skills:

- `scout_app`
- `draft_storyboard`
- `validate_storyboard`
- `shoot_presentation`
- `premiere_presentation`

Approval-gated skills return `TASK_STATE_INPUT_REQUIRED` until `approved: true` is provided.

## Troubleshooting

### Playwright browser missing

Symptom:

```text
Executable doesn't exist
```

Fix:

```bash
npx playwright install chromium
```

### ffmpeg missing

Symptom:

```text
Required command not found: ffmpeg
```

Fix:

```bash
brew install ffmpeg
```

### Render says shoot first

Symptom:

```text
Missing required file for render
```

Fix:

```bash
npm run director -- shoot storyboard.yaml --approved
npm run director -- render storyboard.yaml
```

### App is not reachable

Make sure the target app is running and reachable from this machine:

```bash
curl http://localhost:3000
```

### Placeholder unresolved

Symptom:

```text
Unresolved placeholder in storyboard
```

Fix by setting the needed environment variable:

```bash
PROJECT_ID=abc123 npm run director -- check storyboard.yaml
```

## Handoff Checklist For Another Agent

Give the agent:

- Repo root for this checkout
- Target app URL
- Desired demo brief
- Approval policy: ask before `shoot` or `premiere`
- Expected final artifacts: `final-cut.mp4`, `pitch-deck.pptx`, `production-manifest.json`

Suggested first command:

```bash
npm run director -- scout --url http://localhost:3000
```

Do not give agents real secrets in the storyboard. Use environment variables and keep `.env` files local.
