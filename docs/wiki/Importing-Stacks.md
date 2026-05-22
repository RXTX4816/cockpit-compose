# Importing Stacks

The **Stopped / offline stacks** section at the bottom of the dashboard shows compose files that exist on disk but whose containers are not running. You can import them by scanning a directory, then manage or start them directly from the UI.

## The Stopped section

```
┌────────────────────────────────────────────────────────────┐
│  Stopped / offline stacks                                  │
│  [Create]  [▼ Import]                                      │
├────────────────────────────────────────────────────────────┤
│  myapp   ● down   /etc/docker/compose/myapp/compose.yml    │
│                              [↑ Up]  [Edit]  [✕ Delete]    │
├────────────────────────────────────────────────────────────┤
│  oldsite  ● down  /etc/docker/compose/oldsite/compose.yml  │
│                              [↑ Up]  [Edit]  [✕ Delete]    │
└────────────────────────────────────────────────────────────┘
```

Each row shows:

| Element | Description |
|---|---|
| **Stack name** | Derived from the folder name or Compose project name |
| **● down** | Grey status label indicating the stack is offline |
| **File path** | Full path to the `docker-compose.yml` (or `compose.yml`) file |
| **Up** | Bring the stack online — see [Managing Stacks](Managing-Stacks) |
| **Edit** | Open the YAML editor — see [Editing Configuration](Editing-Configuration) |
| **Delete** | Delete the compose file from disk (two-step confirmation) |

## Scanning for compose files

Cockpit Compose does not automatically scan your entire filesystem. You tell it where to look by providing a **compose root directory** and clicking **Scan**.

### Steps

1. Click the **▼ Import** button to expand the import controls.

   ```
   ┌───────────────────────────────────────────────────────┐
   │  [Best match]  [/etc/docker/compose          ] [Scan] │
   └───────────────────────────────────────────────────────┘
   ```

2. Optionally click **Best match** to auto-fill the directory path with the best guess based on where your active stacks are stored (disabled if no active stacks are running).

3. Enter a directory path in the text field, for example `/etc/docker/compose` or `/home/user/projects`.

4. Click **Scan**. A spinner appears with "Scanning…" while the directory is being searched.

### Scan results

Cockpit Compose searches the directory for any files named `docker-compose.yml`, `docker-compose.yaml`, `compose.yml`, or `compose.yaml`. For each one found, it checks if the stack is already running. Stacks that are not currently running appear in the list below.

**If no compose files are found:**

> ⚠ Are you sure this is a compose parent directory?

This warning means either the directory is empty, there are no compose files in it, or all found stacks are already running.

**If the scan fails (permission error, directory not found, etc.):** A red error alert is shown with the error message.

## Deleting a stack

Click **✕ Delete** on any stopped stack row to permanently delete its compose file.

### Confirmation — step 1

```
┌──────────────────────────────────────────────────────┐
│  Delete stack                                  [✕]   │
├──────────────────────────────────────────────────────┤
│  🔴 This action cannot be undone                     │
│                                                      │
│  File: /etc/docker/compose/myapp/docker-compose.yml  │
│                                                      │
│  [✓] Delete entire folder                            │
│      Also removes /etc/docker/compose/myapp/         │
│      and all files inside it (env files, configs).   │
├──────────────────────────────────────────────────────┤
│                         [Delete]  [Cancel]           │
└──────────────────────────────────────────────────────┘
```

Choose whether to delete only the compose file or the entire folder (including env files and any other files inside).

Click **Delete** to proceed to the second confirmation.

### Confirmation — step 2

```
┌──────────────────────────────────────────────────────┐
│  Are you really sure?                          [✕]   │
├──────────────────────────────────────────────────────┤
│  🔴 This will permanently delete:                    │
│  /etc/docker/compose/myapp/                          │
│                                                      │
│  There is no way to recover this. Make sure you      │
│  have a backup if needed.                            │
├──────────────────────────────────────────────────────┤
│                     [Yes, delete]  [Cancel]          │
└──────────────────────────────────────────────────────┘
```

Click **Yes, delete** to confirm. The file (or folder) is deleted and the stack disappears from the list.

> **Note:** Delete only removes files from disk. It does not stop running containers. If you want to stop containers first, use **Down** from the running stacks section before deleting.
