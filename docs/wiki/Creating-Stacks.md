# Creating Stacks

The Create Stack modal lets you create a new `docker-compose.yml` file on your server using one of three methods: from a Git URL, from a built-in template, or manually from scratch.

## Opening the modal

Click the **Create** button in the **Stopped / offline stacks** section at the bottom of the dashboard.

## Step 1 — Setup

```
┌──────────────────────────────────────────────────────┐
│  Create stack                                  [✕]   │
├──────────────────────────────────────────────────────┤
│  Stack name *                                        │
│  [myapp                                   ]          │
│                                                      │
│  Compose root directory *                            │
│  [/etc/docker/compose              ] [Best match]    │
│                                                      │
│  Creation method *                                   │
│  ○ From Git URL                                      │
│  ○ From template                                     │
│  ○ Manual                                            │
├──────────────────────────────────────────────────────┤
│                               [Next →]  [Cancel]     │
└──────────────────────────────────────────────────────┘
```

### Fields

| Field | Description |
|---|---|
| **Stack name** | The name for your new stack. Must not contain spaces or slashes. This becomes the Compose project name and the folder name under the root directory. |
| **Compose root directory** | The parent directory where the new stack folder will be created. For example, if you enter `/etc/docker/compose` and a stack name of `myapp`, the file will be created at `/etc/docker/compose/myapp/docker-compose.yml`. If you have existing stacks, this is pre-filled based on where they're stored. Otherwise, it defaults to `/etc/docker/compose` — or, if you're running rootless Docker/Podman (see [Podman Compatibility](Podman-Compatibility)), to `<your home directory>/compose`, since `/etc` typically isn't writable without root. |
| **Best match** button | Automatically suggests a root directory based on where your other active stacks are stored. Useful if all your stacks share a common parent directory. |
| **Creation method** | How the compose file content will be generated — see the three options below. |

Validation errors are shown inline below each field. The **Next →** button is disabled until all required fields are filled in correctly.

---

## Method: From Git URL

Clone a Git repository to use as the source for your compose file.

```
┌──────────────────────────────────────────────────────┐
│  Create stack — myapp                          [✕]   │
├──────────────────────────────────────────────────────┤
│  Git URL                                             │
│  [https://github.com/example/myapp  ] [Fetch]        │
│                                                      │
│  ⚠ Review before creating                            │
│  Always review compose files from external sources.  │
│                                                      │
│  [YAML editor — review and optionally modify]        │
├──────────────────────────────────────────────────────┤
│              [Create]  [← Back]  [Cancel]            │
└──────────────────────────────────────────────────────┘
```

1. Enter the Git repository URL.
2. Click **Fetch**. Cockpit Compose clones the repository and loads the `docker-compose.yml` found in it into the editor.
3. If the fetch fails (wrong URL, private repo, no compose file), an error alert is shown.
4. **Always review the fetched compose file** before creating. External sources may contain unexpected configuration.
5. You can edit the content in the YAML editor before clicking **Create**.
6. Click **Create** to write the file to disk.

---

## Method: From template

Choose a pre-built compose file template as your starting point.

```
┌──────────────────────────────────────────────────────┐
│  Create stack — myapp                          [✕]   │
├──────────────────────────────────────────────────────┤
│  ┌───────────────┐  ┌───────────────┐               │
│  │ Minimal       │  │ Small         │  ...           │
│  │ Single svc,   │  │ (app + db)    │               │
│  │ port, restart │  │ Two services  │               │
│  └───────────────┘  └───────────────┘               │
│                                                      │
│  [YAML editor — selected template content]           │
├──────────────────────────────────────────────────────┤
│              [Create]  [← Back]  [Cancel]            │
└──────────────────────────────────────────────────────┘
```

Available templates:

| Template | Description |
|---|---|
| **Minimal** | Single service with a port mapping and restart policy |
| **Small (app + db)** | Two services sharing a named network |
| **Volumes** | Named volume, bind mount, and tmpfs examples |
| **Networking** | Custom bridge network with aliases and an internal backend network |
| **Healthcheck & deps** | `healthcheck`, `depends_on` with condition, and `restart: on-failure` |
| **Full example** | Networks, volumes, healthcheck, env_file, multiple services |

1. Click on a template card. The template's compose file content loads into the editor.
2. Review and modify the content — change image names, port numbers, environment variables, etc. All templates use placeholder image names (`my-app:latest`, `my-db:latest`) that must be replaced.
3. Click **Create** to write the file to disk.

---

## Method: Manual

Start from a minimal stub and write the compose file yourself.

```
┌──────────────────────────────────────────────────────┐
│  Create stack — myapp                          [✕]   │
├──────────────────────────────────────────────────────┤
│  [YAML editor — minimal stub]                        │
│                                                      │
│   services:                                          │
│     app:                                             │
│       image: ""                                      │
├──────────────────────────────────────────────────────┤
│              [Create]  [← Back]  [Cancel]            │
└──────────────────────────────────────────────────────┘
```

The editor starts with a minimal stub. Write your compose file from scratch. The editor provides YAML syntax highlighting and Docker Compose schema validation as you type.

Click **Create** when ready.

---

## Validation on create

Before writing the file, Cockpit Compose validates the YAML and Docker Compose schema. If there are errors or warnings, a confirmation prompt appears:

> There are N error(s) / warning(s). Create anyway?

You can proceed despite warnings if you understand them. Errors should generally be fixed first.

---

## After creating

The new stack folder and `docker-compose.yml` are written to disk. The stack appears in the **Stopped / offline stacks** section. Click **Up** to bring it online.
