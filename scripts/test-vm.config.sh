#!/usr/bin/env bash
# Plugin-specific VM config for cockpit-compose.
# Sourced by node_modules/@rxtx4816/cockpit-plugin-base/scripts/test-vm.sh

PLUGIN_NAME="cockpit-compose"
MOUNT_TAG="cockpit_compose"
INSTALL_PATH="/usr/share/cockpit/cockpit-compose"

ALL_VMS=(
  arch-podman   arch-docker   arch-both
  debian-podman debian-docker debian-both
  fedora-podman fedora-docker fedora-both
  fedora-podman-rootful
  fedora-full
)
SSH_BASE=2220
COCKPIT_BASE=9090

# $1=distro  $2=vm (full name, e.g. arch-podman — used to determine scenario)
extra_packages() {
  local distro="$1"
  local vm="${2:-}"
  local scenario="${vm#*-}"

  # git — needed by every scenario for Create Stack's "From Git URL" method
  printf 'git\n'

  # Podman packages
  if [[ "$scenario" == "podman" || "$scenario" == "both" || "$scenario" == "podman-rootful" || "$scenario" == "full" ]]; then
    # passt is the Podman rootless network backend; not needed for Docker-only VMs
    # fuse-overlayfs — rootless Podman's overlay storage falls back to it when
    # the backing filesystem doesn't support native overlay directly (e.g. the
    # Arch cloud image's root fs is btrfs); without it, rootless podman fails
    # outright with "kernel does not support overlay fs ... over btrfs".
    printf 'passt\npodman\npodman-compose\nfuse-overlayfs\n'
    # docker-compose as external podman compose provider (both scenario, arch/debian only)
    if [[ "$scenario" == "both" ]]; then
      case "$distro" in
        arch|debian) printf 'docker-compose\n' ;;
      esac
    fi
  fi

  # Docker packages — Arch installs from pacman; Debian/Fedora install Docker CE via runcmd
  if [[ "$scenario" == "docker" || "$scenario" == "both" || "$scenario" == "full" ]]; then
    if [[ "$distro" == "arch" ]]; then
      printf 'docker\ndocker-compose\n'
    fi
  fi

  # fedora-full note: rootless Docker's newuidmap/newgidmap ship in Fedora's base shadow-utils
  # package (already present on every install) — there's no separate "uidmap" package like on
  # Debian/Ubuntu, so nothing extra is needed here for that.
  # docker-ce-rootless-extras is NOT listed here — it only exists in Docker's own repo, which
  # is added later via runcmd, after this initial package list is installed. Listing it here
  # would fail the whole `dnf install` transaction atomically (taking cockpit down with it).
}

