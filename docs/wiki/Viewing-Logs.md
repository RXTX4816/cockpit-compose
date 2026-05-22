# Viewing Logs

The Logs modal streams the output from all containers in a stack in real time.

## Opening the modal

Click the **Logs** button on any stack row. The modal opens immediately and begins streaming.

## Layout

```
┌─────────────────────────────────────────────────┐
│  Logs — myapp                             [✕]   │
├─────────────────────────────────────────────────┤
│  ● Streaming  [Stop]  [Clear]                   │
│  showing last 10,000 lines                      │
├─────────────────────────────────────────────────┤
│  web_1   | 2024-01-15 12:00:01 GET / 200        │
│  db_1    | 2024-01-15 12:00:02 connection ok    │
│  web_1   | 2024-01-15 12:00:03 GET /api 200     │
│  ...                                            │
└─────────────────────────────────────────────────┘
```

## Toolbar

| Control | Description |
|---|---|
| **● Streaming** spinner | Indicates live data is flowing in |
| **Stop** | Stops the log stream; existing lines remain visible |
| **Clear** | Clears all displayed lines (only available when not streaming or when there are lines) |
| **showing last 10,000 lines** | Notice that appears when the log buffer has been capped |

## Log output

Each line is formatted as:

```
service_name | timestamp  message
```

- **Service names** are color-coded so you can visually distinguish output from different containers at a glance.
- **Timestamps** are included in each line.
- **Error lines** (containing `error`, `fatal`, etc.) are highlighted in red.
- **Warning lines** are highlighted in yellow/orange.
- Normal lines use the default text color.

The log view **auto-scrolls** to the bottom as new lines arrive. You can scroll up to review older output; the view stops auto-scrolling while you are scrolled up and resumes once you scroll back to the bottom.

## Buffer limit

The modal stores up to **10,000 lines** of output. When this limit is reached, a notice appears in the toolbar: "showing last 10,000 lines". The oldest lines are not discarded — they remain visible for the session. Click **Clear** if you want to reset and see only new output.

## Closing the modal

Click **✕** in the top-right corner or press **Escape**. The log stream is stopped automatically when the modal closes.
