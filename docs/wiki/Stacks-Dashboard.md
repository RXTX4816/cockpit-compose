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
| **Ports** | Exposed ports shown as blue `host:container` labels |
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
| **⋮ (more)** | Restart, Pause/Unpause, Events, Top, Shell, Run, Prune, Kill |

The **Up** button is highlighted (primary) when the stack is stopped. **Stop** and **Start** are secondary. **Down**, **Pull**, **Logs**, **Edit**, **Info**, and the more menu are plain style.

Buttons are disabled when they are not applicable. For example, Restart, Pause, Events, Top, Shell, and Run are disabled for a stopped stack.

### Expanded row (container list)

Click the **▶** toggle to expand a stack row. This shows a table of containers belonging to the stack:

| Column | Description |
|---|---|
| Status badge | Green (running) or grey (stopped) |
| Name | Service name and container name |
| Image | Docker image in use |
| Uptime | How long the container has been running, or its current state |

If no containers are found (e.g., the stack was just downed), a "No containers found" message is shown.

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
| **Docker: x.y.z** | The Docker client version on your server |
| **Docker Compose: x.y.z** | The Docker Compose version on your server |
| **unix:///…/docker.sock** | The socket the plugin is communicating with |
| **Rootless Docker** | Shown in green when a rootless Docker daemon is detected (see below) |

### Rootless Docker

If your system runs a rootless Docker daemon (socket at `/run/user/<uid>/docker.sock`), the plugin detects this automatically at startup and shows a green **Rootless Docker** badge in the footer. In this mode:

- All Docker and Compose commands are directed to your user-level daemon via `DOCKER_HOST`.
- Privilege escalation is suppressed for Docker operations — no sudo prompt appears.
- The resolved socket path is shown in the footer so you can confirm which daemon is in use.

If you have `DOCKER_HOST` set in your session environment before opening Cockpit, that value is respected as-is. Otherwise, the plugin checks for a user socket first, then the system socket at `/var/run/docker.sock`.
