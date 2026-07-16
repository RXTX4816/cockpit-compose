# VM Testing

Automated QEMU VMs for testing cockpit-compose across three distros × three runtime scenarios.
The VM harness is provided by [`@rxtx4816/cockpit-plugin-base-react`](https://github.com/RXTX4816/cockpit-plugin-base-react) and invoked via `npm run vm <command>`. Plugin-specific config (VM names, ports, distro packages) lives in `scripts/test-vm.config.sh` in this repo.

The harness downloads official cloud images, provisions them with cloud-init, and mounts your local `src/` folder live into the VM — so `npm run watch` changes are visible in the browser without restarting anything.

## Scenarios

| Scenario | What's installed | Tests |
|---|---|---|
| `podman` | podman + podman-compose + docker-compose (standalone) | §7.2 external provider, §7.3 Python compose |
| `docker` | Docker CE + docker compose v2 plugin | All Docker scenarios |
| `both` | Both runtimes side by side | Runtime toggle (§6.21), §4 side-by-side |

VM identifiers are `<distro>-<scenario>`, e.g. `debian-podman`, `arch-both`.

**Shortcuts** — expand to all matching VMs:
- `arch` / `debian` / `fedora` → all three scenarios for that distro
- `podman` / `docker` / `both` → that scenario across all three distros
- `all` → all 9 VMs

## Prerequisites

Install QEMU and the cloud image tools (Arch Linux):

```bash
sudo pacman -S qemu-full cloud-image-utils wget
```

KVM must be accessible (`/dev/kvm`) for reasonable boot speed.
The script falls back to software emulation automatically if it isn't, but it will be slow.

## First-time setup

```bash
# 1. Download cloud base images (~500-700 MB each, one per distro)
npm run vm download debian        # just debian
npm run vm download               # all three distros

# 2. Build the plugin so src/main.js exists
npm run build
```

Images are saved to `.vms/<distro>/base.qcow2` (gitignored) and shared across all
scenarios for that distro — downloading once covers all three scenarios.

## Starting a VM

```bash
npm run vm start debian-podman   # specific VM
npm run vm start debian          # all three debian scenarios
npm run vm start podman          # podman scenario on all three distros
npm run vm start                 # all 9 VMs (needs ~18 GB RAM)
```

The VM boots in the background. Block until cloud-init finishes:

```bash
npm run vm wait debian-podman
```

`wait` polls SSH then runs `cloud-init status --wait` inside the VM. It warns if
cockpit doesn't come up. **Docker VMs take longer (~5 min first boot)** because
Docker CE is downloaded from the internet during provisioning.

Then open the URL and accept the self-signed certificate.

## Access

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

**Login:** `test` / `test` (your `~/.ssh/id_*.pub` is also injected automatically if found)

## Useful commands

| Command | What it does |
|---|---|
| `npm run vm status` | Show all 9 VMs with state and ports |
| `npm run vm download [distro\|all]` | Download base cloud images |
| `npm run vm build` | `npm run build` shortcut |
| `npm run vm start <vm\|shortcut>` | Start VM(s) in background |
| `npm run vm wait <vm>` | Block until cloud-init fully finishes |
| `npm run vm stop <vm\|shortcut>` | Stop VM(s) |
| `npm run vm ssh <vm>` | Open SSH session |
| `npm run vm logs <vm>` | Tail serial console output |
| `npm run vm clean <vm\|shortcut>` | Wipe disk + re-provision on next start |
| `npm run vm reset <distro>` | Remove all files including base image |

## Live editing

The `src/` directory on your host is mounted read-only into the VM at
`/usr/share/cockpit/cockpit-compose` via 9p virtfs. Start watch mode on the host
and just refresh the browser in the VM:

```bash
npm run watch
```

No file copying or VM restarts needed.

## What each scenario installs

| Package | podman | docker | both |
|---|---|---|---|
| cockpit | ✓ | ✓ | ✓ |
| passt | ✓ | — | ✓ |
| podman | ✓ | — | ✓ |
| podman-compose | ✓ | — | ✓ |
| docker-compose (standalone, Arch/Debian) | ✓ | — | ✓ |
| Docker CE + compose v2 plugin | — | ✓ | ✓ |

**podman scenario notes:**
- `docker-compose` standalone (v1 on Debian, v2 on Arch) enables the `podman compose`
  external provider path even without the Docker daemon — testing guide §7.2
- `podman-compose` (Python) covers the no-`compose ls` fallback — testing guide §7.3
- Fedora gets only `podman-compose` since `docker-compose` standalone isn't in its default repos

**docker scenario notes:**
- Docker CE is installed from Docker's official repository during first boot
  (not distro repos), so first boot takes ~5 min instead of ~2 min
- Adds `test` user to the `docker` group

**both scenario notes:**
- Both runtimes installed; use the runtime toggle in the UI to switch between them
- Tests testing guide §4 (side by side) and §6.21 (runtime toggle)

The rootful Podman socket (`/run/podman/podman.sock`) is enabled and
`pasta` is configured as the default rootless network backend to avoid
the nftables error common on newer kernels.

## Reprovisioning

VMs use an overlay disk over the base image. The base is never modified.

```bash
# Wipe one VM's disk and cloud-init state; next start re-provisions from scratch
npm run vm clean debian-podman

# Wipe all debian VMs at once (shortcut)
npm run vm clean debian

# Remove everything for a distro including the shared base image
npm run vm reset debian
```

`clean` is the go-to fix when cloud-init fails or you want to test a fresh install
without re-downloading the base image. Each scenario gets its own overlay disk, so
cleaning `debian-podman` doesn't affect `debian-docker`.

Note that the Arch image is a rolling release — if you downloaded it a while ago
and want a fresh snapshot, use `reset arch` then `download arch`.

## Environment overrides

```bash
VM_MEM=4096 VM_CPUS=4 npm run vm start fedora
```

| Variable | Default | Description |
|---|---|---|
| `VM_MEM` | `1024` | RAM in MB |
| `VM_CPUS` | `2` | vCPU count |
| `VM_DISK_SIZE` | `12G` | Overlay disk size |

## Managing resource usage across the matrix

Starting all 9 VMs at once (`npm run vm start`) needs ~9 GB of RAM at the
default `VM_MEM=1024`, plus 18 vCPUs — enough to bog down most dev machines.
There's no built-in concurrency limiter (VMs launch back-to-back as
daemonized QEMU processes), so manage this by controlling *what* you start:

