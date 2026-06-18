# Director

Director is a local-first, AI-first system for producing live-application presentations. It turns an approved Storyboard into a narrated video, editable Pitch Deck, manifests, and Dailies.

This is a public alpha / developer preview. The CLI and TypeScript SDK are the source of truth. MCP and A2A are adapters over the same SDK operations.

Director is recommended for first-class usage with AI agents. Let an agent scout the app, draft or revise the Storyboard, and run validation, then keep the approval gate in front of `shoot` and `premiere` so a human or trusted automation controls capture and artifact generation.

The product is called Director. The npm package and repository slug remain `ai-recorder`, and the installed CLI command is `director`.

## AI-First Usage

Director is designed to be driven by AI as a normal operating mode, not only as a manual screen recorder.

- Use the CLI when an agent can run shell commands in a local repo.
- Use the SDK when embedding Director in another product or automation service.
- Use MCP when a local agent needs structured tools while preserving localhost access, private networks, browser sessions, OBS, credentials, and filesystem artifacts.
- Use A2A as the long-term remote Director Agent shape, where another agent delegates a production job and receives progress updates plus artifacts.

Recommended agent workflow:

```text
scout app -> draft storyboard -> check storyboard -> request approval -> shoot -> render -> report artifacts
```

## What It Produces

- `final-cut.mp4`: rendered walkthrough video.
- `pitch-deck.pptx`: editable presentation deck.
- `production-manifest.json`: canonical production record.
- Dailies: screenshots, diagnostics, raw captures, voiceover files, and timing data.

## Requirements

- Node.js 20 or newer.
- `ffmpeg` and `ffprobe` on `PATH`.
- Playwright Chromium installed.
- A target browser app running locally or reachable from your machine.

```bash
npm install
npx playwright install chromium
ffmpeg -version
ffprobe -version
```

## Quickstart

Create and run a storyboard against a local app:

```bash
npm run director -- init storyboard.yaml --title "Live App Walkthrough" --url http://localhost:3000
npm run director -- check storyboard.yaml
npm run director -- shoot storyboard.yaml --approved
npm run director -- render storyboard.yaml
```

Or run the full production:

```bash
npm run director -- premiere storyboard.yaml --approved
```

`shoot` and `premiere` require explicit approval because they operate a browser and write local artifacts. For trusted local automation, set `DIRECTOR_APPROVED=1`.

## CLI

```bash
npm run director -- init storyboard.yaml --title "Demo" --url http://localhost:3000
npm run director -- scout --url http://localhost:3000
npm run director -- storyboard --url http://localhost:3000 --write storyboard.yaml
npm run director -- check storyboard.yaml
npm run director -- shoot storyboard.yaml --approved
npm run director -- render storyboard.yaml
npm run director -- premiere storyboard.yaml --approved
```

After building, the compiled CLI entrypoint is:

```bash
node dist/cli/director.js <command>
```

## Storyboard Contract

Storyboards are YAML or JSON, validated with Zod, and versioned with `schemaVersion`.

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

See [USER_GUIDE.md](./docs/USER_GUIDE.md) for the full CLI workflow and storyboard examples.

## SDK

The package exports the core Director operations:

- `loadStoryboard`
- `checkStoryboard`
- `scoutApp`
- `draftStoryboard`
- `shootStoryboard`
- `renderPremiere`
- `premiereStoryboard`
- `readProductionManifest`

Provider interfaces are exported for custom integrations:

- `CameraRig`
- `VoiceoverProvider`
- `EditorProvider`
- `DeckProducer`
- `StoryboardPlanner`

## Camera And Voiceover Providers

| Provider | Status | Notes |
| --- | --- | --- |
| Playwright camera rig | Supported alpha default | Portable browser capture for local and reachable web apps. |
| OBS camera rig | Experimental | Intended for studio capture; browser-source black-frame behavior still needs hardening. |
| Built-in silent voiceover | Supported alpha default | Creates productions without external voice services. |
| ElevenLabs voiceover | Supported alpha option | Configure with `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`. |

## Local Agent Use With MCP

Run the local MCP server over stdio:

```bash
npm run director -- mcp
```

MCP tools expose SDK operations while keeping browser sessions, localhost apps, private networks, OBS, credentials, and artifacts local:

- `director_scout_app`
- `director_draft_storyboard`
- `director_check_storyboard`
- `director_shoot_storyboard`
- `director_render_premiere`
- `director_get_dailies`

## A2A Stretch Adapter

Run the A2A-shaped Director Agent locally:

```bash
npm run director -- a2a --port 4129
```

Agent Card:

```text
http://localhost:4129/.well-known/agent-card.json
```

A2A endpoint:

```text
http://localhost:4129/a2a
```

Director maps production concepts to A2A this way:

- Production job: A2A Task.
- Approval gate: input-required task state.
- Progress: streaming task updates.
- Storyboard, dailies, Final Cut, Pitch Deck: artifacts.

See [A2A_DIRECTOR.md](./docs/A2A_DIRECTOR.md) for the product-level A2A design.

## Maturity Matrix

| Area | Alpha status |
| --- | --- |
| CLI + SDK | Publishable developer preview |
| Storyboard schema | Versioned, expected to evolve |
| Playwright capture | Supported default |
| Voiceover | Pluggable; silent and ElevenLabs providers available |
| Deck rendering | Supported editable PPTX output |
| MCP server | Local agent preview |
| A2A adapter | Stretch preview |
| OBS rig | Experimental |

## Public Release Hygiene

Generated and private material belongs under `.director/` or another ignored local dot directory. Do not commit real credentials, private app URLs, generated media, screenshots, transcripts, decks, or local demo material.

See [SECURITY.md](./SECURITY.md), [CONTRIBUTING.md](./CONTRIBUTING.md), and [docs/RELEASE.md](./docs/RELEASE.md) before publishing or accepting external contributions.
