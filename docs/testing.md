# Testing Guide

End-to-end manual testing reference for cockpit-compose. Covers every supported setup
combination, test stack definitions, and a step-by-step scenario for every UI feature.

---

## Table of Contents

1. [Plugin Installation](#1-plugin-installation)
2. [Docker-Only Setup](#2-docker-only-setup)
3. [Podman-Only Setup](#3-podman-only-setup)
4. [Docker + Podman Side by Side](#4-docker--podman-side-by-side)
5. [Test Stacks](#5-test-stacks)
6. [Feature Scenarios](#6-feature-scenarios)
7. [Runtime-Specific Scenarios](#7-runtime-specific-scenarios)
8. [Known Issues & Workarounds](#8-known-issues--workarounds)

---

## 1. Plugin Installation

### Build the plugin

```bash
git clone https://github.com/RXTX4816/cockpit-compose
cd cockpit-compose
npm install
npm run build
```

### Install into Cockpit (per-user)

```bash
mkdir -p ~/.local/share/cockpit
ln -s "$(pwd)/dist" ~/.local/share/cockpit/cockpit-compose
```

### Development (watch mode)

```bash
npm run build:watch
# Changes are picked up automatically — refresh the Cockpit page
```

### Enable and open Cockpit

**Arch Linux:**
```bash
sudo systemctl enable --now cockpit.socket
```

**Debian / Ubuntu:**
```bash
sudo apt install cockpit
sudo systemctl enable --now cockpit.socket
```

**Fedora / RHEL / CentOS Stream:**
```bash
sudo dnf install cockpit
sudo systemctl enable --now cockpit.socket
```

Open `https://localhost:9090` in a browser, log in, and navigate to **Applications → Compose Stacks**.

---

## 2. Docker-Only Setup

### Arch Linux

```bash
sudo pacman -S docker docker-compose
sudo systemctl enable --now docker.socket

# Allow your user to run docker without sudo
sudo usermod -aG docker $USER
newgrp docker   # or log out and back in
```

### Debian / Ubuntu

```bash
# Official Docker repo (recommended over distro package)
sudo apt remove docker docker.io containerd runc  # remove old versions
sudo apt update && sudo apt install ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update && sudo apt install docker-ce docker-ce-cli containerd.io docker-compose-plugin

sudo systemctl enable --now docker
sudo usermod -aG docker $USER && newgrp docker
```

### Fedora / RHEL

```bash
sudo dnf install docker docker-compose-plugin
# OR use the official repo:
sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf install docker-ce docker-ce-cli docker-compose-plugin

sudo systemctl enable --now docker
sudo usermod -aG docker $USER && newgrp docker
```

### Verify Docker

```bash
docker version
docker compose version
docker run --rm hello-world
```

---

## 3. Podman-Only Setup

> These steps assume Docker is **not** installed. The app handles this automatically by
> switching to `podman ps` label-based stack discovery when `compose ls` is unavailable.

### 3.1 Install Podman

**Arch Linux:**
```bash
sudo pacman -S podman
```

**Debian / Ubuntu (≥ 22.04):**
```bash
sudo apt update && sudo apt install podman
```

**Fedora / RHEL:**
```bash
sudo dnf install podman
```

### 3.2 Install a Compose Provider

Podman itself does not include a compose command — you need one of the two providers below.

#### Option A — `podman compose` (delegates to docker-compose)

This is the default when Docker Compose is installed. Podman wraps it automatically and routes
calls to the Podman socket instead of the Docker daemon.

**Arch:**
```bash
sudo pacman -S docker-compose    # installs /usr/lib/docker/cli-plugins/docker-compose
# do NOT install the docker daemon package
```

**Debian / Ubuntu:**
```bash
sudo apt install docker-compose-v2
```

**Fedora / RHEL:**
```bash
sudo dnf install docker-compose-plugin
```

Verify:
```bash
podman compose version
# Expected output:
# >>>> Executing external compose provider "/usr/lib/docker/cli-plugins/docker-compose" <<<<
# Docker Compose version v2.x.x
```

#### Option B — `podman-compose` (standalone Python implementation)

Does not support `compose ls`. The app detects this and falls back to `podman ps`
label-based stack discovery automatically.

**Arch:**
```bash
sudo pacman -S podman-compose
```

**Debian / Ubuntu:**
```bash
sudo apt install podman-compose
# or: pip3 install podman-compose
```

**Fedora / RHEL:**
```bash
sudo dnf install podman-compose
# or: pip3 install podman-compose
```

Verify:
```bash
podman-compose version
```

### 3.3 Enable the Podman Socket (required for Cockpit)

The app detects the Podman socket and sets `DOCKER_HOST` so that docker-compose routes to
Podman instead of Docker.

```bash
# Rootless (per-user) — recommended
systemctl --user enable --now podman.socket
systemctl --user status podman.socket   # should show "active (listening)"

# Verify socket path
ls /run/user/$(id -u)/podman/podman.sock
```

For rootful Podman (system-wide):
```bash
sudo systemctl enable --now podman.socket
ls /run/podman/podman.sock
```

### 3.4 Fix Networking: Install pasta (rootless Podman)

Rootless Podman uses `netavark` for networking, which calls `nft` (nftables). On many kernels
this fails in rootless mode with:

```
netavark (exit code 1): nftables error: "nft" did not return successfully
```

The fix is to use `pasta` instead, which handles networking entirely in userspace:

**Arch:**
```bash
sudo pacman -S passt
```

**Debian / Ubuntu:**
```bash
sudo apt install passt
```

**Fedora / RHEL:**
```bash
sudo dnf install passt
```

Then configure Podman to use it:
```bash
mkdir -p ~/.config/containers
cat >> ~/.config/containers/containers.conf << 'EOF'
[network]
default_rootless_network_cmd = "pasta"
EOF
```

Verify pasta is active:
```bash
podman info | grep -i network
# Should show: networkBackend: netavark
# pasta is used per-container, not as the global backend

# Test with a container that needs networking:
podman run --rm alpine ping -c 1 1.1.1.1
```

### 3.5 Verify full Podman setup

```bash
podman version
podman info | grep -i rootless
systemctl --user status podman.socket
podman compose version    # if using docker-compose provider
podman run --rm hello-world
```

---

## 4. Docker + Podman Side by Side

Both can coexist. Install both runtimes following sections 2 and 3. The runtime toggle in
the UI switches between them. Key points:

- The app sets `DOCKER_HOST` per-command when Podman is active — no global env var conflict.
- Docker socket: `/var/run/docker.sock` (or rootless: `$XDG_RUNTIME_DIR/docker.sock`)
- Podman socket: `/run/user/<uid>/podman/podman.sock` (rootless) or `/run/podman/podman.sock`

Make sure BOTH sockets are active:
```bash
systemctl status docker.socket
systemctl --user status podman.socket
```

---

## 5. Test Stacks

Create these under separate directories. All stacks are minimal and avoid external networks
to keep setup simple.

### 5.1 Minimal Single Service

```bash
mkdir -p ~/testcompose/gotify && cat > ~/testcompose/gotify/docker-compose.yml << 'EOF'
services:
  gotify:
    image: gotify/server
    ports:
      - "8080:80"
    environment:
      GOTIFY_DEFAULTUSER_PASS: admin
    volumes:
      - ./data:/app/data
EOF
```

Start it:
```bash
cd ~/testcompose/gotify && docker compose up -d
# or for Podman: podman compose up -d
```

### 5.2 Multi-Service Stack

Tests container table, service count badge, per-service log filter, and exec.

```bash
mkdir -p ~/testcompose/multi && cat > ~/testcompose/multi/docker-compose.yml << 'EOF'
services:
  web:
    image: nginx:alpine
    ports:
      - "8081:80"
  cache:
    image: redis:alpine
  worker:
    image: busybox
    command: sh -c "while true; do echo worker-tick; sleep 3; done"
EOF
```

### 5.3 Stack with Profiles

Tests profile selector in Up dialog, partial start behavior.

```bash
mkdir -p ~/testcompose/profiles && cat > ~/testcompose/profiles/docker-compose.yml << 'EOF'
services:
  app:
    image: nginx:alpine
    ports:
      - "8082:80"
  debug:
    image: busybox
    profiles: [dev]
    command: sleep infinity
  monitoring:
    image: busybox
    profiles: [monitoring]
    command: sh -c "while true; do echo monitor; sleep 5; done"
EOF
```

### 5.4 Stack with Extra Compose File

Tests multi-file compose, YAML editor file tabs, add/remove file.

```bash
mkdir -p ~/testcompose/multi-file
cat > ~/testcompose/multi-file/docker-compose.yml << 'EOF'
services:
  app:
    image: nginx:alpine
    ports:
      - "8083:80"
EOF
cat > ~/testcompose/multi-file/overrides.yml << 'EOF'
services:
  app:
    environment:
      NGINX_HOST: localhost
    labels:
      test: override-label
EOF
```

### 5.5 Stack with Volumes (for Prune / Backup testing)

```bash
mkdir -p ~/testcompose/volumes-test && cat > ~/testcompose/volumes-test/docker-compose.yml << 'EOF'
services:
  db:
    image: postgres:alpine
    environment:
      POSTGRES_PASSWORD: secret
    volumes:
      - pgdata:/var/lib/postgresql/data
  app:
    image: nginx:alpine
    ports:
      - "8084:80"
volumes:
  pgdata:
EOF
```

### 5.6 Stack for Scale Testing

```bash
mkdir -p ~/testcompose/scale-test && cat > ~/testcompose/scale-test/docker-compose.yml << 'EOF'
services:
  worker:
    image: busybox
    command: sh -c "echo worker-$$; sleep infinity"
  web:
    image: nginx:alpine
    ports:
      - "8085:80"
EOF
```

Note: scaling `web` past 1 will fail (static port) — this is expected and tests the port conflict warning.

### 5.7 Podman No-Network Stack (nftables workaround)

Use this if pasta is not yet installed and nftables fails:

```bash
mkdir -p ~/podmancompose/nonet && cat > ~/podmancompose/nonet/docker-compose.yml << 'EOF'
services:
  hello:
    image: busybox
    command: sh -c "while true; do echo ping; sleep 2; done"
    network_mode: none
EOF
```

### 5.8 Stack with Env File

Tests env file editor.

```bash
mkdir -p ~/testcompose/env-test
cat > ~/testcompose/env-test/docker-compose.yml << 'EOF'
services:
  app:
    image: nginx:alpine
    env_file: .env
    ports:
      - "8086:80"
EOF
cat > ~/testcompose/env-test/.env << 'EOF'
APP_ENV=development
SECRET_KEY=test-secret-123
DEBUG=true
EOF
```

---

## 6. Feature Scenarios

Run each scenario with both Docker and Podman unless noted otherwise.

---

### 6.1 Stack Listing & Status Badges

**Setup:** Start stacks 5.1, 5.2, 5.3 (without profiles). Stop one of them manually.

**Steps:**
1. Open cockpit-compose. All three stacks appear in the main list.
2. Running stacks show green **running** badge with correct service count.
3. Stop `multi` stack: `docker compose -p multi stop`
4. Within ~1 second the badge changes to **stopped** without a page refresh.
5. Start only the default service of `profiles`: `docker compose -p profiles up -d`
   - Status shows **partial** (app running, dev/monitoring not started).
6. Pause `gotify`: `docker compose -p gotify pause`
   - Badge changes to **paused**.

**Expected:** Status updates automatically via polling (~500ms normal, 2s on error).

---

### 6.2 Import / Discover Downed Stacks

**Setup:** Have stacks from section 5 stopped (not running). Navigate to the bottom of the page.

**Steps:**
1. Click **Import** to expand the downed stacks section.
2. Enter `~/testcompose` as the directory.
3. Click **Scan** — all stopped compose projects under that directory appear.
4. **Depth setting:** Set depth to 1 and rescan — projects nested deeper than one level disappear.
   Set back to 2 — they reappear.
5. **Auto-detect:** Run a stack (`docker compose up -d`) and reload. The directory field
   should auto-fill with `~/testcompose` because all running stacks share that parent.
6. **Runtime switch test:** Switch to Podman. The path field and scan results must clear
   completely (regression: previously kept the Docker path after switching back to Docker).
7. Switch back to Docker — path is again empty, not the Podman path.

---

### 6.3 Start (Up) — Simple

**Setup:** `gotify` stack stopped.

**Steps:**
1. In the downed stacks list, click **Up** (▶) for `gotify`.
2. The Up confirmation dialog opens showing service list and any unpinned image warnings.
3. Click **Start**. Progress streams in the log viewer.
4. When complete, `gotify` moves to the running stacks list above.

---

### 6.4 Start (Up) — With Profiles

**Setup:** `profiles` stack stopped.

**Steps:**
1. Click **Up** for `profiles`.
2. The confirmation dialog shows a **Profiles** section with checkboxes for `dev` and `monitoring`.
3. Select `dev`. Click **Start**.
4. `profiles` starts. Stack info → Services shows `app` and `debug` running; `monitoring` absent.
5. Down the stack, then Up again with `monitoring` checked.
6. `monitoring` runs, `debug` does not.

---

### 6.5 Stop / Restart

**Setup:** `multi` stack running.

**Steps:**
1. Click **Stop** → confirms stop → containers stop but stack stays in list.
2. Badge changes to **stopped**.
3. Click **Start** (Up icon) → re-runs `up -d` without the confirmation dialog (no profiles).
4. All three services restart.
5. Click **Restart** → all containers restart; brief stopped→running transition visible in badge.

---

### 6.6 Down (Remove Containers)

**Setup:** `gotify` stack running.

**Steps:**
1. Click ⋮ → **Down**. Confirmation dialog appears: "Remove gotify?"
2. Dialog warns about shared networks if any exist (check stack 6.13 for shared network test).
3. Click **Down (remove)**. Containers removed. `gotify` disappears from running list.
4. It may appear in downed stacks if the directory was previously scanned.

---

### 6.7 Kill

**Setup:** `multi` stack running.

**Steps:**
1. Click ⋮ → **Kill**. Dialog warns SIGKILL — no clean shutdown.
2. Confirm. All containers receive SIGKILL immediately.
3. Stack disappears from running list.

---

### 6.8 Logs

**Setup:** `multi` stack running.

**Steps:**
1. Click **Logs** (📋) for `multi`.
2. Log modal opens streaming all services. Latest 200 lines shown.
3. **Service filter:** Select `web` from the dropdown — only nginx logs shown.
4. **Search:** Type `GET` in the search box — lines not containing it are hidden.
5. **Pause:** Click **Pause** → log stream stops scrolling. New log lines still arrive but
   the view is frozen. Click **Continue** → jumps to latest.
6. **Clear:** Click **Clear** → log output area empties.
7. **Refresh:** Click **Refresh** → fetches latest 200 lines fresh.
8. Close the modal.

---

### 6.9 Events

**Setup:** `gotify` stack running.

**Steps:**
1. Click ⋮ → **Events**.
2. Click **Stream events**. Event table starts populating.
3. In another terminal: `docker compose -p gotify restart`
4. Events appear: `stop`, `die`, `start` for the gotify container.
5. Each event row shows: time, type (container), action, service name, details.
6. Click **Stop** → streaming halts.
7. Click **Clear** → table empties.

---

### 6.10 Exec / Shell

**Setup:** `multi` stack running.

**Steps:**
1. Click ⋮ → **Shell**.
2. Exec modal opens. Select service `worker` from dropdown.
3. Command defaults to `/bin/sh`. Click **Open shell**.
4. A terminal opens inside the worker container.
5. Type `ls /` → filesystem listed. Type `exit`.
6. Click **Disconnect**.
7. **Podman note:** Exec may output garbled characters without a PTY — the app passes `-T`
   for Podman to avoid this.

---

### 6.11 Run Command (One-off)

**Setup:** `multi` stack running.

**Steps:**
1. Click ⋮ → **Run command**.
2. Select service `web`. Enter command: `nginx -v`.
3. Check **Remove container after exit (--rm)**.
4. Click **Run**. Output streams: `nginx version: nginx/1.x.x`.
5. Status shows ✓ when complete.
6. Try with `worker` service, command `echo hello world`. Output: `hello world`.

---

### 6.12 Pull Images

**Setup:** `gotify` stack with a pinned image tag.

**Steps:**
1. Click ⋮ → **Pull images**.
2. Pull confirm dialog shows current image refs.
3. If image uses `:latest` — a ⚠ unpinned warning appears.
4. Click **Pull**. Progress streams for each image.
5. Complete message shows when done.
6. **Cancelled pull test:** Start a pull of a large image, then close the modal — the pull
   is interrupted gracefully.

---

### 6.13 Stack Info

**Setup:** `volumes-test` and `multi` stacks running.

**Steps:**
1. Click ⋮ → **Info** for `volumes-test`.
2. **Services tab:** All containers listed with status, image, uptime.
3. **Images tab:** Images listed with repo, tag, size, creation date.
4. **Volumes tab:** `pgdata` listed with driver and mountpoint.
5. **Networks tab:** Default project network shown.
6. **Shared networks test:** Connect two stacks to the same external network and confirm
   the Networks tab shows "shared with <other stack>" indicator.
7. Close Info. Click **Info** for `multi` — no volumes, networks tab shows 1 network.

---

### 6.14 Edit YAML

**Setup:** `multi-file` stack (two compose files).

**Steps:**
1. Click ✏️ (edit/yaml icon) for `multi-file`.
2. YAML editor opens with two file tabs: `docker-compose.yml` and `overrides.yml`.
3. Edit `docker-compose.yml`: change port from `8083:80` to `8087:80`. Click **Save**.
4. Validation runs. If YAML is valid, file is saved.
5. **Add file:** Click **Add** → enter `extra.yml` → a blank compose file is created.
6. **Delete file:** Select `extra.yml` tab → click **Delete file** → confirm → tab disappears.
7. **Import file:** Click **Import** → any extra `.yml` files in the directory are listed for import.
8. **Snapshot / history:**
   - Make an edit and save. Click **History** → previous version appears.
   - Click **Show diff** on a snapshot → diff view highlights the change.
   - Click **Restore** on the original → file reverts.
   - Click **Delete** on a snapshot → it is removed from history.

---

### 6.15 Edit Env File

**Setup:** `env-test` stack.

**Steps:**
1. Click ✏️ → click **Env file** button.
2. Env editor opens in **Table** mode. Three rows: APP_ENV, SECRET_KEY, DEBUG.
3. Edit `DEBUG` value to `false`. Click **Save**.
4. Click **Raw** tab → see raw `.env` content.
5. Add a duplicate key in raw mode (`APP_ENV=staging`). Click **Save** →
   warning: "Duplicate keys found — only the last value will be used."
6. Save anyway → file saved.
7. **Add new env file:** Click the + icon → name it `.env.prod` → empty file created.
   Switch tabs between `.env` and `.env.prod`.

---

### 6.16 Prune Resources

**Setup:** `volumes-test` stack. Down it first so there are stopped containers.

**Steps:**
1. Click ⋮ → **Prune** for `volumes-test`.
2. Modal opens with checkboxes: Images, Containers, Volumes, Networks.
3. Click **Preview** → list of resources that will be removed appears (containers section
   shows stopped containers; volumes shows `pgdata`).
4. Warning shown because stack is not running.
5. Uncheck **Volumes** (don't delete data). Check **Containers**. Click **Prune selected**.
6. Stopped containers removed. `pgdata` volume preserved.
7. Restart the stack: `docker compose -p volumes-test up -d`
8. Re-open Prune → containers section is empty (all running, none stopped).

---

### 6.17 Scale Services

**Setup:** `scale-test` stack running.

**Steps:**
1. Click ⋮ → **Scale**.
2. Scale modal shows services: `worker` (1 replica), `web` (1 replica).
3. `web` shows a ⚠ port conflict inline warning (static host port).
4. Increase `worker` to 3. Click **Apply**.
5. Confirmation dialog shows: worker: 1 → 3.
6. Confirm → `up -d --scale worker=3` runs.
7. Stack info → Services: 3 worker containers appear.
8. **Port conflict test:** Try to scale `web` to 2 → port conflict dialog warns it will fail.
   Attempt anyway (optionally) — Docker/Podman returns error, which is shown in the log stream.

---

### 6.18 Backup & Restore

**Setup:** `gotify` stack with data in `./data` volume directory.

**Steps:**
1. Click ⋮ → **Backup**.
2. Archive name auto-filled as `gotify-<date>.tar.gz`. Change destination to `~/backups`.
3. Check **Include snapshots** and **Include subdirectories**.
4. Click **Create backup**. Success message shows the archive path.
5. Verify: `ls ~/backups/*.tar.gz`
6. **Restore test:**
   - Down and delete the `gotify` directory.
   - Click **Import** → **Restore** button.
   - Select the backup archive.
   - Confirm archive contents are listed.
   - Set restore target to `~/testcompose/gotify-restored`.
   - Click **Restore** → directory recreated, compose file present.
   - Up the restored stack — it starts correctly.

---

### 6.19 Create Stack

**Steps:**
1. Click **Create** in the downed stacks section.
2. **Method: Template** → select a template (e.g. nginx) → template YAML pre-filled.
3. Enter name: `test-create`. Directory: `~/testcompose/test-create`.
4. Click **Create**. Stack directory and compose file created.
5. Stack appears in downed list. Click **Up** to start it.
6. **Method: Git URL:**
   - Enter a public compose repo URL.
   - Click **Next** → files are cloned and shown.
   - Click **Create**.
7. **Validation:** Enter invalid YAML in the editor → error count shown with details.
   Clicking **Create anyway** bypasses validation.

---

### 6.20 Footer

**Steps:**
1. Verify footer shows: `Version: <plugin version>`, `Docker: <version>`, `Docker Compose: <version>`.
2. Switch to Podman (confirm modal → Continue).
3. Footer immediately updates: `Podman: <version>`, `<runtime> Compose: <version>`.
4. If rootless Podman socket detected: **Rootless** badge appears.
5. Socket path text (click it or hover) shows the correct socket path for the active runtime.
6. Switch back to Docker — footer reverts in real time.

---

### 6.21 Runtime Toggle

**Steps:**
1. Default is Docker. Click **Podman** toggle button.
2. A warning modal appears: "Switch to Podman — Podman support is experimental..."
3. Click **Cancel** → stays on Docker. Docker UI unchanged.
4. Click **Podman** again → modal appears again. Click **Continue**.
5. Toggle detects Podman compose — switches to Podman mode.
6. Stack list refreshes with Podman stacks.
7. **Not installed test:** On a machine without Podman, click Podman toggle → Continue.
   Detection fails. Toggle reverts to Docker. Warning inline: "Podman not found — install it to switch."

---

### 6.22 Ports

**Setup:** `gotify` running with port `8080:80`.

**Steps:**
1. In the stack row, the port `8080` is shown as a clickable link.
2. Click the port → external link modal warns about leaving the page → click Continue.
3. Browser opens `http://localhost:8080`.
4. **Localhost-only port** (e.g. `127.0.0.1:8080:80`): link has a lock/localhost tooltip.
5. **All-interfaces port** (e.g. `0.0.0.0:8080:80`): link has a globe/external tooltip.

---

### 6.23 Clickable Links in Stack Info

**Setup:** Any stack with an external URL in image names or environment variables.

**Steps:**
1. Open Stack Info → any URL in the details opens the external link modal before navigating.
2. Confirm the "always check external links" warning is shown.

---

## 7. Runtime-Specific Scenarios

### 7.1 Docker rootless

```bash
# Install rootless Docker toolkit
dockerd-rootless-setuptool.sh install
systemctl --user enable --now docker
export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/docker.sock
```

Open cockpit-compose in Docker mode → footer shows **Rootless** badge.
All features work identically to rootful Docker.

---

### 7.2 Podman via `podman compose` (External Provider)

1. `docker-compose` and `podman` both installed, `podman.socket` enabled.
2. Switch to Podman mode.
3. Run any compose action — the "Executing external compose provider" message appears
   in log output streams (this is informational only, not an error).
4. Footer shows Podman socket path: `/run/user/<uid>/podman/podman.sock`.
5. All stacks started via `podman compose up -d` appear in the list.

---

### 7.3 Podman via `podman-compose` (Python, No docker-compose installed)

1. `podman-compose` installed, `docker-compose` NOT installed.
2. Switch to Podman mode.
3. Stack listing uses `podman ps` label discovery — stacks appear by reading container labels.
4. Start a stack via the UI: `podman-compose up -d` is used.
5. Running stacks discovered correctly via `com.docker.compose.project` labels.
6. `compose ls` is NOT used (would fail) — confirm no error appears in the UI.

---

### 7.4 Podman Root (System Socket)

1. `podman.socket` enabled as root: `sudo systemctl enable --now podman.socket`.
2. No user-level socket (`/run/user/<uid>/podman/podman.sock` absent or not running).
3. Switch to Podman → app detects `/run/podman/podman.sock` as fallback.
4. Footer: **Rootless** badge NOT shown (running as root).
5. Stacks started as root are listed correctly.

---

### 7.5 Neither Runtime Present

1. Disable or uninstall Docker and Podman.
2. Open cockpit-compose → error alert: failed to load stacks (compose command not found).
3. Runtime toggle: both buttons clickable, but selecting either shows "not found" alert and reverts.

---

## 8. Known Issues & Workarounds

| Issue | Affected setup | Workaround |
|---|---|---|
| `netavark: nftables error` when starting containers | Rootless Podman (Arch / kernels without rootless nftables) | Install `passt`; set `default_rootless_network_cmd = pasta` in `~/.config/containers/containers.conf` |
| `compose ls` not supported | Podman + `podman-compose` only (no docker-compose) | Automatic: app uses `podman ps` label discovery instead |
| Docker containers visible in Podman mode | `DOCKER_HOST` not set externally | Automatic: app sets `DOCKER_HOST` per-command via socket detection |
| Stacks started by `docker compose` (non-Podman) don't appear in Podman mode | Running Docker daemon stacks when only Podman socket active | Expected: Podman socket only sees containers managed through it |
| External network `xyz declared as external, but could not be found` | External network doesn't exist yet | Create it first: `docker network create xyz` or start the stack that owns it |
| Stack list empty after runtime switch | Stacks not yet started under new runtime | Start test stacks under the new runtime; use Import to discover stopped ones |
| `podman system reset` wipes all images and containers | Podman | Only use for clean-state testing — non-reversible |
| Exec / shell garbled output | Podman without PTY | App automatically adds `-T` flag for Podman |