- **Day-to-day development and most feature tests**: use a single distro's
  three scenarios instead of the full matrix — behavior for app-level logic
  (stack CRUD, YAML editor, etc.) doesn't depend on the distro.
  ```bash
  npm run vm start arch      # arch-podman, arch-docker, arch-both — ~3 GB RAM
  npm run vm wait arch
  npm run test:e2e -- --project=arch-podman --project=arch-docker --project=arch-both
  npm run vm stop arch
  ```
- **Full 9-VM matrix** (needed for rootless/rootful and distro-specific
  quirks — see testing guide §7): run it in batches, one distro at a time,
  rather than starting all 9 concurrently:
  ```bash
  for distro in arch debian fedora; do
    npm run vm start "$distro"
    npm run vm wait "$distro"
    npm run test:e2e -- --project="$distro-podman" --project="$distro-docker" --project="$distro-both"
    npm run vm stop "$distro"
  done
  ```
  This caps peak usage to one distro's VMs instead of all 9 at once.

**Don't go below the `VM_MEM=1024` default — go above it for the heavier
specs.** Earlier guidance here suggested `VM_MEM=768` was safe since the
fixture stacks are individually lightweight, but live testing during the
issue #227 e2e expansion found the *default* 1024 MB itself is already too
tight once a spec brings up something like `volumes-test` (runs Postgres)
or drives a real exec/PTY session (`exec.spec.ts`) — `free -h` inside the
guest showed it swapping internally (only ~950 MB total RAM, actively
using swap) under that load, which manifests as flaky timeouts that look
like app bugs but aren't. If you're running `logs.spec.ts`, `exec.spec.ts`,
`prune.spec.ts`, or `scale.spec.ts` — or the full suite — start those VMs
with more headroom:
```bash
VM_MEM=2048 npm run vm start arch-docker
```
`logs.spec.ts` went from consistently failing to consistently passing after
bumping a VM from 1024 → 2048 MB with no code changes. See "Known flaky
behavior" in [E2E Test Reference](E2E-Test-Reference.md) for the full
writeup.

