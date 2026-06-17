# Podman Compatibility

Cockpit Compose supports Podman as an alternative to Docker. You can switch runtimes at any time using the toggle in the dashboard toolbar.

## Enabling Podman mode

Click the **Docker / Podman** toggle in the top-right of the Stacks Dashboard. The plugin detects whether `podman compose` (or `podman-compose`) is available and switches immediately. If the binary is not found, the toggle reverts and an error is shown.

The selected runtime is saved in the browser and persists across sessions.

If Docker is not installed when the plugin loads, it automatically prompts you to switch to Podman.

## What changes in Podman mode

- All compose commands (`up`, `down`, `logs`, `pull`, etc.) are routed through `podman compose` instead of `docker compose`.
- The footer shows **Podman: x.y.z** and **Podman Compose: x.y.z** instead of Docker versions.
- The socket path reflects the Podman socket (e.g., `/run/user/<uid>/podman/podman.sock` for rootless).

Everything else — the dashboard, modals, editors, log streaming, shell access — works identically.

## Rootless Podman

Rootless Podman uses a user-level socket. Enable it with:

```bash
systemctl --user enable --now podman.socket
```

The plugin detects the user socket automatically when Podman mode is active. No additional configuration is needed.

## Supported compose providers

Podman mode works with two different compose providers:

| Provider | Command | Notes |
|---|---|---|
| **podman compose** (built-in) | `podman compose` | Recommended. Ships with Podman 5+. |
| **podman-compose** (Python) | `podman-compose` | Standalone Python package. Works but with some limitations (see below). |
| **docker-compose** (external) | `docker-compose` | Legacy v1 CLI used as a fallback by `podman compose`. |

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
