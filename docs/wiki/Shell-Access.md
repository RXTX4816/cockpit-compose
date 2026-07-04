# Shell Access

The Shell modal opens an interactive terminal session inside a running service container. This is equivalent to running `docker compose exec <service> <command>` from the command line.

## Opening the modal

Click the **⋮ more** menu on any running stack row, then select **Shell**.

## Configuration step

Before the terminal opens, you configure how to connect:

```
┌──────────────────────────────────────────┐
│  Shell — myapp                     [✕]  │
├──────────────────────────────────────────┤
│  Service   [web ▼]                       │
│  Command   [/bin/sh          ]           │
│  User      [                 ]           │
├──────────────────────────────────────────┤
│                  [Open shell]  [Cancel]  │
└──────────────────────────────────────────┘
```

| Field | Description |
|---|---|
| **Service** | The service you want to connect to. If services are detected from the compose file, a dropdown is shown. Otherwise, type the service name manually. |
| **Command** | The shell to launch inside the container. Defaults to `/bin/sh`, which works in almost all images. Change to `/bin/bash` if you prefer bash and it is installed. Quoted arguments are respected (e.g. `sh -c "echo foo bar"` keeps `echo foo bar` together as one argument). Suggests previously used commands via your browser's native autocomplete. |
| **User (optional)** | Run the shell as this user. Leave empty to use the container's default user. Enter `root` to run as root. |

Click **Open shell** to connect. The button is disabled if no service name has been entered.

## Terminal

Once connected, the modal shows a full terminal emulator:

```
┌──────────────────────────────────────────┐
│  Shell — myapp                     [✕]  │
├──────────────────────────────────────────┤
│  # ls /                                  │
│  bin  dev  etc  home  proc  ...          │
│  # _                                     │
│                                          │
├──────────────────────────────────────────┤
│                         [Disconnect]     │
└──────────────────────────────────────────┘
```

- The terminal supports full color output, cursor movement, tab completion, and all standard terminal features.
- It follows your Cockpit theme: dark background in dark mode, light background in light mode.
- The terminal is a live bidirectional connection — keystrokes are sent to the container in real time.

## Disconnecting

Click **Disconnect** to close the terminal session and return to the configuration step. You can then open a new session with different settings.

Closing the modal with **✕** or **Escape** also disconnects the session.

## Connection errors

If the shell cannot be opened (e.g., the service is not running, the command does not exist in the container, or permissions are denied), a red error alert appears below the configuration form with the error message from Docker.

## Tips

- Most minimal images only have `/bin/sh`. If you get "command not found" with `/bin/bash`, switch to `/bin/sh`.
- To install a package temporarily, run as `root` using the **User** field.
- Changes made inside the shell affect only the running container and are lost when the container is recreated.
