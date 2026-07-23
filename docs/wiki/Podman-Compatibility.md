# Podman Compatibility

Cockpit Compose supports Podman as an alternative to Docker. You can switch runtimes at any time using the toggle in the dashboard toolbar.

## Enabling Podman mode

Click the **Docker / Podman** toggle in the top-right of the Stacks Dashboard. The plugin detects whether `podman compose` (or `podman-compose`) is available and switches immediately. If the binary is not found, the toggle reverts and an error is shown.

The selected runtime is saved in the browser and persists across sessions.

If Docker is not installed when the plugin loads, it automatically prompts you to switch to Podman.

Switching runtimes also clears your current stack selection and cancels any [background tasks](Background-Tasks) that haven't started running yet, since they would otherwise execute against the newly selected runtime instead of the one they were queued under.

## What changes in Podman mode

- All compose commands (`up`, `down`, `logs`, `pull`, etc.) are routed through `podman compose` instead of `docker compose`.
- The footer shows **Podman: x.y.z** and **Podman Compose: x.y.z** instead of Docker versions.
- The socket path reflects the Podman socket (e.g., `/run/user/<uid>/podman/podman.sock` for rootless).

Everything else — the dashboard, modals, editors, log streaming, shell access — works identically.

## Rootless and rootful Podman

Rootless Podman uses a per-user socket:

```bash
systemctl --user enable --now podman.socket
```

Rootful (system-wide) Podman uses a single socket shared by all users, escalated via Cockpit's
administrative access:

```bash
sudo systemctl enable --now podman.socket
```

The plugin probes for both sockets whenever you switch to Podman mode (or click **Recheck** — see
below). If only one is present, it's used automatically. If **both** are present, a second toggle
appears next to the Docker/Podman switch — **Rootless** / **Rootful** — showing which one is
active and letting you pick explicitly:

- The choice is saved and sticks even if the other mode later becomes available too — it does not
  silently change back, the same way the Docker/Podman choice itself doesn't.
- An option is greyed out with a tooltip explaining why if its socket isn't detected, or if a
  **Recheck** (the small refresh icon) finds it unresponsive — useful when a socket file exists
  but the daemon behind it is actually broken or misconfigured.
- The footer shows a **Rootless** or **Rootful** badge reflecting whichever mode is currently
  active, matching the Docker footer badge described in [Stacks Dashboard](Stacks-Dashboard).

This replaces relying purely on automatic detection, which could previously pick the wrong socket
silently on systems where both are present but one is broken.

**Rootful mode requires Cockpit's Administrative access to be turned on** (top-right of the
Cockpit page, not inside this plugin — click "Limited access" and confirm). This is a separate
toggle from anything in this plugin, and it's easy to forget after a page reload or a fresh
login. Without it, every rootful discovery/action call runs unprivileged, fails to reach the
root-owned socket, and — depending on what else is installed — either fails with a clear
"permission denied" error, or (if a second engine is also installed, see the delegation warning
below) silently escalates nothing and the action may appear to do less than expected. If rootful
mode looks broken, checking Administrative access is on is the first thing to try.

When creating your first stack in rootless mode, the suggested compose root directory defaults to `<your home directory>/compose` instead of `/etc/docker/compose`, since `/etc` typically isn't writable without root — see [Creating Stacks](Creating-Stacks).

## Supported compose providers

Podman mode works with two different compose providers:

| Provider | Command | Notes |
|---|---|---|
| **podman compose** (built-in) | `podman compose` | Recommended. Ships with Podman 5+. |
| **podman-compose** (Python) | `podman-compose` | Standalone Python package. Works but with some limitations (see below). |
| **docker-compose** (external) | `docker-compose` | Legacy v1 CLI used as a fallback by `podman compose`. |

`podman compose` decides for itself which of these to delegate to, based on what's installed —
this plugin doesn't control that choice. If Docker's own `docker-compose-plugin` happens to be
installed alongside Podman (e.g. testing both side by side), `podman compose` will delegate to
*that* real Docker Compose binary rather than its own native implementation or `podman-compose`.
This is normally transparent — the plugin always tells it which socket to talk to — but it means
the compose version shown in the footer under Podman mode can be the real Docker Compose plugin's
version number, which is expected, not a bug.

## Known limitations

**`compose ls` not supported with `podman-compose` (Python):** The plugin uses `docker compose ls` to list stacks. When using the Python `podman-compose`, this command is not available. The plugin falls back to `podman ps` with label filters to discover stacks, which may miss stacks that were started outside of Cockpit Compose.

**Volume subcommand:** `docker compose` exposes a `volumes` subcommand used in Stack Info. This is not available in all Podman Compose versions. The Volumes section in Stack Info will show "Not available on this version" if the subcommand is missing.

**Docker containers visible in Podman mode:** If both runtimes are installed, switching to Podman mode does not hide Docker containers. They will not appear in the Podman stack list, but they remain running in the background. Use the runtime toggle to manage each runtime separately.

**Rootless nftables error:** On some systems, rootless Podman fails to set up networking with an `nftables` error. Install `passt` to work around this:

```bash
# Arch
sudo pacman -S passt

# Fedora
sudo dnf install passt
```

## Tips

- Podman stacks use the same compose file format as Docker. Existing `docker-compose.yml` files work without modification in most cases.
- If a stack was started with Docker and you switch to Podman mode, it will not appear in the dashboard — the stacks are managed by different daemons.
- For side-by-side Docker + Podman testing, use the [VM Testing](VM-Testing) setup which provisions both runtimes in isolated VMs.
