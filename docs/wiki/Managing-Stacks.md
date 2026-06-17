# Managing Stacks

This page covers all the lifecycle actions you can perform on a stack: bringing it up, stopping it, starting it, taking it down, restarting it, pausing it, and killing it.

## Up

**What it does:** Runs `docker compose up -d`. Docker creates or recreates containers as needed, applies configuration changes, and leaves everything running in the background.

**When to use it:** When you want to start a stopped stack, or after editing the compose file and want to apply the changes.

### Confirmation step

Before the operation starts, a confirmation modal always appears. It shows:

- A warning that containers with changed configuration will be recreated.
- A list of every service and its image. Services using unpinned images (`:latest` or no tag) are marked with a **⚠** warning.
- An **Optional profiles** section — if your compose file defines [profiles](https://docs.docker.com/compose/profiles/), checkboxes appear here so you can select which ones to activate. Only services tagged with a selected profile will start. Services without any profile tag always start regardless.

Click **Up** to proceed or **Cancel** to abort.

### Progress modal

A progress modal opens and streams the output of `docker compose up` in real time. The log is color-coded by event type. When the operation finishes:

- **✓ Up complete** — all containers started successfully
- **✗ Up failed** — an error occurred; the full error is shown below the status

Click **Close** when done. If the operation is still running, click **Cancel** to abort it.

---

## Start

**What it does:** Runs `docker compose start`. Starts existing stopped containers without recreating them. Config changes in the compose file are **not** applied.

**When to use it:** When you stopped a stack temporarily and want to resume it exactly as it was.

No confirmation modal. The button triggers the command directly and the row updates as containers come online.

---

## Stop

**What it does:** Runs `docker compose stop`. Sends `SIGTERM` to all running containers and waits for them to exit gracefully. Containers are preserved — they can be started again with **Start**.

**When to use it:** When you want to pause a stack temporarily without losing container state.

No confirmation modal. The dashboard updates as containers stop.

---

## Down

**What it does:** Runs `docker compose down`. Stops and **removes** all containers for this stack. The stack disappears from the Running section. Networks created by the stack are also removed. Volumes and images are **not** removed by default.

**When to use it:** When you want to tear down a stack completely and remove its containers.

### Confirmation dialog

A confirmation modal appears:

> Running `docker compose down` will stop and remove all containers for **[stack name]**.  
> The stack will disappear from this list.

If any of the stack's networks are also used by other running stacks, a warning is shown listing which stacks share those networks. Proceeding will remove the network, which may affect the other stacks.

Click **Down (remove)** to proceed or **Cancel** to abort.

After Down completes, the stack may reappear in the **Stopped / offline stacks** section if its compose file still exists on disk.

---

## Restart

**What it does:** Runs `docker compose restart`. Stops and then starts all containers without recreating them. Config changes in the compose file are **not** applied.

**When to use it:** When a service has become unresponsive and you want to cycle it without changing anything else.

Found in the **⋮ more** menu. Disabled for stopped or unknown stacks.

---

## Pause / Unpause

**What it does:**
- **Pause** — Freezes all running containers in the stack. CPU usage drops to zero. Memory is retained.
- **Unpause** — Resumes frozen containers from where they left off.

**When to use it:** When you need to temporarily freeze a stack (e.g., to take a consistent snapshot) without stopping it.

Found in the **⋮ more** menu. **Pause** is shown when the stack is running; **Unpause** is shown when the stack is paused (status label turns blue).

---

## Kill

**What it does:** Runs `docker compose kill`. Sends `SIGKILL` to all containers, terminating them immediately. Unlike **Stop**, containers have no chance to clean up or flush buffers.

**When to use it:** Only when **Stop** is not working — for example, when a container is hung and not responding to graceful shutdown signals.

Found in the **⋮ more** menu. This is a **danger action**.

### Confirmation dialog

> Running `docker compose kill` sends SIGKILL to all containers in **[stack name]**, forcefully terminating them immediately.  
> Unlike Stop, processes have no chance to clean up. Use only when Stop does not respond.

Click **Kill all containers** (danger button) or **Cancel**.

---

## Scale

**What it does:** Adjusts the number of running replicas for one or more services (`docker compose up --scale`).

**When to use it:** When you need multiple instances of a stateless service for load distribution or testing.

Found in the **⋮ more** menu. Only available for running stacks. See [Scaling Services](Scaling-Services) for the full walkthrough.

---

## Action errors

If any action fails, a red error alert appears directly below the stack row with the error message from Docker. The alert disappears when you close it or trigger another action.
