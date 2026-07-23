# Stacks Dashboard

The Stacks Dashboard is the main screen you see when you open Cockpit Compose. It lists every Docker Compose stack that is currently running or known to Docker on your system.

## Layout

```
┌──────────────────────────────────────────────────────────┐
│  Compose Stacks                                          │
├──────────────────────────────────────────────────────────┤
│  ▶ myapp      ● Running  ✓ Healthy  3 services           │
│    80:8080  CPU 1.2%  Mem 256 MB    [Up][Stop][▼][...]   │
├──────────────────────────────────────────────────────────┤
│  ▶ monitoring  ● Partial  ⚠ Partial  2 services          │
│    CPU 0.4%  Mem 128 MB             [Up][Stop][▼][...]   │
├──────────────────────────────────────────────────────────┤
│  Stopped / offline stacks                                │
│  [Create] [Import ▼]                                     │
└──────────────────────────────────────────────────────────┘
```

The page is split into two sections:

- **Running stacks** — stacks Docker currently knows about (running, partial, paused, or unknown)
- **Stopped / offline stacks** — stacks found on disk but not running (see [Importing Stacks](Importing-Stacks))

## Toolbar

The toolbar sits above the stack list and contains three controls:

| Element | Description |
|---|---|
| **Status filter chips** | Colored chips for Running, Partial, Stopped, and Paused. Click a chip to show only stacks in that state; click again to deactivate. A chip only appears when at least one stack has that status. Multiple chips can be active at once. |
| **Search** | Live text filter by stack name. Matching is case-insensitive. Click **✕** to clear. |
| **Layout selector** | Icon button that opens a toggle group with four layout options. The chosen layout is saved in the browser. See [Layout options](#layout-options) below. |
| **Runtime toggle** | Switch between **Docker** and **Podman** modes. The choice is saved in the browser and persists across sessions. See [Podman Compatibility](Podman-Compatibility). |

### Layout options

| Layout | Icon | Description |
|---|---|---|
| **Minimal** | Grid | Compact grid view focused on density — shows status, name, port badges, and stats in as little space as possible. |
| **Power User** | List | Dense table row with the full set of stack details visible at a glance. |
| **Pretty** | Magic wand | Card-style view with a more visual presentation of each stack. |
| **Unix** | Terminal | Monochrome, terminal-aesthetic row list. |

## Stack rows

Each stack appears as a collapsible row. The row shows a summary when collapsed and expands to show individual containers.

### Summary row (collapsed)

| Element | Description |
|---|---|
| **▶ toggle** | Click to expand / collapse the container list |
| **Stack name** | The name of the Compose project |
| **Status label** | Running, Partial, Stopped, Paused, or Unknown |
| **Health badge** | ✓ Healthy, ⚠ Partial, or Unhealthy — reflects the aggregate health of all services |
| **Service count** | Number of services defined in the compose file |
| **Ports** | Exposed ports shown as blue `host:container` badges. Ports that resolve to a reachable URL are clickable — clicking opens an external-link confirmation and then opens the service in a new browser tab. Localhost-bound ports are only clickable when Cockpit itself runs on localhost. |
| **CPU %** | Real-time CPU usage across all containers in the stack |
| **Memory** | Real-time memory usage across all containers in the stack |

Stats (CPU and memory) only display for stacks with at least one running container. A spinner appears while stats are being loaded.

### Action buttons

| Button | Action |
|---|---|
| **Up** | Bring the stack online (recreates changed containers) — see [Managing Stacks](Managing-Stacks) |
| **Stop** | Gracefully stop all running containers |
| **Start** | Start previously stopped containers without recreating them |
| **Down** | Stop and remove all containers (appears on click of ▼) |
| **Pull** | Pull the latest images — see [Pulling Images](Pulling-Images) |
| **Logs** | Open the logs viewer — see [Viewing Logs](Viewing-Logs) |
| **Edit** | Open the YAML editor — see [Editing Configuration](Editing-Configuration) |
| **Info** | Open the stack info panel — see [Stack Info](Stack-Info) |
| **⋮ (more)** | Restart, Pause/Unpause, Events, Top, Shell, Run, Scale, Prune, Kill, Backup, Restore |

The **Up** button is highlighted (primary) when the stack is stopped. **Stop** and **Start** are secondary. **Down**, **Pull**, **Logs**, **Edit**, **Info**, and the more menu are plain style.

Buttons are disabled when they are not applicable. For example, Restart, Pause, Events, Top, Shell, and Run are disabled for a stopped stack.

### Expanded row (container list)

Click the **▶** toggle to expand a stack row. This shows a table of containers belonging to the stack:

| Column | Description |
|---|---|
| Status badge | Green (running) or grey (stopped) |
| Name | Service name and container name. If a changelog URL is known for the image, the service name is a link that opens a confirmation before navigating. A replica count badge appears when a service is scaled to more than one instance. |
| Image | Docker image in use |
| Uptime | How long the container has been running, or its current state |
| Actions | Per-service **Start** or **Stop** (mutually exclusive based on current state), **Restart**, and **Logs** buttons. Logs opens the log viewer pre-filtered to that service. A spinner replaces the buttons while the action is in progress. |

If no containers are found (e.g., the stack was just downed), a "No containers found" message is shown.

## Keyboard shortcuts

When focus is on a stack row (click any row to focus it), single-key shortcuts trigger the most common actions:

| Key | Action |
|---|---|
| `U` | Up (open the Up confirmation modal) |
| `D` | Down (open the Down confirmation dialog) |
| `L` | Logs (open the log viewer) |
| `E` | Edit (open the YAML editor) |
| `I` | Info (open the Stack Info modal) |

Shortcuts are disabled while a modal is open or while the search box / any input has focus.

## Auto-refresh

The dashboard refreshes automatically every **500 ms** while the page is active. If loading fails, the interval slows to **2000 ms** and an error alert appears at the top with a **Retry** button.

The refresh pauses while a modal is open so that background changes don't interfere with what you are doing.

## Empty state

If no stacks are found at all, the dashboard shows:

> No compose stacks found  
> Start a project with `docker compose up -d` and it will appear here.

## Footer

At the bottom of the page you will find version and connection information followed by links to the **Help** wiki and **Feedback / Report bug** on GitHub.

| Badge | Description |
|---|---|
| **Version: x.y.z** | The installed version of Cockpit Compose |
| **Docker: x.y.z** | The Docker client version on your server (shows **Podman: x.y.z** in Podman mode) |
| **Docker Compose: x.y.z** | The Compose plugin version (shows **Podman Compose: x.y.z** in Podman mode) |
| **unix:///…/docker.sock** | The socket the plugin is communicating with |
| **Rootless** | Shown in green when the active socket is the per-user (rootless) one (see below) |
| **Rootful** | Shown in orange when the active socket is the system-wide (rootful) one |

### Rootless vs. rootful

If your system runs a rootless Docker or Podman daemon (socket at `/run/user/<uid>/…`), the plugin
detects this and shows a green **Rootless** badge in the footer. If only the system-wide socket is
available, it shows an orange **Rootful** badge instead. In rootless mode:

- All commands are directed to your user-level daemon via `DOCKER_HOST`.
- Privilege escalation is suppressed — no administrative-access prompt appears.

In rootful mode, actions escalate via Cockpit's administrative access (superuser bridge) as needed.

When **both** sockets are detected, a toggle next to the Docker/Podman switch lets you choose which
one to use — see [Podman Compatibility](Podman-Compatibility#rootless-and-rootful-podman) for
details on that toggle, its health check, and how the choice is remembered. The resolved socket
path is always shown as a tooltip on the version badge so you can confirm which daemon is in use.

If you have `DOCKER_HOST` set in your session environment before opening Cockpit, that value is respected as-is. Otherwise, the plugin checks for a user socket first, then the system socket at `/var/run/docker.sock`.
