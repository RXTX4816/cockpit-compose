# Running One-Off Commands

The Run modal lets you execute a single command inside a service container using `docker compose run`. This is useful for tasks like running database migrations, seeding data, or executing any other one-shot operation without leaving a persistent shell open.

## Opening the modal

Click the **⋮ more** menu on any running stack row, then select **Run**.

## Configuration step

```
┌──────────────────────────────────────────────────┐
│  Run — myapp                               [✕]   │
├──────────────────────────────────────────────────┤
│  Service   [web ▼]                               │
│  Command   [python manage.py migrate  ]          │
│  Runs as arguments to the image's entrypoint     │
│  (e.g. type "--help").                           │
│  [ ] Override entrypoint                         │
│  [✓] Remove container when done                  │
├──────────────────────────────────────────────────┤
│                         [Run]  [Cancel]          │
└──────────────────────────────────────────────────┘
```

| Field | Description |
|---|---|
| **Service** | The service whose image will be used to run the command. If services can be detected from the compose file, a dropdown is shown; otherwise type the service name manually. |
| **Command** | The command to run inside the container. Quoted arguments are respected (e.g. `sh -c "echo foo bar"` keeps `echo foo bar` together as one argument) — previously this only split on whitespace. Suggests previously used commands via your browser's native autocomplete. |
| **Override entrypoint** | Unchecked by default: the command runs as arguments appended after the image's own `ENTRYPOINT` — this is what makes typing just `--help` work. Check this if you want to run an arbitrary command instead, exactly as typed — for example, the full path to a binary, the same way you would with `docker exec`. This does **not** wrap your command in a shell, so it works even on minimal/distroless images that have no `/bin/sh`. |
| **Remove container when done** | Checked by default. Passes `--rm` to `docker compose run`, so the container is automatically removed after the command exits. Uncheck if you need to inspect the container after it finishes. |

Click **Run** to start. The button is disabled until both **Service** and **Command** are filled in.

> **Why "Override entrypoint" exists:** `docker compose run` only replaces a container's `CMD`, not its `ENTRYPOINT`. If an image's entrypoint is already the binary you want to run (common for single-purpose images), typing that binary's own path in **Command** — the way you would with `docker exec` — collides with the entrypoint and fails with an error like `unknown command "/app/mybinary" for "mybinary"`. Checking **Override entrypoint** runs your command as-is instead of appending it to the existing entrypoint, avoiding the collision.

## Output

Once running, the modal switches to a log view that streams the command output in real time:

```
┌──────────────────────────────────────────────────┐
│  Run — myapp                               [✕]   │
├──────────────────────────────────────────────────┤
│  ● Running command in myapp…                     │
├──────────────────────────────────────────────────┤
│  Applying migration 0001_initial... OK           │
│  Applying migration 0002_add_users... OK         │
│  ...                                             │
├──────────────────────────────────────────────────┤
│                              [Cancel]            │
└──────────────────────────────────────────────────┘
```

Output lines are color-coded the same way as the Pull and Up modals. When the command finishes:

- **✓ Complete** — the command exited successfully
- **✗ Failed** — the command exited with an error; the error message is shown above the log

Click **Close** when done. Click **Cancel** to stop a command that is still running.

## Differences from Shell

| | Run | Shell |
|---|---|---|
| Use case | One-off commands | Interactive exploration |
| Interface | Log output viewer | Full terminal emulator |
| Docker command | `docker compose run` | `docker compose exec` |
| Container lifecycle | Starts a new container | Connects to an existing one |
| Container removed after | Yes (by default) | N/A — exec does not create a container |
