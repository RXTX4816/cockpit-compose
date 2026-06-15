# Cockpit Docker Compose Plugin

[![CI](https://github.com/RXTX4816/cockpit-compose/actions/workflows/ci.yml/badge.svg)](https://github.com/RXTX4816/cockpit-compose/actions/workflows/ci.yml)
[![Packaging](https://github.com/RXTX4816/cockpit-compose/actions/workflows/pkg-ci.yml/badge.svg)](https://github.com/RXTX4816/cockpit-compose/actions/workflows/pkg-ci.yml)

Docker Compose management for [Cockpit](https://cockpit-project.org) — start, stop, and monitor your stacks from a clean web UI.

![Screenshot](docs/assets/overview.png)

## Features

- Dashboard listing all stacks with live status and container stats (auto-refreshing)
- Create new Compose Stacks or import existing ones - directly from the WebUI
- Start, stop, restart, pause/unpause, pull, prune and kill stacks with one click
- Live log viewer per stack
- Interactive shell into any running service
- YAML editor with syntax validation and auto-snapshot before saving + .ENV editor

## Requirements

- Cockpit 300+
- Docker with the Compose plugin (`docker compose` v2+)

## Prerequisites

Docker is not installed by default on most distros. Install it and make sure it is running and add your user to the docker group. Works with rootless docker by setting DOCKER_HOST env in OS.

```bash
sudo usermod -aG docker $USER
```
```bash
# Add this to your startup scripts (e.g. .zshrc) on your OS running cockpit and docker for rootless
export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock
```


Cockpit comes pre-installed on Fedora and most RHEL-based systems. On other distros it might need to be installed and started:

```bash
sudo systemctl enable --now cockpit.socket
```

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

**Requirements:** Node.js 20+, npm

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
| `npm run test` | Run tests |
| `npm run test:coverage` | Coverage report |

### Testing on Arch / Debian / Fedora

`scripts/test-vm.sh` spins up QEMU cloud VMs across three distros × three runtime scenarios
(`podman`, `docker`, `both`). Your `src/` folder is mounted live so `npm run watch` changes
appear in the browser without restarting anything.

This can be particularly useful when testing the new experimental podman feature, since that ensures a reproducible system.

```bash
sudo pacman -S qemu-full cloud-image-utils wget   # one-time
npm run build
npm run vm:init
npm run vm:startall # Wait until cockpit is up (~2 min)
# Open https://localhost:9093 — login: test / test
# To rebuild (Clean the data and images of qemu, after change to test-vm.sh):
npm run vm:rebuild
```

> `wait` runs `cloud-init status --wait` inside the VM and only exits once all packages
> are installed and cockpit.socket is active. Don't open the browser until it says ready.

```bash
./scripts/test-vm.sh status          # see all 9 VMs with ports and state
./scripts/test-vm.sh start podman    # start podman scenario on all three distros
./scripts/test-vm.sh clean debian    # wipe all three debian VMs (re-provisions on next start)
```

| VM | Cockpit | SSH |
|---|---|---|
| arch-podman | https://localhost:9090 | `ssh -p 2220 test@localhost` |
| arch-docker | https://localhost:9091 | `ssh -p 2221 test@localhost` |
| arch-both | https://localhost:9092 | `ssh -p 2222 test@localhost` |
| debian-podman | https://localhost:9093 | `ssh -p 2223 test@localhost` |
| debian-docker | https://localhost:9094 | `ssh -p 2224 test@localhost` |
| debian-both | https://localhost:9095 | `ssh -p 2225 test@localhost` |
| fedora-podman | https://localhost:9096 | `ssh -p 2226 test@localhost` |
| fedora-docker | https://localhost:9097 | `ssh -p 2227 test@localhost` |
| fedora-both | https://localhost:9098 | `ssh -p 2228 test@localhost` |

**VMs are persistent** — the disk is an overlay on the base image and survives stop/start cycles.
Only `clean` (wipes disk, re-provisions on next start) or `reset` (removes everything) destroy state.

**Script commands:**

| Command | What it does |
|---|---|
| `./scripts/test-vm.sh status` | Show which VMs are running and their ports |
| `./scripts/test-vm.sh start [arch\|debian\|fedora\|all]` | Start VM(s) in background |
| `./scripts/test-vm.sh wait [arch\|debian\|fedora]` | Block until cloud-init fully finishes |
| `./scripts/test-vm.sh stop [arch\|debian\|fedora\|all]` | Stop VM(s) |
| `./scripts/test-vm.sh ssh [arch\|debian\|fedora]` | Open SSH session |
| `./scripts/test-vm.sh logs [arch\|debian\|fedora]` | Tail serial console |
| `./scripts/test-vm.sh clean [arch\|debian\|fedora]` | Wipe disk and re-provision on next start |

**Useful commands inside the VM** (after `./scripts/test-vm.sh ssh debian`):

```bash
# Check podman and socket
sudo systemctl status podman.socket
sudo podman ps -a

# Check cockpit
sudo systemctl status cockpit.socket

# Check what compose binary was picked up
podman compose version        # if docker-compose is installed (external provider)
podman-compose version        # standalone Python implementation

# Verify the plugin is mounted from your host
ls /usr/share/cockpit/cockpit-compose/

# Start a test stack (podman-compose)
mkdir -p ~/test && cat > ~/test/docker-compose.yml << 'EOF'
services:
  app:
    image: busybox
    command: sh -c "while true; do echo hello; sleep 2; done"
EOF
cd ~/test && podman-compose up -d

# Check cloud-init logs if something went wrong
sudo cloud-init status --long
sudo journalctl -u cloud-init --no-pager -n 50
```

See [docs/wiki/VM-Testing.md](docs/wiki/VM-Testing.md) for all commands and troubleshooting.

## Translations

The UI language follows Cockpit's language setting.

<!-- i18n-coverage-start -->
| Language | Code | Coverage |
|---|---|---|
| English | `en` | 100% (source) |
| German | `de` | 100% |
| Polish | `pl` | 100% |
<!-- i18n-coverage-end -->

To add a new language, copy `src/i18n/locales/en.json`, translate the values, and register the file in `src/i18n/index.ts`.

## Contributing

Bug reports and feature requests: open an issue on [GitHub](https://github.com/RXTX4816/cockpit-compose/issues).

Pull requests are welcome. Please make sure your changes pass CI (lint, typecheck, tests, and build) before submitting. See [CONTRIBUTING.md](CONTRIBUTING.md) for commit conventions and development setup. Open an issue first for significant feature additions.

## License

MIT