extra_runcmd() {
  local vm="$1"
  local distro="${vm%%-*}"
  local scenario="${vm#*-}"

  # write_files creates dirs under /home/test as root — fix ownership
  cat <<YAML
  - chown test:test /home/test
  - chown -R test:test /home/test/testcompose /home/test/podmancompose
YAML

  # Arch is rolling-release and the harness disables package_upgrade (only
  # package_update, i.e. `pacman -Sy` without `-u`, runs before `packages:` is
  # installed) — as the base image ages relative to the live repos, freshly
  # installed packages (e.g. podman) can end up linked against a newer ABI
  # than already-baked-in dependencies still on disk (e.g. shadow/libsubid),
  # a classic Arch "partial upgrade" breakage. Symptom seen: podman fails
  # immediately with "error while loading shared libraries: libsubid.so.6:
  # cannot open shared object file". Full upgrade here, after packages are
  # already installed, resolves it the same way a manual `pacman -Syu` did.
  if [[ "$distro" == "arch" ]]; then
    cat <<YAML
  - pacman -Syu --noconfirm
YAML
  fi

  # ── Podman setup ──────────────────────────────────────────────────────────────
  if [[ "$scenario" == "podman" || "$scenario" == "both" || "$scenario" == "podman-rootful" || "$scenario" == "full" ]]; then
    cat <<YAML
  # Podman — system-wide rootful socket, needed by every podman scenario
  - systemctl enable --now podman.socket
  - mkdir -p /root/.config/containers
  - printf '[network]\ndefault_rootless_network_cmd = "pasta"\n' > /root/.config/containers/containers.conf
YAML

    if [[ "$scenario" == "podman-rootful" ]]; then
      cat <<YAML
  # Rootful-only scenario (issue #242 regression test): deliberately skip linger/user-session
  # setup below so /run/user/<uid>/podman/podman.sock never exists — only the system-wide
  # /run/podman/podman.sock is available, exactly like a "sudo podman compose up" setup.
YAML
    else
      cat <<YAML
  # Rootless socket for test user (podman/both scenarios only)
  - systemctl --global enable podman.socket || true
  - loginctl enable-linger test
  # Delegate full cgroup subtree to user sessions so crun can freeze containers (needed for pause/unpause).
  - mkdir -p /etc/systemd/system/user@.service.d
  - printf '[Service]\nDelegate=yes\n' > /etc/systemd/system/user@.service.d/delegate.conf
  - systemctl daemon-reload
  - mkdir -p /home/test/.config/containers
  - printf '[network]\ndefault_rootless_network_cmd = "pasta"\n' > /home/test/.config/containers/containers.conf
  - chown -R test:test /home/test/.config
YAML
    fi

    # Debian bookworm ships podman-compose 1.0.3 which predates pause/unpause and version --format json.
    # Upgrade via pip so the installed version matches what Fedora/Arch ship from their repos.
    if [[ "$distro" == "debian" ]]; then
      cat <<YAML
  - apt-get install -y python3-pip dbus-user-session
  - pip3 install --break-system-packages --upgrade podman-compose
  - ln -sf /usr/local/bin/podman-compose /usr/bin/podman-compose
  # Podman 4.3.1 (bookworm) with cgroup_manager=systemd routes StartTransientUnit to the
  # system D-Bus, which creates the scope under a session slice that lacks Delegate=yes;
  # crun can't create sub-cgroups there (needed for pause/unpause). Use cgroupfs manager
  # to bypass D-Bus and pin cgroup_parent to user@1000.service which has Delegate=yes
  # (set in delegate.conf above), so crun can write cgroup.freeze for the container.
  - printf '[engine]\ncgroup_manager = "cgroupfs"\n\n[containers]\ncgroup_parent = "user.slice/user-1000.slice/user@1000.service/app.slice"\n\n[network]\ndefault_rootless_network_cmd = "pasta"\n' > /home/test/.config/containers/containers.conf
YAML
    fi

    # Fedora: SELinux denies mprotect() inside containers (RELRO hardening in glibc/musl images).
    # Disable SELinux labeling for containers via containers.conf; setsebool is a belt-and-suspenders
    # fallback in case label=false is insufficient on some policy versions.
    if [[ "$distro" == "fedora" ]]; then
      cat <<YAML
  - printf '[containers]\nlabel = false\n\n[network]\ndefault_rootless_network_cmd = "pasta"\n' > /root/.config/containers/containers.conf
  - setsebool -P container_execmem 1 || true
YAML
      if [[ "$scenario" != "podman-rootful" ]]; then
        cat <<YAML
  - printf '[containers]\nlabel = false\n\n[network]\ndefault_rootless_network_cmd = "pasta"\n' > /home/test/.config/containers/containers.conf
YAML
      fi
    fi
  fi

  # ── Docker setup (rootful) ────────────────────────────────────────────────────
  if [[ "$scenario" == "docker" || "$scenario" == "both" || "$scenario" == "full" ]]; then
    case "$distro" in
      arch)
        cat <<YAML
  # Docker (Arch — from official repos)
  - systemctl enable --now docker
  - usermod -aG docker test
YAML
        ;;
      debian)
        cat <<YAML
  # Docker CE (Debian — from Docker's official apt repo)
  - apt-get install -y ca-certificates curl gnupg
  - install -m 0755 -d /etc/apt/keyrings
  - curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  - chmod a+r /etc/apt/keyrings/docker.gpg
  - echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" | tee /etc/apt/sources.list.d/docker.list
  - apt-get update
  - apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  - systemctl enable --now docker
  - usermod -aG docker test
