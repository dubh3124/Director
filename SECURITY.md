# Security Policy

## Supported Versions

Director, published from the `ai-recorder` package, is currently a public alpha. Security fixes target the latest published alpha unless a maintainer announces otherwise.

| Version | Supported |
| --- | --- |
| `0.1.x-alpha` | Yes |
| Earlier versions | No |

## Reporting a Vulnerability

Do not report suspected vulnerabilities in public issues.

After the GitHub repository is created, use GitHub Security Advisories for private vulnerability reports. Until that channel is enabled, contact the package maintainer listed in `package.json`.

Please include:

- Affected version or commit.
- Reproduction steps.
- Impact and expected behavior.
- Whether secrets, private URLs, recordings, decks, or local artifacts may have been exposed.

## Secret Handling

Director is local-first and may operate browsers, local apps, private networks, OBS, and filesystem artifacts. Treat storyboards, dailies, transcripts, screenshots, videos, and generated decks as potentially sensitive.

Never commit:

- `.env` files or real API keys.
- Private app URLs, tailnet hostnames, tenant names, customer names, credentials, or tokens.
- `.director/` outputs, generated media, raw screenshots, transcripts, or local demo material.
- Local bridge scripts that embed credentials or private endpoints.

Use placeholder environment variable names in examples, such as `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, and `OBS_WEBSOCKET_PASSWORD`.
