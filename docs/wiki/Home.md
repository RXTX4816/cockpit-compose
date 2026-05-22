# Cockpit Compose — User Guide

Cockpit Compose is a web-based UI for managing [Docker Compose](https://docs.docker.com/compose/) stacks, built as a plugin for [Cockpit](https://cockpit-project.org/). It runs inside your browser and communicates directly with Docker on your server — no extra daemons or agents required.

## What you can do

- See all your Compose stacks at a glance with live CPU and memory usage
- Start, stop, restart, pause, or forcefully kill stacks with one click
- Edit your `docker-compose.yml` and `.env` files in a built-in editor with schema validation
- Stream real-time logs, Docker events, and process lists
- Open an interactive shell inside any running service container
- Pull the latest images and preview what will change before applying
- Clean up unused images, containers, volumes, and networks
- Create new stacks from a Git URL, a template, or from scratch
- Import and manage stacks that are stopped or stored on disk

## Pages

| Page | What it covers |
|---|---|
| [Stacks Dashboard](Stacks-Dashboard) | The main screen — stack list, status indicators, stats, and action buttons |
| [Managing Stacks](Managing-Stacks) | Up, Start, Stop, Down, Restart, Pause / Unpause, Kill |
| [Viewing Logs](Viewing-Logs) | Streaming logs modal |
| [Editing Configuration](Editing-Configuration) | YAML editor, env file editor, snapshots |
| [Stack Info](Stack-Info) | Containers, images, and volumes details |
| [Pulling Images](Pulling-Images) | Pull latest images with a warning about breaking changes |
| [Events](Events) | Live Docker event stream |
| [Process Viewer](Process-Viewer) | Running processes inside containers (docker compose top) |
| [Shell Access](Shell-Access) | Interactive terminal inside a service container |
| [Prune Resources](Prune-Resources) | Remove unused images, containers, volumes, and networks |
| [Creating Stacks](Creating-Stacks) | Create a new stack from Git, a template, or manually |
| [Importing Stacks](Importing-Stacks) | Scan a directory to find and manage offline stacks |

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
- Click **Feedback / Report bug** in the footer to open a GitHub issue.