YAML
        ;;
      fedora)
        # Only remove podman on docker-only Fedora VMs; both scenario keeps podman
        if [[ "$scenario" == "docker" ]]; then
          cat <<YAML
  - dnf remove -y podman podman-compose podman-docker || true
YAML
        fi
        cat <<YAML
  # Docker CE (Fedora — from Docker's official dnf repo)
  - curl -fsSL https://download.docker.com/linux/fedora/docker-ce.repo -o /etc/yum.repos.d/docker-ce.repo
  - dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin$( [[ "$scenario" == "full" ]] && printf ' docker-ce-rootless-extras' )
  - systemctl enable --now docker
  - usermod -aG docker test
YAML
        ;;
    esac
  fi

  # ── Docker setup (rootless, fedora-full only) ────────────────────────────────
  # EXPERIMENTAL: rootless Docker is a genuinely separate daemon/socket from the rootful one
  # (unlike Podman, which shares one binary across both modes) — this recipe follows Docker's
  # documented rootless install (https://docs.docker.com/engine/security/rootless/) but has not
  # been verified end-to-end by actually booting this scenario. Treat first boot as best-effort;
  # if `dockerd-rootless-setuptool.sh install` fails, `npm run vm logs fedora-full` and
  # `journalctl --user -u docker` (as the test user) are the first places to look.
  if [[ "$scenario" == "full" ]]; then
    cat <<YAML
  # Rootless Docker needs subuid/subgid ranges for the test user (cloud images don't always
  # pre-populate these for non-root users).
  - grep -q "^test:" /etc/subuid || echo "test:100000:65536" >> /etc/subuid
  - grep -q "^test:" /etc/subgid || echo "test:100000:65536" >> /etc/subgid
  - loginctl enable-linger test
  - mkdir -p /etc/systemd/system/user@.service.d
  - printf '[Service]\nDelegate=yes\n' > /etc/systemd/system/user@.service.d/delegate.conf
  - systemctl daemon-reload
  - systemctl start "user@\$(id -u test).service" || true
  # --force: the setuptool refuses to run otherwise when rootful Docker (enabled earlier in this
  # same runcmd, above) is already active and accessible — confirmed by actually running this
  # without --force on a booted VM: "Aborting because rootful Docker (/var/run/docker.sock) is
  # running and accessible. Set --force to ignore." We want both running side by side, so force it.
  - su - test -c 'PATH=/usr/bin:\$PATH dockerd-rootless-setuptool.sh install --force' || true
  - su - test -c 'systemctl --user enable --now docker' || true
YAML
  fi

  # Explicitly start the user's systemd instance so user-level services (podman.socket, D-Bus) are
  # active immediately after first boot rather than waiting for the first interactive login.
  # Also explicitly start podman.socket in the user session: --global enable marks it for autostart
  # but doesn't create the socket file. In the "both" scenario docker-compose acts as the podman
  # compose external provider and needs /run/user/UID/podman/podman.sock to exist immediately.
  # "full" needs this too — confirmed by booting a VM without it: rootless podman.socket ended up
  # enabled (from --global enable above) but never actually started, staying "inactive" forever.
  # Skipped for podman-rootful: that scenario must NOT have a rootless socket (see above).
  if [[ "$scenario" == "podman" || "$scenario" == "both" || "$scenario" == "full" ]]; then
    cat <<YAML
  - systemctl start "user@\$(id -u test).service" || true
  - su - test -c 'systemctl --user start podman.socket' || true
YAML
  fi

  # The `pacman -Syu` above (see its comment) can pull in a newer kernel
  # package, but the VM keeps running whatever kernel it already booted —
  # its modules on disk get replaced by the new kernel version's, so they no
  # longer match the *running* kernel. Symptom seen: netavark's rootless
  # bridge creation failing with "Netlink error: Operation not supported"
  # (a kernel networking module the running kernel can no longer load).
  # Reboot last, after every other setup step, so the new kernel/modules are
  # actually active before cockpit-compose ever tries to start a container.
  # cloud-init reruns on the new boot but recognizes this instance was
  # already provisioned and skips straight to done — confirmed by `vm wait`
  # completing normally afterward.
  if [[ "$distro" == "arch" ]]; then
    cat <<YAML
  - reboot
YAML
  fi
}

