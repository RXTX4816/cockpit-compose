# Viewing Logs

The Logs modal streams the output from all containers in a stack in real time.

## Opening the modal

Click the **Logs** button on any stack row. The modal opens immediately and begins streaming.

To see a single service, expand the stack row and click **Logs** next to that service — the modal opens already filtered to it.

## Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Logs — myapp                                                      [✕]   │
├──────────────────────────────────────────────────────────────────────────┤
│  [🔍 Search logs…] .* {}  42 lines   [All services ▼]                    │
│  [All] [Error] [Warn] [Info]  🕒  ●  [✕ Clear]       ⇑ ⇓ [⏸ Pause] ⬇ ↺   │
├──────────────────────────────────────────────────────────────────────────┤
│  [web]  GET / 200                                                        │
│  [db]   connection ok                                                    │
│  [web]  GET /api 200                                                     │
│  ...                                                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

## Toolbar

| Control | Description |
|---|---|
| **Search** | Live text filter — only matching lines are shown, with matches highlighted. |
| **.\*** | Treat the search as a regular expression. |
| **{}** | Pretty-print lines that contain JSON. |
| **Line count** | Number of lines currently shown. |
| **Service dropdown** | Show one service, or **All services**. Only visible when the stack has more than one service. Changing it restarts the stream for that service. |
| **All / Error / Warn / Info** | Filter by log level. **Error** shows only errors; **Warn** shows warnings and errors; **All** and **Info** show everything. |
| **🕒** | Show or hide timestamps. |
| **● spinner** | Live data is flowing in. |
| **Clear** | Clear the displayed lines. The stream keeps running. |
| **⇑ / ⇓** | Jump to the top or bottom of the output. |
| **Pause / Resume** | Freeze the output (auto-scroll stops) and pick it up again. |
| **⬇ Download** | Save the shown lines to a file. In browsers that can't save from inside Cockpit (such as Firefox), the file is written to `~/Downloads/` on the server instead, and a notice shows the path. |
| **↺ Refresh** | Restart the log stream. Useful if the stream stalls. |

## Log output

- **Service names** are color-coded so you can tell containers apart at a glance.
- **Error lines** are highlighted in red, **warnings** in yellow/orange.

The view **auto-scrolls** to the bottom as new lines arrive. Scroll up to review older output; auto-scroll pauses while you are scrolled up and resumes when you scroll back to the bottom.

## Line limit

The modal keeps the most recent **500 lines**. Once the limit is reached, a "showing last 500 lines" notice appears in the toolbar and older lines are dropped as new ones arrive.

## Closing the modal

Click **✕** in the top-right corner or press **Escape**. The log stream stops when the modal closes.