## Automated browser tests (Playwright)

Once a VM is up, run the Playwright E2E suite against it. Each VM is a Playwright project named after its VM identifier — use `--project` to select which VM(s) to test:

```bash
# Start and wait for a VM
npm run vm start debian-podman
npm run vm wait debian-podman

# Run against that specific VM
npm run test:e2e -- --project=debian-podman

# Run against a subset (all must be running)
npm run test:e2e -- --project=arch-podman --project=debian-docker

# Run against all 9 VMs (requires all to be running)
npm run test:e2e

# Visual runner — shows every step, ideal for debugging failures
npm run test:e2e:ui

# Record a new test interactively
BASE_URL=https://localhost:9093 npm run test:e2e:codegen
```

Check which VMs are currently running before selecting projects:

```bash
npm run vm status
```

Tests live in `e2e/` and cover the login flow, stack list, status badges, YAML editor, and more. All test stacks are pre-staged during VM provisioning — no manual setup required.

For full documentation including how to write new tests, see the [Testing Guide](../testing.md).

---

## Troubleshooting

**`wait` exits but Cockpit page is not accessible**
SSH is available before cloud-init finishes installing packages. Use `wait` (not just
`start`) — it runs `cloud-init status --wait` inside the VM to block until everything
is done. If `wait` reports a warning, SSH in and check:
```bash
npm run vm ssh debian
sudo cloud-init status --long
sudo journalctl -u cloud-init --no-pager -n 50
```

**cloud-init reports a package install error (exit code 100)**
A package name was wrong or unavailable. The most common cause on Debian is using
`docker-compose-v2` (not in default repos) instead of `docker-compose`. Clean and retry:
```bash
npm run vm clean debian
npm run vm start debian
npm run vm wait debian
```

**VM won't start / QEMU error about virtfs**
`qemu-base` doesn't include virtfs support. Install `qemu-full`:
```bash
sudo pacman -S qemu-full
```

**Cockpit loads but cockpit-compose is missing**
The 9p mount failed. SSH in and check:
```bash
mount | grep cockpit
ls /usr/share/cockpit/cockpit-compose/
# If missing:
sudo modprobe 9p 9pnet 9pnet_virtio
sudo mount /usr/share/cockpit/cockpit-compose
```

**First boot is very slow**
Expected without KVM. Make sure your user is in the `kvm` group:
```bash
sudo usermod -aG kvm $USER   # then log out and back in
```

**"crun: sd-bus call: Interactive authentication required / OCI permission denied" when starting containers**
Rootless Podman needs a systemd user session, but the `test` user doesn't have one when accessed
via Cockpit without lingering enabled. Fix for a running VM:
```bash
npm run vm ssh debian
sudo loginctl enable-linger test
mkdir -p /home/test/.config/containers
echo -e '[network]\ndefault_rootless_network_cmd = "pasta"' > /home/test/.config/containers/containers.conf
```
`enable-linger` gives the user a persistent session. Switching to `pasta` for networking
removes the dependency on the systemd user.slice entirely (pasta handles everything in userspace).
Both are set automatically on newly provisioned VMs.

**"short-name did not resolve to an alias" when pulling images**
Podman on Debian and Fedora doesn't search Docker Hub by default. Fix by adding `docker.io`
as an unqualified search registry in the running VM:
```bash
npm run vm ssh debian
echo 'unqualified-search-registries = ["docker.io"]' | sudo tee /etc/containers/registries.conf.d/docker-io.conf
```
This is set automatically on newly provisioned VMs. For an existing VM that's missing it,
the one-liner above is enough — no reboot required.

**Port already in use**
Change the port constants in `scripts/test-vm.config.sh`:
```bash
DEBIAN_SSH_PORT=2221
DEBIAN_COCKPIT_PORT=9091
```
