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
│  [✓] Remove container when done                  │
├──────────────────────────────────────────────────┤
│                         [Run]  [Cancel]          │
└──────────────────────────────────────────────────┘
```

| Field | Description |
|---|---|
| **Service** | The service whose image will be used to run the command. If services can be detected from the compose file, a dropdown is shown; otherwise type the service name manually. |
| **Command** | The command to run inside the container. Multiple words are split on whitespace and passed as separate arguments (e.g., `python manage.py migrate` becomes `python`, `manage.py`, `migrate`). |
| **Remove container when done** | Checked by default. Passes `--rm` to `docker compose run`, so the container is automatically removed after the command exits. Uncheck if you need to inspect the container after it finishes. |

Click **Run** to start. The button is disabled until both **Service** and **Command** are filled in.

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
