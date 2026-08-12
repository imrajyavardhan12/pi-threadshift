# Project Instructions

## Runtime boundary

- Use the exact project runtime declared in `.nvmrc` through the machine's existing runtime manager; do not infer a runtime from the newest version installed.
- When NVM is already installed, select the already-installed project runtime in a command shell with:

  ```bash
  export NVM_DIR="$HOME/.nvm"
  . "$NVM_DIR/nvm.sh"
  nvm use
  ```

- Ask for confirmation before installing or removing a runtime or runtime manager, changing a machine default such as NVM's `default` alias, installing global npm packages, enabling machine-wide tooling, or editing shell/runtime configuration.
- Never change the workstation's default Node version to satisfy this project.
- Use project-local tools through `pnpm` or `pnpm exec`; do not depend on a globally installed Pi.

## Validation

Run the focused checks relevant to the change. Before completing a code change, run the full local suite:

```bash
pnpm check
pnpm test
PI_OFFLINE=1 pnpm smoke
pnpm pack --dry-run
pnpm audit --prod
```

Add a regression test for behavior changes and bug fixes. Keep changes focused and avoid unrelated dependency or formatting churn.