pre_staged_files() {
  # Test stacks are the same across all scenarios; registries.conf needed for all
  cat <<'YAML'
  - path: /etc/containers/registries.conf.d/docker-io.conf
    content: |
      unqualified-search-registries = ["docker.io"]
    owner: root:root
    permissions: '0644'
  - path: /home/test/testcompose/gotify/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        gotify:
          image: gotify/server
          ports:
            - "8080:80"
          environment:
            GOTIFY_DEFAULTUSER_PASS: admin
          volumes:
            - ./data:/app/data
  - path: /home/test/testcompose/multi/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        web:
          image: nginx:alpine
          ports:
            - "8081:80"
        cache:
          image: redis:alpine
        worker:
          image: busybox
          command: sh -c "while true; do echo worker-tick; sleep 3; done"
  - path: /home/test/testcompose/profiles/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        app:
          image: nginx:alpine
          ports:
            - "8082:80"
        debug:
          image: busybox
          profiles: [dev]
          command: sleep infinity
        monitoring:
          image: busybox
          profiles: [monitoring]
          command: sh -c "while true; do echo monitor; sleep 5; done"
  - path: /home/test/testcompose/multi-file/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        app:
          image: nginx:alpine
          ports:
            - "8083:80"
  - path: /home/test/testcompose/multi-file/overrides.yml
    permissions: '0644'
    content: |
      services:
        app:
          environment:
            NGINX_HOST: localhost
          labels:
            test: override-label
  - path: /home/test/testcompose/volumes-test/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        db:
          image: postgres:alpine
          environment:
            POSTGRES_PASSWORD: secret
          volumes:
            - pgdata:/var/lib/postgresql/data
        app:
          image: nginx:alpine
          ports:
            - "8084:80"
      volumes:
        pgdata:
  - path: /home/test/testcompose/scale-test/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        worker:
          image: busybox
          command: sh -c "echo worker-$$; sleep infinity"
        web:
          image: nginx:alpine
          ports:
            - "8085:80"
  - path: /home/test/podmancompose/nonet/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        hello:
          image: busybox
          command: sh -c "while true; do echo ping; sleep 2; done"
          network_mode: none
  - path: /home/test/testcompose/env-test/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        app:
          image: nginx:alpine
          env_file: .env
          ports:
            - "8086:80"
  - path: /home/test/testcompose/env-test/.env
    permissions: '0644'
    content: |
      APP_ENV=development
      SECRET_KEY=test-secret-123
      DEBUG=true
  - path: /home/test/testcompose/depends-on/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        db:
          image: postgres:alpine
          environment:
            POSTGRES_PASSWORD: secret
            POSTGRES_DB: app
        app:
          image: nginx:alpine
          ports:
            - "8087:80"
          depends_on:
            - db
  - path: /home/test/testcompose/healthcheck/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        web:
          image: nginx:alpine
          ports:
            - "8088:80"
          healthcheck:
            test: ["CMD", "wget", "-qO-", "http://localhost/"]
            interval: 10s
            timeout: 5s
            retries: 3
            start_period: 5s
  - path: /home/test/testcompose/restart-policy/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        flaky:
          image: busybox
          command: sh -c "echo starting; sleep 5; exit 1"
          restart: on-failure
        stable:
          image: nginx:alpine
          ports:
            - "8089:80"
          restart: unless-stopped
  - path: /home/test/testcompose/custom-network/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        frontend:
          image: nginx:alpine
          ports:
            - "8090:80"
          networks:
            - frontend
            - backend
        api:
          image: nginx:alpine
          networks:
            - backend
        db:
          image: postgres:alpine
          environment:
            POSTGRES_PASSWORD: secret
          networks:
            - backend
      networks:
        frontend:
        backend:
          internal: true
  - path: /home/test/testcompose/long-logs/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        logger:
          image: busybox
          command: sh -c "n=0; while true; do n=$$((n+1)); echo \"request $$n processed\"; sleep 0.3; done"
        web:
          image: nginx:alpine
          ports:
            - "8091:80"
  - path: /home/test/testcompose/crash-loop/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        crasher:
          image: busybox
          command: sh -c "echo 'about to crash'; exit 1"
          restart: on-failure
        sidecar:
          image: busybox
          command: sh -c "while true; do echo sidecar-ok; sleep 5; done"
  - path: /home/test/testcompose/labels/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        web:
          image: nginx:alpine
          ports:
            - "8092:80"
          labels:
            app.tier: frontend
            app.version: "1.0"
            traefik.enable: "true"
            traefik.http.routers.web.rule: Host(`web.local`)
        api:
          image: nginx:alpine
          labels:
            app.tier: backend
            app.version: "1.0"
  - path: /home/test/testcompose/mixed-restart/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        always:
          image: busybox
          command: sh -c "while true; do echo always-running; sleep 3; done"
          restart: always
        never:
          image: busybox
          command: sh -c "echo done-and-exit; sleep 2"
          restart: "no"
        onfailure:
          image: busybox
          command: sh -c "echo fail; exit 1"
          restart: on-failure:3
  - path: /home/test/testcompose/named-networks/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        proxy:
          image: nginx:alpine
          ports:
            - "8093:80"
          networks:
            - dmz
            - app
        app:
          image: nginx:alpine
          networks:
            - app
            - data
        cache:
          image: redis:alpine
          networks:
            - data
        db:
          image: postgres:alpine
          environment:
            POSTGRES_PASSWORD: secret
          networks:
            - data
      networks:
        dmz:
        app:
        data:
          internal: true
  - path: /home/test/testcompose/three-replicas/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        worker:
          image: busybox
          command: sh -c "echo worker-$$(hostname); sleep infinity"
          deploy:
            replicas: 3
  - path: /home/test/testcompose/bind-mount/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        web:
          image: nginx:alpine
          ports:
            - "8094:80"
          volumes:
            - ./html:/usr/share/nginx/html:ro
  - path: /home/test/testcompose/bind-mount/html/index.html
    permissions: '0644'
    content: |
      <!DOCTYPE html>
      <html><body><h1>bind-mount test</h1></body></html>
  - path: /home/test/testcompose/multiple-volumes/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        db:
          image: postgres:alpine
          environment:
            POSTGRES_PASSWORD: secret
          volumes:
            - pgdata:/var/lib/postgresql/data
        cache:
          image: redis:alpine
          volumes:
            - redisdata:/data
        app:
          image: nginx:alpine
          ports:
            - "8095:80"
          volumes:
            - appdata:/usr/share/nginx/html
      volumes:
        pgdata:
        redisdata:
        appdata:
  - path: /home/test/testcompose/pinned-version_prunetest/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        app:
          image: traefik:v3.0
          command: ["version"]
          restart: "no"
  - path: /home/test/testcompose/shared-image-a_prunetest/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        web:
          image: nginx:alpine
          ports:
            - "8096:80"
  - path: /home/test/testcompose/shared-image-b_prunetest/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        proxy:
          image: nginx:alpine
          ports:
            - "8097:80"
  - path: /home/test/testcompose/latest-tag_prunetest/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        cache:
          image: redis:latest
          ports:
            - "8098:6379"
  - path: /home/test/testcompose/stable-tag_prunetest/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        app:
          image: node:lts-alpine
          command: node -e "setInterval(()=>{},1000)"
          ports:
            - "8099:3000"
  - path: /home/test/testcompose/exited-containers_prunetest/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        job:
          image: busybox
          command: sh -c "echo job-done"
          restart: "no"
  - path: /home/test/testcompose/named-volumes_prunetest/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        db:
          image: postgres:alpine
          environment:
            POSTGRES_PASSWORD: secret
          volumes:
            - pgdata_prunetest:/var/lib/postgresql/data
      volumes:
        pgdata_prunetest:
  # For 6.22's localhost/specific-bind port cases (src/api/parsing.ts's
  # getBindType): 127.0.0.1 is classified "localhost", any other address
  # (even another loopback one, like 127.0.0.2) is "specific" — no real
  # non-loopback network config needed to exercise both branches.
  - path: /home/test/testcompose/port-binds/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        localhost-only:
          image: nginx:alpine
          ports:
            - "127.0.0.1:8100:80"
        specific-bind:
          image: nginx:alpine
          ports:
            - "127.0.0.2:8101:80"
YAML
}
