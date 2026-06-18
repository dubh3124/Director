# Release Checklist

This project is currently prepared for `v0.1.0-alpha` style releases.

## Before The First GitHub Release

1. Create the GitHub repository.
2. Add the remote:

   ```bash
   git remote add origin <github-repo-url>
   ```

3. Fill `repository`, `homepage`, and `bugs` in `package.json`.
4. Enable GitHub Security Advisories.
5. Confirm branch protection and required CI checks.

## Local Verification

Run from a clean checkout:

```bash
npm ci
npx playwright install chromium
npm run release:check
```

`release:check` runs:

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm run pack:dry`

Also run the security sweep in [SECURITY_SWEEP.md](./SECURITY_SWEEP.md).

## Inspect The Package

Review the package contents before publishing:

```bash
npm pack --dry-run --json
```

The package must not include:

- `productions/`
- `.director/`
- `.env` files
- generated media, screenshots, transcripts, or decks
- private URLs, credentials, tenant names, or local absolute paths

The package should include only compiled `dist`, public docs, public examples, package metadata, and the license/governance files.

## Versioning

Use semver prereleases during alpha:

```bash
npm version 0.1.0-alpha.1
```

For later alpha releases:

```bash
npm version prerelease --preid alpha
```

## Publish

```bash
npm publish --access public --tag alpha
```

After publishing:

1. Push commits and tags.
2. Create a GitHub release marked as prerelease.
3. Include known limitations, especially that OBS is experimental.
4. Confirm the npm package page renders README content correctly.
