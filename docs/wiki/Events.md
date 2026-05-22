# Events

The Events modal streams live Docker events for a stack. This is useful for monitoring what Docker is doing in real time — container state changes, image pulls, network activity, and more.

## Opening the modal

Click the **⋮ more** menu on any running stack row, then select **Events**.

## Layout

```
┌───────────────────────────────────────────────────────────────┐
│  Events — myapp                                         [✕]   │
├───────────────────────────────────────────────────────────────┤
│  [Stream events]                                              │
├───────────────────────────────────────────────────────────────┤
│  Time                 Type        Action   Service   Details  │
│  ─────────────────────────────────────────────────────────── │
│  Press 'Stream events' to start watching                      │
└───────────────────────────────────────────────────────────────┘
```

## Starting the stream

Click **Stream events**. The button is replaced by a **Stop** button and a spinner. Events begin appearing in the table as Docker generates them.

## Events table columns

| Column | Description |
|---|---|
| **Time** | Timestamp of when the event occurred |
| **Type** | The resource type: `container`, `image`, `network`, `volume`, or `daemon` |
| **Action** | What happened: `start`, `stop`, `die`, `kill`, `pull`, `create`, `destroy`, `connect`, `disconnect`, etc. |
| **Service** | The Compose service name the event relates to (if applicable) |
| **Details** | Additional metadata from the Docker event (exit codes, image names, network names, etc.) |

Rows are color-coded by event type for easier scanning.

The table **auto-scrolls** to the bottom as new events arrive.

## Stopping the stream

Click **Stop** to end the event stream. The existing rows remain visible.

## Clearing events

Click **Clear** (visible when not streaming and events are present) to remove all rows from the table.

## Closing the modal

Click **✕** or press **Escape**. The stream is stopped automatically.
