# Cockpit Docker/Podman Compose Plugin

[![CI](https://github.com/RXTX4816/cockpit-compose/actions/workflows/ci.yml/badge.svg)](https://github.com/RXTX4816/cockpit-compose/actions/workflows/ci.yml)
[![Packaging](https://github.com/RXTX4816/cockpit-compose/actions/workflows/pkg-ci.yml/badge.svg)](https://github.com/RXTX4816/cockpit-compose/actions/workflows/pkg-ci.yml)

Docker and Podman Compose management for [Cockpit](https://cockpit-project.org) — start, stop, and monitor your stacks from a clean web UI.

![Screenshot](docs/assets/overview.png)

## Features

- Dashboard listing all stacks with live status and container stats (auto-refreshing)
- Search and filter stacks by name and status
- Create new Compose Stacks or import existing ones directly from the WebUI
- Start, stop, restart, pause/unpause, pull, prune, scale, and kill stacks with one click
- Live log viewer per stack with per-service filtering and text search
- Interactive shell into any running service
- YAML editor with syntax validation, diff view, auto-snapshot + .ENV editor
- Backup and restore stacks as `.bak.tar.gz` archives
- Docker and Podman support

## Requirements

- Cockpit 300+
- Docker with the Compose plugin (`docker compose` v2+), **or** Podman with `podman compose` (Can run both at once, also supports rootless)

## Prerequisites

Cockpit comes pre-installed on Fedora and most RHEL-based systems. On other distros:

```bash
sudo systemctl enable --now cockpit.socket
```

Docker is not installed by default on most distros. Install it and add your user to the docker group:

```bash
sudo usermod -aG docker $USER
```

For rootless Docker or Podman, see [Podman Compatibility](docs/wiki/Podman-Compatibility.md) in the wiki.

## Installation

### Arch Linux

```bash
paru -S cockpit-compose
```

### Fedora / RHEL / CentOS Stream / openSUSE

Download the `.rpm` from the [Releases](https://github.com/RXTX4816/cockpit-compose/releases) page:

```bash
sudo rpm -i cockpit-compose-X.Y.Z-1.noarch.rpm
```

### Debian / Ubuntu / Linux Mint / Pop!\_OS

Download the `.deb` from the [Releases](https://github.com/RXTX4816/cockpit-compose/releases) page:

```bash
sudo apt install ./cockpit-compose_X.Y.Z-1_all.deb
```

### Manual

Download the latest release tarball from the [Releases](https://github.com/RXTX4816/cockpit-compose/releases) page.

```bash
tar -xzf cockpit-compose-X.Y.Z.tar.gz
sudo mkdir -p /usr/share/cockpit/cockpit-compose
sudo cp -r cockpit-compose/* /usr/share/cockpit/cockpit-compose/
```

Then open Cockpit in your browser or hard-refresh the page — **Docker Compose** appears in the left navigation.

## Development

**Requirements:** Node.js 22+, npm

```bash
git clone https://github.com/RXTX4816/cockpit-compose.git
cd cockpit-compose
npm install
npm run build
```

To develop with live reload inside Cockpit, symlink the plugin:

```bash
mkdir -p ~/.local/share/cockpit
ln -s "$PWD/src" ~/.local/share/cockpit/cockpit-compose
npm run watch
```

Open `http://localhost:9090` — **Docker Compose** appears in the sidebar automatically.

| Command | Description |
|---|---|
| `npm run build` | Production build |
| `npm run watch` | Build with file watching |
| `npm run typecheck` | TypeScript type check |
| `npm run lint` | ESLint |
| `npm run test` | Run unit tests |
| `npm run test:coverage` | Unit test coverage report |
| `npm run test:e2e` | Run Playwright E2E tests (requires a running VM) |
| `npm run test:e2e:ui` | Playwright visual test runner |
| `npm run test:e2e:codegen` | Record new E2E tests by clicking through the UI |

### Base library

This plugin builds on [`@rxtx4816/cockpit-plugin-base-react`](https://github.com/RXTX4816/cockpit-plugin-base-react) — a shared foundation that provides bootstrapping, dark theme sync, i18n setup, reusable hooks and components, shared tooling config (TypeScript, ESLint, Vitest), and the QEMU VM test harness.

If you need to develop the base library and this plugin together locally, use [yalc](https://github.com/wclr/yalc):

```bash
# In the cockpit-plugin-base-react repo
yalc publish            # or: yalc push (auto-pushes on change)

# In this repo
npm run base:add        # links the local yalc version
# ... make changes and test ...
npm run base:reset      # restores the npm registry version
```

### VM Testing

QEMU VMs for testing across Arch, Debian, and Fedora with Docker, Podman, and both-runtime scenarios. Your `src/` folder is mounted live so `npm run watch` changes appear in the browser without restarting anything. The VM harness is provided by the base library; plugin-specific config lives in `scripts/test-vm.config.sh`.

```bash
sudo pacman -S qemu-full cloud-image-utils wget   # one-time
npm run build
npm run vm download          # download base images (~500–700 MB each)
npm run vm start             # start all 9 VMs
# Open https://localhost:9090 — login: test / test
```

### E2E browser tests (Playwright)

Once a VM is running, Playwright drives Chromium against the live Cockpit UI. Each VM is a separate Playwright project — use `--project` to target one or more:

```bash
npm run vm start debian-podman && npm run vm wait debian-podman
npm run test:e2e -- --project=debian-podman   # single VM
npm run test:e2e                              # all 9 VMs (all must be running)
npm run test:e2e:ui                           # visual runner (great for debugging)
```

Tests live in `e2e/` and cover login, stack list, YAML editor, and more. Check `npm run vm status` for running VMs and their ports.

See [docs/wiki/VM-Testing.md](docs/wiki/VM-Testing.md) for all VM ports, commands, and troubleshooting.

## Translations

The UI language follows Cockpit's language setting.

<!-- i18n-coverage-start -->
| Coverage | Languages |
|---|---|
| 100% | English (`en`) — source |
| 97% | `de`, `pl` |
| 95% | `ar`, `cs`, `es`, `fi`, `fr`, `he`, `id`, `it`, `ja`, `ka`, `ko`, `nl`, `pt-BR`, `ro`, `ru`, `sk`, `sv`, `tr`, `uk`, `zh-CN`, `zh-TW` |
<!-- i18n-coverage-end -->

To add a new language, copy `src/i18n/locales/en.json`, translate the values, and register the file in `src/i18n/index.ts`.

## Contributing

Bug reports and feature requests: open an issue on [GitHub](https://github.com/RXTX4816/cockpit-compose/issues).

Pull requests are welcome. Please make sure your changes pass CI (lint, typecheck, tests, and build) before submitting. See [CONTRIBUTING.md](CONTRIBUTING.md) for commit conventions and development setup. Open an issue first for significant feature additions.

## Security

Found a security vulnerability? Please report it privately — see [SECURITY.md](SECURITY.md) for the disclosure process. Do not open a public issue for security reports.

## License

MIT
