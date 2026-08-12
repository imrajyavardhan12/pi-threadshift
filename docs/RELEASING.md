# Releasing Threadshift

## Release model

Threadshift is published to the public npm registry. `pi.dev/packages` is a gallery over npm metadata, not a separate package registry.

The gallery's current implementation queries the npm Search API for `keywords:pi-package`, then fetches each package's `latest` manifest. There is no separate upload or repository-submission step.

## One-time trusted-publisher setup

Future releases publish from `.github/workflows/publish.yml` through npm trusted publishing. No npm token belongs in GitHub secrets.

In the npm settings for `pi-threadshift`, configure a GitHub Actions trusted publisher with these case-sensitive values:

- Organization or user: `imrajyavardhan12`
- Repository: `pi-threadshift`
- Workflow filename: `publish.yml`
- Environment: `npm`
- Allowed action: `npm publish`

The repository's protected GitHub environment named `npm` has a required reviewer (`imrajyavardhan12`), no wait timer, and a deployment policy limited to tags matching `v*`. Self-review remains allowed so the sole maintainer can approve a release. The workflow uses a GitHub-hosted runner, grants only `contents: read` and `id-token: write`, validates that the tag matches `package.json`, and refuses tags whose commit is not on `main`. Trusted publishing generates npm provenance automatically for this public package.

After the first trusted publication succeeds, configure npm publishing access to **Require two-factor authentication and disallow tokens**. That setting continues to permit trusted publishing while rejecting long-lived write tokens.

## Prerequisites

- Clean, protected `main` branch with passing CI
- The Node.js runtime declared in `.nvmrc` selected with the existing runtime manager
- npm trusted-publisher settings matching the workflow and GitHub environment above
- The target package version does not already exist on npm

## Prepare a release

1. Update the version in `package.json`.
2. Move release notes from **Unreleased** in `CHANGELOG.md`.
3. Run:

   ```bash
   nvm use # when using NVM
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

5. Open a pull request for the release changes, wait for every required check, and merge it into `main`.

## Publish

Create an annotated tag from the merged release commit. The tag must exactly equal `v` followed by the version in `package.json`:

```bash
git switch main
git pull --ff-only
version=$(node --print "require('./package.json').version")
git tag -a "v$version" -m "pi-threadshift v$version"
git push origin "v$version"
```

The tag starts the protected `Publish` workflow. Approve its `npm` environment deployment after confirming the tag, commit, and version. The workflow publishes `*-beta.*` versions under `beta`, stable versions under `latest`, and rejects other prerelease identifiers.

Verify the registry artifact rather than the working tree:

```bash
pnpm view "pi-threadshift@$version" name version dist-tags keywords dist.integrity
pnpm exec pi --no-extensions -e "npm:pi-threadshift@$version" --list-models gpt-5.6-sol
```

Inspect the registry tarball if the workflow output differs from the reviewed package dry run. Then create the GitHub release from the changelog, marking prereleases appropriately. Never reuse or move a published release tag.

## `pi.dev/packages` discovery

The package already declares both requirements:

- `keywords` contains `pi-package`
- `pi.extensions` contains `./extensions/threadshift.ts`

Every published version has a canonical direct page at <https://pi.dev/packages/pi-threadshift>. The gallery caches browser data for 15 minutes.

Browse/search inclusion is less reliable: the gallery paginates npm's broad `keywords:pi-package` search, and npm can omit new packages with low search scores from the accessible result window. A valid package may therefore have a working direct page while remaining absent from browse/search. Republishing unchanged metadata is not a remedy.

The gallery currently builds an unversioned install command and fetches `/latest`. Inspect dist-tags after every publication:

```bash
pnpm view pi-threadshift dist-tags
```

npmjs.org assigns `latest` on a package's first publication even when that version is published with another tag. The first `0.1.0-beta.1` publication therefore set both `beta` and `latest`, making this initial beta the public default and allowing the gallery's unversioned install command to work.

Once a stable version owns `latest`, subsequent prereleases published with `--tag beta` leave `latest` on stable and remain opt-in through `npm:pi-threadshift@beta`. Do not move `latest` to a later prerelease accidentally; replace it with the stable version when stable is released.

To inspect exact-name npm search metadata separately from the broad gallery query:

```bash
curl -sG 'https://registry.npmjs.org/-/v1/search' \
  --data-urlencode 'text=threadshift' \
  --data-urlencode 'size=20'
```

## Stable release

When beta compatibility and recovery behavior are proven, prepare `0.1.0` and use the same protected tag workflow. It assigns `latest` to stable while retaining `beta` for prereleases. Verify installation with `pi install npm:pi-threadshift` and verify the direct pi.dev package page.

## Sources

- Pi package documentation: <https://pi.dev/docs/latest/packages>
- Pi gallery: <https://pi.dev/packages>
- Gallery implementation: <https://github.com/earendil-works/pi-website/blob/main/src/packages.html>
- npm dist-tags: <https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/>
- npm first-publication dist-tag behavior: <https://github.com/npm/cli/issues/8490#issuecomment-3164821719>
- npm trusted publishing: <https://docs.npmjs.com/trusted-publishers/>
- npm provenance: <https://docs.npmjs.com/generating-provenance-statements/>
