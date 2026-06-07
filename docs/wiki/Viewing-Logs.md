# Viewing Logs

The Logs modal streams the output from all containers in a stack in real time.

## Opening the modal

Click the **Logs** button on any stack row. The modal opens immediately and begins streaming.

## Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Logs — myapp                                             [✕]   │
├─────────────────────────────────────────────────────────────────┤
│  [All services ▼]  [🔍 Search logs…]  ● [Pause]  [↺]  [Clear]  │
├─────────────────────────────────────────────────────────────────┤
│  web    │ 2024-01-15 12:00:01 │ GET / 200                       │
│  db     │ 2024-01-15 12:00:02 │ connection ok                   │
│  web    │ 2024-01-15 12:00:03 │ GET /api 200                    │
│  ...                                                            │
└─────────────────────────────────────────────────────────────────┘
```

## Toolbar

| Control | Description |
|---|---|
| **Service dropdown** | Filter the stream to a single service, or show all. Only visible when the stack has more than one service. |
| **Search** | Live text filter — only lines containing the search term are shown. Matches are highlighted inline. |
| **● spinner** | Indicates live data is flowing in |
| **Pause** | Pauses the log stream — new lines are buffered but not displayed. Auto-scroll stops. |
| **Continue** | Resumes a paused stream and flushes buffered lines. Replaces **Pause** while paused. |
| **↺ Refresh** | Restarts the log stream from the beginning. Useful if the stream stalls. |
| **Clear** | Clears all displayed lines |

## Filtering by service

Use the service dropdown to narrow the output to a single service. Selecting a service restarts the log stream scoped to that service only. Select **All services** to return to the full output.

## Searching

Type in the search box to filter the visible lines in real time. Only lines whose full content contains the search term (case-insensitive) are shown. Matching text is highlighted inline. The stream continues running in the background while you search — new matching lines are added as they arrive.

Clear the search box to return to the full output.

## Log output

Each parsed line is displayed in three columns:

```
service_name  │  timestamp  │  message
```

- **Service names** are color-coded so you can visually distinguish output from different containers at a glance.
- **Error lines** are highlighted in red.
- **Warning lines** are highlighted in yellow/orange.
- Normal lines use the default text color.

The log view **auto-scrolls** to the bottom as new lines arrive. You can scroll up to review older output; auto-scroll pauses while you are scrolled up and resumes once you scroll back to the bottom. Auto-scroll is also suspended while the stream is paused.

## Buffer limit

The modal stores up to **10,000 lines** of output. When this limit is reached, a notice appears in the toolbar. Click **Clear** if you want to reset and see only new output.

## Closing the modal

Click **✕** in the top-right corner or press **Escape**. The log stream is stopped automatically when the modal closes.
