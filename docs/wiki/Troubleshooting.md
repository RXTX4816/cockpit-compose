# Troubleshooting

Common problems and how to fix them.

---

## Plugin doesn't appear in Cockpit

**Symptom:** You open Cockpit but there is no "Docker Compose" entry in the left navigation.

**Causes and fixes:**

1. **Package not installed in the right location.** The plugin files must be at `/usr/share/cockpit/cockpit-compose/`. Verify:
   ```bash
   ls /usr/share/cockpit/cockpit-compose/
   ```
   If empty or missing, reinstall the package or re-run the manual install steps.

2. **Cockpit cache.** Hard-refresh the browser (`Ctrl+Shift+R` / `Cmd+Shift+R`) or clear site data and reload.

3. **Development symlink missing.** In dev mode, the symlink must point to `src/`, not the repo root:
   ```bash
   ls -la ~/.local/share/cockpit/cockpit-compose
   # Should point to .../cockpit-compose/src
   ```

---

## "Permission denied" connecting to Docker

**Symptom:** The dashboard shows an error like `permission denied while trying to connect to the Docker daemon socket`.

**Fix:** Add your user to the `docker` group and re-log in:

```bash
sudo usermod -aG docker $USER
# Log out and back in, or:
newgrp docker
```

If you use rootless Docker, set `DOCKER_HOST` in your shell startup file:

```bash
export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock
```

---

## Stacks don't appear / "No compose stacks found"

**Symptom:** You have running stacks but the dashboard is empty.

**Causes and fixes:**

1. **Wrong runtime selected.** Check the Runtime toggle in the toolbar — if you started stacks with Docker but the toggle is on Podman (or vice versa), switch to the correct runtime.

2. **Stack not started with `docker compose`.** Stacks started via `docker run` directly or via a different tool (e.g., Portainer) are not tracked by Compose and will not appear.

3. **Compose project name mismatch.** The plugin uses the `COMPOSE_PROJECT_NAME` label that Docker attaches at `up` time. If the stack was started without the Compose CLI, it may not have this label.

4. **Podman + `podman-compose` limitation.** The Python `podman-compose` does not support `compose ls`. The plugin falls back to `podman ps` label discovery, which may miss stacks started outside Cockpit Compose. Try bringing the stack down and back up from inside the plugin.

---

## Log stream stalls or stops updating

**Symptom:** The Logs modal opens but lines stop arriving after a while.

**Fixes:**

- Click **↺ Refresh** in the Logs toolbar to restart the stream.
- If the container has stopped, there are no more lines to stream — the stream ends naturally.
- For very high log volume, the 10,000-line buffer can fill up. Click **Clear** to reset.

---

## YAML editor shows errors on a valid file

**Symptom:** Your compose file is accepted by `docker compose` but the editor highlights errors.

**Cause:** The editor validates against the Docker Compose JSON Schema. Some valid real-world fields are not covered by the schema (custom extensions, newer Compose spec features).

**Fix:** You can save despite schema warnings — the confirmation prompt asks "Save anyway?" Click **Save** to proceed. The schema errors are advisory and do not block saving.

---

## Shell access shows "OCI runtime exec failed"

**Symptom:** Opening a shell into a container gives `OCI runtime exec failed: container not found` or similar.

**Causes:**

- The container is in a restarting or exited state — wait for it to be fully running.
- The specified shell command doesn't exist in the image. Many minimal images (Alpine, distroless) only have `/bin/sh`, not `/bin/bash`. Change the Command field to `/bin/sh`.

---

## Rootless Podman networking error (nftables)

**Symptom:** Starting a stack in Podman mode fails with an error about `nftables` or `NETAVARK`.

**Fix:** Install `passt`, which provides an alternative networking backend:

```bash
# Arch
sudo pacman -S passt

# Fedora
sudo dnf install passt

# Debian / Ubuntu
sudo apt install passt
```

---

## Podman socket not found

**Symptom:** Switching to Podman mode fails with a socket or connection error.

**Fix:** Enable the Podman user socket:

```bash
systemctl --user enable --now podman.socket
```

For system-wide (root) Podman:

```bash
sudo systemctl enable --now podman.socket
```

---

## VM test setup: cloud-init never finishes

**Symptom:** `npm run vm:init` starts but the VM never becomes ready.

**Fixes:**

- Check the serial console: `./scripts/test-vm.sh logs arch` (replace with your distro).
- Confirm QEMU and `cloud-image-utils` are installed.
- Confirm QEMU has `virtfs` / `9p` support (`qemu-full` on Arch includes it; the `qemu` package does not).
- If the VM's overlay disk is corrupted, wipe and re-provision: `./scripts/test-vm.sh clean arch`.

See [VM Testing](VM-Testing) for the full command reference.
