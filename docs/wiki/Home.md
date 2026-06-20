# Cockpit Compose — User Guide

Cockpit Compose is a web-based UI for managing [Docker Compose](https://docs.docker.com/compose/) stacks, built as a plugin for [Cockpit](https://cockpit-project.org/). It runs inside your browser and communicates directly with Docker on your server — no extra daemons or agents required.

## What you can do

- See all your Compose stacks at a glance with live CPU and memory usage
- Search and filter stacks by name and status
- Start, stop, restart, pause, or forcefully kill stacks with one click
- Scale individual services to run multiple replicas
- Edit compose files in a built-in editor with schema validation, diff view, and snapshots
- Manage multiple compose files per stack (base + overrides)
- Stream real-time logs with per-service filtering and text search
- Run one-off commands inside a service container
- Open an interactive shell inside any running service container
- Pull the latest images and preview what will change before applying
- Clean up unused images, containers, volumes, and networks
- Create new stacks from a Git URL, a template, or from scratch
- Import and manage stacks that are stopped or stored on disk
- Back up a stack to a `.bak.tar.gz` archive and restore it later
- Switch between Docker and Podman runtimes with one click
- Works with rootless Docker automatically — no configuration needed
- Choose between four layout styles for the stack list (Minimal, Power User, Pretty, Unix)
- Start, stop, restart, or view logs for individual services directly from the expanded stack row

## Pages

| Page | What it covers |
|---|---|
| [Stacks Dashboard](Stacks-Dashboard) | The main screen — stack list, status indicators, stats, and action buttons |
| [Managing Stacks](Managing-Stacks) | Up, Start, Stop, Down, Restart, Pause / Unpause, Kill |
| [Viewing Logs](Viewing-Logs) | Streaming logs with service filter and search |
| [Editing Configuration](Editing-Configuration) | YAML editor, multi-file tabs, diff view, snapshots, env file editor |
| [Stack Info](Stack-Info) | Containers, images, volumes, and networks |
| [Pulling Images](Pulling-Images) | Pull latest images with a warning about breaking changes |
| [Events](Events) | Live Docker event stream |
| [Process Viewer](Process-Viewer) | Running processes inside containers (docker compose top) |
| [Shell Access](Shell-Access) | Interactive terminal inside a service container |
| [Running Commands](Running-Commands) | Run one-off commands with docker compose run |
| [Prune Resources](Prune-Resources) | Remove unused images, containers, volumes, and networks |
| [Scaling Services](Scaling-Services) | Adjust replica counts for individual services |
| [Creating Stacks](Creating-Stacks) | Create a new stack from Git, a template, or manually |
| [Importing Stacks](Importing-Stacks) | Scan a directory to find and manage offline stacks |
| [Backup and Restore](Backup-and-Restore) | Archive a stack to a `.bak.tar.gz` file and restore it |
| [Podman Compatibility](Podman-Compatibility) | Use the plugin with Podman instead of Docker |
| [Troubleshooting](Troubleshooting) | Fixes for common installation and runtime problems |

## Interface conventions

**Status colors** are used consistently throughout the UI:

| Color | Meaning |
|---|---|
| Green | Running / healthy |
| Orange | Partially running (some services stopped) |
| Grey | Stopped |
| Blue | Paused |
| Red | Error |

**Confirmation dialogs** appear before any destructive action (Down, Kill, Prune, Delete). Read them carefully — some actions cannot be undone.

**Buttons are disabled** while an operation is in progress. A spinner appears next to the stack row or inside the modal to indicate work is happening.

## Getting help

- Click **Help** in the footer to open this wiki.
- Check [Troubleshooting](Troubleshooting) for common installation and runtime problems.
- Click **Feedback / Report bug** in the footer to open a GitHub issue.
