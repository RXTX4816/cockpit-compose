# Editing Configuration

Cockpit Compose includes a built-in editor for your `docker-compose.yml` and `.env` files. Both editors use CodeMirror with syntax highlighting, YAML/env-format validation, and Docker Compose schema awareness.

## Opening the YAML editor

Click the **Edit** button on any stack row. The YAML editor modal opens in read-only mode by default.

## YAML editor layout

```
┌───────────────────────────────────────────────────────┐
│  myapp — compose file                           [✕]   │
├───────────────────────────────────────────────────────┤
│  /etc/docker/compose/myapp/docker-compose.yml         │
│  [Env file]  [History (3)]  [🔒 Edit]                 │
├───────────────────────────────────────────────────────┤
│                                                       │
│   version: "3.9"                                      │
│   services:                                           │
│     web:                                              │
│       image: nginx:latest                             │
│       ports:                                          │
│         - "80:80"                                     │
│                                                       │
└───────────────────────────────────────────────────────┘
```

### Toolbar

| Control | Description |
|---|---|
| **File path** | Shows the full path to the compose file on disk |
| **Env file** | Opens the env file editor (see below) |
| **History (N)** | Toggles the snapshots panel; *N* is the number of saved snapshots |
| **🔒 Edit** / **🔓 Lock** | Switches the editor between read-only and edit mode |

### Switching to edit mode

Click the **🔒 Edit** button. The lock icon changes to an open padlock and the editor becomes editable. The **Save** and **Cancel** buttons appear in the footer.

Make your changes directly in the editor. The editor validates the YAML syntax and Docker Compose schema as you type, highlighting errors with red underlines and warnings with yellow underlines.

### Saving

Click **Save**. If there are validation errors or warnings, a confirmation prompt appears:

> There are N error(s) / warning(s) in the file. Save anyway?

You can still save despite warnings — for example, if you are using a custom extension or a feature not covered by the schema. Errors should generally be fixed before saving.

After a successful save, the editor returns to read-only mode.

### Cancelling

Click **Cancel** to discard all changes and return to read-only mode. No confirmation is shown.

---

## Snapshots

Cockpit Compose automatically saves a snapshot of the compose file **before each save**. Snapshots let you roll back to a previous version if something goes wrong.

Click **History (N)** to open the snapshots panel alongside the editor. Each snapshot shows its timestamp.

| Button | Description |
|---|---|
| **Restore** | Replaces the current editor content with this snapshot (enters edit mode with the restored content; you still need to Save) |
| **Delete** | Permanently removes this snapshot |

Snapshots are stored locally on the server and do not affect the live compose file until you click **Save**.

---

## Env file editor

Click **Env file** in the YAML editor toolbar to open the env file editor for the same stack.

The env file editor works similarly to the YAML editor:

- It shows the path to the `.env` file (e.g., `/etc/docker/compose/myapp/.env`).
- The editor validates env-file syntax and warns about common issues (e.g., unquoted values with spaces, duplicate keys).
- If no `.env` file exists yet, the footer shows a **Create** button instead of **Save**.

### Creating a new env file

If the stack doesn't have a `.env` file, the editor opens with an empty document. Add your variables in `KEY=value` format and click **Create** to write the file to disk.

### Editing an existing env file

Click the **🔒 Edit** button to enter edit mode. Make your changes and click **Save**. The env file editor does not have a snapshots feature.

---

## Applying configuration changes

After saving the compose file or env file, the changes are written to disk but **not yet applied** to running containers. To apply them:

1. Click **Close** to dismiss the editor.
2. Click **Up** on the stack row.

Docker will compare the new configuration with the running containers and recreate only those that have changed.
