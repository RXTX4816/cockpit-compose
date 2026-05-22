# Process Viewer

The Process Viewer shows the running processes inside every container in a stack, equivalent to running `docker compose top` from the command line.

## Opening the modal

Click the **⋮ more** menu on any running stack row, then select **Top**. The modal opens and fetches the process list immediately.

## Layout

```
┌──────────────────────────────────────────────────────┐
│  Top — myapp                                   [✕]   │
├──────────────────────────────────────────────────────┤
│  [Refresh] ●                                         │
├──────────────────────────────────────────────────────┤
│  web                                                 │
│  UID    PID   PPID  USER   CMD             %CPU %MEM │
│  root   1     0     root   nginx: master   0.0  0.1  │
│  nobody 7     1     nginx  nginx: worker   0.0  0.0  │
│                                                      │
│  db                                                  │
│  UID    PID   PPID  USER   CMD             %CPU %MEM │
│  999    1     0     mysql  mysqld          0.2  1.4  │
└──────────────────────────────────────────────────────┘
```

## Reading the output

The modal shows one section per running service/container. The section heading is the service name.

Under each heading is a process table. The columns come directly from `ps` output inside the container. Common columns include:

| Column | Description |
|---|---|
| **UID** | User ID of the process |
| **PID** | Process ID inside the container namespace |
| **PPID** | Parent process ID |
| **USER** | Username |
| **CMD** | Command line that started the process |
| **%CPU** | CPU usage percentage |
| **%MEM** | Memory usage percentage |

The exact columns depend on your Docker version and the base image.

## Refreshing

The process list is a **point-in-time snapshot** — it does not update automatically. Click **Refresh** to fetch a fresh snapshot.

A spinner appears in the toolbar while the data is loading.

## States

| State | What you see |
|---|---|
| Loading | Spinner in the toolbar |
| Error | Red error alert with the error message |
| No processes | "No running processes found" message |

## Closing the modal

Click **Close** in the footer, or click **✕** / press **Escape**.
