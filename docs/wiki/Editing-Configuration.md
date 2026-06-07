# Editing Configuration

Cockpit Compose includes a built-in editor for your compose files and `.env` files. Both editors use CodeMirror with syntax highlighting, YAML/env-format validation, and Docker Compose schema awareness.

## Opening the YAML editor

Click the **Edit** button on any stack row. The YAML editor modal opens in read-only mode by default.

## Multi-file support

A stack can have more than one compose file (e.g., a base `docker-compose.yml` plus an override). The editor shows a **tab bar** at the top — one tab per file. Click a tab to switch to that file; the editor reloads with the content of the selected file.

```
┌──────────────────────────────────────────────────────────────┐
│  myapp — compose file                                  [✕]   │
├──────────────────────────────────────────────────────────────┤
│  [docker-compose.yml] [override.yml]    [+ Add] [↑ Import]  │
├──────────────────────────────────────────────────────────────┤
│  /etc/docker/compose/myapp/docker-compose.yml                │
│  [Env file]  [History (3)]  [Show changes]  [🔒 Edit]        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   services:                                                  │
│     web:                                                     │
│       image: nginx:latest                                    │
│       ports:                                                 │
│         - "80:80"                                            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Adding a new compose file

Click **+ Add** in the tab bar to create a new YAML file in the same directory. A modal appears where you enter a filename (must end in `.yml` or `.yaml`) and optionally edit the initial content. Click **Create** to write the file to disk and open it in a new tab.

### Importing an existing file

Click **↑ Import** to link an existing YAML file from the same directory that is not yet part of this stack. A dropdown lists all eligible YAML files found in the stack directory. Select one and click **Import** to add it as a new tab.

### Deleting a file

For any tab other than the primary compose file, a **Delete file** button appears in the toolbar. This permanently removes the file from disk after a confirmation step.

---

## YAML editor toolbar

| Control | Description |
|---|---|
| **File path** | Shows the full path to the active compose file on disk |
| **Env file** | Opens the env file editor (see below) |
| **History (N)** | Toggles the snapshots panel; *N* is the number of saved snapshots |
| **Show changes** | Opens a side-by-side diff of your unsaved edits vs the saved file. Only visible in edit mode when changes have been made. |
| **Hide changes** | Dismisses the diff view and returns to the editor. |
| **🔒 Edit** / **🔓 Lock** | Switches the editor between read-only and edit mode |

### Switching to edit mode

Click the **🔒 Edit** button. The lock icon changes to an open padlock and the editor becomes editable. The **Save** and **Cancel** buttons appear in the footer.

Make your changes directly in the editor. The editor validates the YAML syntax and Docker Compose schema as you type, highlighting errors with red underlines and warnings with yellow underlines.

### Previewing your changes

While editing, click **Show changes** to open a split diff view showing your edits against the last saved version of the file. Click **Hide changes** to return to the standard editor. Changes can be saved from either view.

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
| **Changes** | Shows a side-by-side diff of that snapshot vs the current saved file. Click again to dismiss. |
| **Restore** | Loads the snapshot content into the editor in edit mode (you still need to Save to apply it) |
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
