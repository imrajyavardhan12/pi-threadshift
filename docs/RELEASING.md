# Releasing Threadshift

## Release model

Threadshift is published to the public npm registry. `pi.dev/packages` is a gallery over npm metadata, not a separate package registry.

The gallery's current implementation queries the npm Search API for `keywords:pi-package`, then fetches each package's `latest` manifest. There is no separate upload or repository-submission step.

## Prerequisites

- Clean `main` branch with passing CI
- npm account with publish access to `pi-threadshift`
- Working registry authentication (`pnpm whoami`)
- Any npm 2FA requirement satisfied

## Prepare a release

1. Update the version in `package.json`.
2. Move release notes from **Unreleased** in `CHANGELOG.md`.
3. Run:

   ```bash
   pnpm install --frozen-lockfile
   pnpm release:check
   pnpm pack --dry-run
   ```

4. Inspect the exact tarball before publishing:

   ```bash
   pnpm pack
   tar -tf pi-threadshift-*.tgz
   rm pi-threadshift-*.tgz
   ```

5. Commit and push the release changes; wait for CI.

## Publish the beta

Authenticate if necessary:

```bash
pnpm login
pnpm whoami
```

Publish the prerelease under the beta dist-tag:

```bash
pnpm publish --tag beta --access public
```

Verify the registry artifact rather than the working tree:

```bash
pnpm view pi-threadshift@0.1.0-beta.1 name version dist-tags keywords
pi -e npm:pi-threadshift@0.1.0-beta.1
```

Then create and push `v0.1.0-beta.1`, and create a GitHub prerelease from the changelog.

## `pi.dev/packages` discovery

The package already declares both requirements:

- `keywords` contains `pi-package`
- `pi.extensions` contains `./extensions/threadshift.ts`

After npm publishes and indexes the package, the gallery discovers it automatically. The gallery caches results in each browser for 15 minutes, so a newly indexed package may not appear immediately.

The gallery currently builds an unversioned install command and fetches `/latest`. Inspect dist-tags after every publication:

```bash
pnpm view pi-threadshift dist-tags
```

npmjs.org assigns `latest` on a package's first publication even when that version is published with another tag. The first `0.1.0-beta.1` publication therefore set both `beta` and `latest`, making this initial beta the public default and allowing the gallery's unversioned install command to work.

Once a stable version owns `latest`, subsequent prereleases published with `--tag beta` leave `latest` on stable and remain opt-in through `npm:pi-threadshift@beta`. Do not move `latest` to a later prerelease accidentally; replace it with the stable version when stable is released.

To inspect npm search indexing directly:

```bash
curl -sG 'https://registry.npmjs.org/-/v1/search' \
  --data-urlencode 'text=keywords:pi-package pi-threadshift' \
  --data-urlencode 'size=20'
```

## Stable release

When beta compatibility and recovery behavior are proven:

```bash
pnpm publish --tag latest --access public
```

Verify installation with `pi install npm:pi-threadshift`, then check `https://pi.dev/packages` after npm search indexing and the gallery cache have refreshed.

## Sources

- Pi package documentation: <https://pi.dev/docs/latest/packages>
- Pi gallery: <https://pi.dev/packages>
- Gallery implementation: <https://github.com/earendil-works/pi-website/blob/main/src/packages.html>
- npm dist-tags: <https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/>
- npm first-publication dist-tag behavior: <https://github.com/npm/cli/issues/8490#issuecomment-3164821719>
