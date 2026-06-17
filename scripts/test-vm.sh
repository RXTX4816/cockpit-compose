#!/usr/bin/env bash
# scripts/test-vm.sh — QEMU VM test harness for cockpit-compose
#
# Spins up Arch, Debian, and Fedora cloud VMs in three runtime scenarios:
#   podman — Podman only (podman-compose + docker-compose standalone for external provider)
#   docker  — Docker CE only (docker compose v2 plugin)
#   both    — Both runtimes installed side by side
#
# VM identifiers are <distro>-<scenario>, e.g. debian-podman, arch-both.
# Shortcuts: "arch" = all arch scenarios, "podman" = all podman scenarios, "all" = everything.
#
# Dependencies (Arch): qemu-full cloud-image-utils wget
#   sudo pacman -S qemu-full cloud-image-utils wget
#
# Quick start:
#   npm run build
#   ./scripts/test-vm.sh download debian
#   ./scripts/test-vm.sh start debian-podman
#   ./scripts/test-vm.sh wait debian-podman
#   # Open https://localhost:9093 — login: test / test

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VM_DIR="$PROJECT_DIR/.vms"
DIST_DIR="$PROJECT_DIR/src"

# Cloud image URLs
ARCH_IMAGE_URL="https://geo.mirror.pkgbuild.com/images/latest/Arch-Linux-x86_64-cloudimg.qcow2"
DEBIAN_IMAGE_URL="https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-generic-amd64.qcow2"
FEDORA_VERSION="41"
FEDORA_BUILD="1.4"
FEDORA_IMAGE_URL="https://download.fedoraproject.org/pub/fedora/linux/releases/${FEDORA_VERSION}/Cloud/x86_64/images/Fedora-Cloud-Base-Generic-${FEDORA_VERSION}-${FEDORA_BUILD}.x86_64.qcow2"

VM_MEM="${VM_MEM:-1024}"
VM_CPUS="${VM_CPUS:-2}"
VM_DISK_SIZE="${VM_DISK_SIZE:-12G}"

# All valid VM identifiers, in order. Port index = position in this list.
ALL_VMS=(
  arch-podman   arch-docker   arch-both
  debian-podman debian-docker debian-both
  fedora-podman fedora-docker fedora-both
)
# Base SSH/Cockpit port. VM at index N gets SSH=SSH_BASE+N, Cockpit=COCKPIT_BASE+N.
SSH_BASE=2220
COCKPIT_BASE=9090

# ── helpers ───────────────────────────────────────────────────────────────────

die()  { echo "ERROR: $*" >&2; exit 1; }
info() { echo "==> $*"; }
ok()   { echo "    ✓ $*"; }

usage() {
  cat <<EOF
Usage: $(basename "$0") <command> [vm ...]

VM identifiers:  arch-podman  arch-docker  arch-both
                 debian-podman  debian-docker  debian-both
                 fedora-podman  fedora-docker  fedora-both

Shortcuts:
  arch / debian / fedora  →  all three scenarios for that distro
  podman / docker / both  →  that scenario across all three distros
  all                     →  all 9 VMs

Commands:
  download [vm|distro|all]   Download base cloud images (one image per distro)
  build                      Run npm run build
  start    [vm ...]          Start VM(s) in background
  wait     <vm>              Block until cloud-init fully finishes (~2-5 min first boot)
  stop     [vm ...]          Stop VM(s)
  status                     Show all VMs with ports and running state
  ssh      <vm>              Open SSH session
  logs     <vm>              Tail VM serial console
  clean    <vm>              Wipe disk + state (base image kept); re-provisions on next start
  rebuild  [vm ...]          clean + start in one step (accepts same shortcuts as start)
  reset    <vm|distro>       Remove all VM files including base image

Ports (Cockpit / SSH):
$(for i in "${!ALL_VMS[@]}"; do
  vm="${ALL_VMS[$i]}"
  printf "  %-16s → https://localhost:%d  ssh -p %d test@localhost\n" \
    "$vm" "$((COCKPIT_BASE + i))" "$((SSH_BASE + i))"
done)

Login: test / test  (your ~/.ssh/id_*.pub is also injected if found)

Environment overrides:
  VM_MEM=2048   VM_CPUS=2   VM_DISK_SIZE=12G
EOF
  exit 1
}

check_deps() {
  local missing=()
  for cmd in qemu-system-x86_64 qemu-img wget; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done
  if ! command -v cloud-localds &>/dev/null \
  && ! command -v genisoimage &>/dev/null \
  && ! command -v mkisofs &>/dev/null; then
    missing+=("cloud-localds (cloud-image-utils) OR genisoimage")
  fi
  [[ ${#missing[@]} -eq 0 ]] || {
    echo "Missing dependencies:"
    printf '  %s\n' "${missing[@]}"
    echo ""
    echo "Install with:  sudo pacman -S qemu-full cloud-image-utils wget"
    exit 1
  }
}

# Returns the index of a VM in ALL_VMS, or dies.
vm_index() {
  local vm="$1"
  for i in "${!ALL_VMS[@]}"; do
    [[ "${ALL_VMS[$i]}" == "$vm" ]] && { echo "$i"; return; }
  done
  die "Unknown VM '$vm'. Valid: ${ALL_VMS[*]}, or shortcuts: arch/debian/fedora/podman/docker/both/all"
}

ssh_port()     { echo $((SSH_BASE     + $(vm_index "$1"))); }
cockpit_port() { echo $((COCKPIT_BASE + $(vm_index "$1"))); }

# Distro is everything before the first '-'
vm_distro()   { echo "${1%%-*}"; }
# Scenario is everything after the first '-'
vm_scenario() { echo "${1#*-}"; }

pid_file()    { echo "$VM_DIR/$1/qemu.pid"; }
disk_img()    { echo "$VM_DIR/$1/disk.qcow2"; }
# Base image is shared per distro, not per scenario
base_img()    { local d; d="$(vm_distro "$1")"; echo "$VM_DIR/$d/base.qcow2"; }
seed_iso()    { echo "$VM_DIR/$1/seed.iso"; }
console_log() { echo "$VM_DIR/$1/console.log"; }

is_running() {
  local pf; pf="$(pid_file "$1")"
  [[ -f "$pf" ]] && kill -0 "$(cat "$pf")" 2>/dev/null
}

# Expands shortcuts to a deduplicated list of VM identifiers.
resolve_vms() {
  [[ $# -eq 0 ]] && { echo "${ALL_VMS[@]}"; return; }
  local result=()
  for arg in "$@"; do
    case "$arg" in
      all)          result+=("${ALL_VMS[@]}") ;;
      arch)         result+=(arch-podman   arch-docker   arch-both) ;;
      debian)       result+=(debian-podman debian-docker debian-both) ;;
      fedora)       result+=(fedora-podman fedora-docker fedora-both) ;;
      podman)       result+=(arch-podman   debian-podman fedora-podman) ;;
      docker)       result+=(arch-docker   debian-docker fedora-docker) ;;
      both)         result+=(arch-both     debian-both   fedora-both) ;;
      arch-podman|arch-docker|arch-both|\
      debian-podman|debian-docker|debian-both|\
      fedora-podman|fedora-docker|fedora-both)
                    result+=("$arg") ;;
      *) die "Unknown VM or shortcut: '$arg'" ;;
    esac
  done
  # Deduplicate while preserving order
  local seen=() out=()
  for v in "${result[@]}"; do
    [[ " ${seen[*]} " == *" $v "* ]] && continue
    seen+=("$v"); out+=("$v")
  done
  echo "${out[@]}"
}

# Expands to distro names only (for download/reset).
resolve_distros() {
  [[ $# -eq 0 ]] && { echo "arch debian fedora"; return; }
  local result=()
  for arg in "$@"; do
    case "$arg" in
      all|podman|docker|both) result+=(arch debian fedora) ;;
      arch|arch-*)   result+=(arch) ;;
      debian|debian-*) result+=(debian) ;;
      fedora|fedora-*) result+=(fedora) ;;
      *) die "Unknown distro or shortcut: '$arg'" ;;
    esac
  done
  local seen=() out=()
  for v in "${result[@]}"; do
    [[ " ${seen[*]} " == *" $v "* ]] && continue
    seen+=("$v"); out+=("$v")
  done
  echo "${out[@]}"
}

find_ssh_pubkey() {
  for key in ~/.ssh/id_ed25519.pub ~/.ssh/id_rsa.pub ~/.ssh/id_ecdsa.pub; do
    [[ -f "$key" ]] && { cat "$key"; return; }
  done
  echo ""
}

make_seed_iso() {
  local iso="$1" userdata="$2" metadata="$3"
  if command -v cloud-localds &>/dev/null; then
    cloud-localds "$iso" "$userdata" "$metadata"
  elif command -v genisoimage &>/dev/null; then
    genisoimage -output "$iso" -volid cidata -joliet -rock "$userdata" "$metadata" 2>/dev/null
  else
    mkisofs -output "$iso" -volid cidata -joliet -rock "$userdata" "$metadata" 2>/dev/null
  fi
}

qemu_accel_args() {
  if [[ -r /dev/kvm ]]; then
    echo "-machine type=q35,accel=kvm -cpu host"
  else
    info "WARNING: /dev/kvm not accessible — running without KVM (will be slow)"
    echo "-machine type=q35"
  fi
}

# ── cloud-init user-data ──────────────────────────────────────────────────────

generate_userdata() {
  local vm="$1" ssh_pubkey="$2" outfile="$3"
  local distro; distro="$(vm_distro "$vm")"
  local scenario; scenario="$(vm_scenario "$vm")"

  local group
  case "$distro" in
    arch|fedora) group="wheel" ;;
    debian)      group="sudo" ;;
  esac

  local ssh_keys_block="    ssh_authorized_keys: []"
  [[ -n "$ssh_pubkey" ]] && ssh_keys_block="    ssh_authorized_keys:
      - ${ssh_pubkey}"

  # ── header ──────────────────────────────────────────────────────────────────
  cat > "$outfile" <<YAML
#cloud-config
hostname: ${vm}-test

users:
  - name: test
    groups: ${group}
    sudo: ALL=(ALL) NOPASSWD:ALL
    lock_passwd: false
${ssh_keys_block}

chpasswd:
  list: |
    test:test
  expire: false

package_update: true
package_upgrade: false
packages:
  - cockpit
YAML

  # ── podman packages ──────────────────────────────────────────────────────────
  if [[ "$scenario" == "podman" || "$scenario" == "both" ]]; then
    # passt is the Podman rootless network backend; not needed for Docker-only VMs
    printf '  - passt\n  - podman\n  - podman-compose\n' >> "$outfile"
    # docker-compose enables `podman compose` external provider — only for both scenario
    # (podman-only scenario should use podman-compose directly, not docker-compose)
    if [[ "$scenario" == "both" ]]; then
      case "$distro" in
        arch|debian) printf '  - docker-compose\n' >> "$outfile" ;;
      esac
    fi
  fi

  # ── docker packages: Arch only via pacman; Debian/Fedora via runcmd ──────────
  if [[ "$scenario" == "docker" || "$scenario" == "both" ]]; then
    if [[ "$distro" == "arch" ]]; then
      printf '  - docker\n  - docker-compose\n' >> "$outfile"
    fi
  fi

  # ── write_files ──────────────────────────────────────────────────────────────
  cat >> "$outfile" <<YAML

write_files:
  - path: /etc/modules-load.d/9p.conf
    content: |
      9p
      9pnet
      9pnet_virtio
  - path: /etc/containers/registries.conf.d/docker-io.conf
    content: |
      unqualified-search-registries = ["docker.io"]
    owner: root:root
    permissions: '0644'
YAML

  # ── pre-staged test stacks (testing.md §5) ───────────────────────────────────
  # Use single-quoted heredoc so $$ and other shell metacharacters are literal.
  cat >> "$outfile" <<'YAML'
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
  # depends-on: service dependency chain (app waits for db)
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
  # healthcheck: built-in container health monitoring
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
  # restart-policy: automatic restart on failure
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
  # custom-network: isolated custom bridge network between services
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
  # long-logs: high-volume log output for testing the log viewer
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
  # crash-loop: service that exits immediately (tests error display)
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
  # labels: custom metadata labels on services and containers
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
  # mixed-restart: combination of restart policies across services
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
  # named-networks: multiple isolated networks, services on specific ones
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
  # three-replicas: single service scaled to 3 replicas via deploy
  - path: /home/test/testcompose/three-replicas/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        worker:
          image: busybox
          command: sh -c "echo worker-$$(hostname); sleep infinity"
          deploy:
            replicas: 3
  # bind-mount: host directory bind-mounted into container
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
  # multiple-volumes: several named volumes with different drivers
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
  # ── prune feature test stacks (suffix: _prunetest) ───────────────────────────
  # pinned-version: single service with a pinned semver tag.
  # Scenario: bump the tag in the file (e.g. v3.0 → v3.1), re-up → old image
  # should appear in prune Images section.
  - path: /home/test/testcompose/pinned-version_prunetest/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        app:
          image: traefik:v3.0
          command: ["version"]
          restart: "no"
  # shared-image-a + shared-image-b: two independent stacks that both use nginx:alpine.
  # Scenario: down shared-image-a, open its prune dialog → nginx:alpine must NOT
  # appear because shared-image-b is still running with the same image.
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
  # latest-tag: stack using an explicit ":latest" tag (no version pinning).
  # Scenario: prune while running → image must NOT appear (tagless/latest detection).
  - path: /home/test/testcompose/latest-tag_prunetest/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        cache:
          image: redis:latest
          ports:
            - "8098:6379"
  # stable-tag: non-semver channel tag (lts, stable, unstable, etc.).
  # Scenario: verify prune handles named-channel tags the same as latest.
  - path: /home/test/testcompose/stable-tag_prunetest/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        app:
          image: node:lts-alpine
          command: node -e "setInterval(()=>{},1000)"
          ports:
            - "8099:3000"
  # exited-containers: one-shot job that exits immediately (restart: "no").
  # Scenario: up → job exits at once → prune Containers section should list it.
  # Also: run the same stack a second time without --rm to accumulate more stopped
  # containers (use the Run action in the UI with "echo hello" twice).
  - path: /home/test/testcompose/exited-containers_prunetest/docker-compose.yml
    permissions: '0644'
    content: |
      services:
        job:
          image: busybox
          command: sh -c "echo job-done"
          restart: "no"
  # named-volumes: stack with a named volume.
  # Scenario: up, then down (not prune) → volume becomes dangling → prune with
  # Volumes checkbox enabled should list pgdata_prunetest.
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
YAML

  # ── runcmd ───────────────────────────────────────────────────────────────────
  cat >> "$outfile" <<YAML

runcmd:
  # 9p modules + plugin mount from host
  - modprobe 9p 9pnet 9pnet_virtio || true
  - mkdir -p /usr/share/cockpit/cockpit-compose
  - echo "cockpit_compose /usr/share/cockpit/cockpit-compose 9p trans=virtio,version=9p2000.L,ro,_netdev 0 0" >> /etc/fstab
  - mount /usr/share/cockpit/cockpit-compose || true
  # Cockpit
  - systemctl enable --now cockpit.socket
  # write_files creates dirs under /home/test as root — fix ownership for all scenarios
  - chown test:test /home/test
  - chown -R test:test /home/test/testcompose /home/test/podmancompose
YAML

  # Podman setup
  if [[ "$scenario" == "podman" || "$scenario" == "both" ]]; then
    cat >> "$outfile" <<YAML
  # Podman — rootful socket + rootless socket for test user
  - systemctl enable --now podman.socket
  - systemctl --global enable podman.socket || true
  - loginctl enable-linger test
  # Delegate full cgroup subtree to user sessions so crun can freeze containers (needed for pause/unpause).
  - mkdir -p /etc/systemd/system/user@.service.d
  - printf '[Service]\nDelegate=yes\n' > /etc/systemd/system/user@.service.d/delegate.conf
  - systemctl daemon-reload
  - mkdir -p /root/.config/containers /home/test/.config/containers
  - printf '[network]\ndefault_rootless_network_cmd = "pasta"\n' > /root/.config/containers/containers.conf
  - printf '[network]\ndefault_rootless_network_cmd = "pasta"\n' > /home/test/.config/containers/containers.conf
  - chown -R test:test /home/test/.config
YAML
    # Debian bookworm ships podman-compose 1.0.3 which predates pause/unpause and version --format json.
    # Upgrade via pip so the installed version matches what Fedora/Arch ship from their repos.
    if [[ "$distro" == "debian" ]]; then
      cat >> "$outfile" <<YAML
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
      cat >> "$outfile" <<YAML
  - printf '[containers]\nlabel = false\n\n[network]\ndefault_rootless_network_cmd = "pasta"\n' > /root/.config/containers/containers.conf
  - printf '[containers]\nlabel = false\n\n[network]\ndefault_rootless_network_cmd = "pasta"\n' > /home/test/.config/containers/containers.conf
  - setsebool -P container_execmem 1 || true
YAML
    fi
  fi

  # Docker setup — varies by distro
  if [[ "$scenario" == "docker" || "$scenario" == "both" ]]; then
    case "$distro" in
      arch)
        cat >> "$outfile" <<YAML
  # Docker (Arch — from official repos)
  - systemctl enable --now docker
  - usermod -aG docker test
YAML
        ;;
      debian)
        cat >> "$outfile" <<YAML
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
        cat >> "$outfile" <<YAML
  # Docker CE (Fedora — from Docker's official dnf repo)
YAML
        # Only remove podman on docker-only Fedora VMs; both scenario keeps podman
        if [[ "$scenario" == "docker" ]]; then
          cat >> "$outfile" <<YAML
  - dnf remove -y podman podman-compose podman-docker || true
YAML
        fi
        cat >> "$outfile" <<YAML
  - curl -fsSL https://download.docker.com/linux/fedora/docker-ce.repo -o /etc/yum.repos.d/docker-ce.repo
  - dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  - systemctl enable --now docker
  - usermod -aG docker test
YAML
        ;;
    esac
  fi

  # Explicitly start the user's systemd instance so user-level services (podman.socket, D-Bus) are
  # active immediately after first boot rather than waiting for the first interactive login.
  # Also explicitly start podman.socket in the user session: --global enable marks it for autostart
  # but doesn't create the socket file. In the "both" scenario docker-compose acts as the podman
  # compose external provider and needs /run/user/UID/podman/podman.sock to exist immediately.
  if [[ "$scenario" == "podman" || "$scenario" == "both" ]]; then
    cat >> "$outfile" <<YAML
  - systemctl start "user@\$(id -u test).service" || true
  - su - test -c 'systemctl --user start podman.socket' || true
YAML
  fi

  # ── footer ───────────────────────────────────────────────────────────────────
  cat >> "$outfile" <<YAML

final_message: |
  ${vm} VM ready.
  Cockpit : https://localhost:$(cockpit_port "$vm")
  SSH     : ssh -p $(ssh_port "$vm") -o StrictHostKeyChecking=no test@localhost
  Login   : test / test
YAML
}

# ── commands ──────────────────────────────────────────────────────────────────

cmd_download() {
  local distros
  read -ra distros <<< "$(resolve_distros "$@")"

  for distro in "${distros[@]}"; do
    local url img
    case "$distro" in
      arch)   url="$ARCH_IMAGE_URL" ;;
      debian) url="$DEBIAN_IMAGE_URL" ;;
      fedora) url="$FEDORA_IMAGE_URL" ;;
    esac
    img="$VM_DIR/$distro/base.qcow2"
    mkdir -p "$VM_DIR/$distro"

    if [[ -f "$img" ]]; then
      info "$distro: base image already exists ($(du -sh "$img" | cut -f1)) — skipping"
      info "  To re-download: rm $img && $0 download $distro"
      continue
    fi

    info "$distro: downloading from $url"
    wget --progress=bar:force -O "${img}.tmp" "$url"
    mv "${img}.tmp" "$img"
    ok "$distro: saved to $img"
  done
}

cmd_build() {
  info "Building cockpit-compose plugin..."
  cd "$PROJECT_DIR"
  npm run build
  ok "Build complete → $DIST_DIR/main.js"
}

cmd_start() {
  local vms
  read -ra vms <<< "$(resolve_vms "$@")"

  for vm in "${vms[@]}"; do
    local distro scenario sp cp vm_path bimg dimg siso udata mdata
    distro="$(vm_distro "$vm")"
    scenario="$(vm_scenario "$vm")"
    sp="$(ssh_port "$vm")"
    cp="$(cockpit_port "$vm")"
    vm_path="$VM_DIR/$vm"
    bimg="$(base_img "$vm")"
    dimg="$(disk_img "$vm")"
    siso="$(seed_iso "$vm")"
    udata="$vm_path/user-data"
    mdata="$vm_path/meta-data"

    [[ -f "$bimg" ]] || die "$vm: base image missing — run: $0 download $distro"
    [[ -f "$DIST_DIR/main.js" ]] || die "src/main.js not found — run: $0 build (or npm run build)"

    if is_running "$vm"; then
      info "$vm: already running (PID $(cat "$(pid_file "$vm")"))"
      continue
    fi

    mkdir -p "$vm_path"

    if [[ ! -f "$dimg" || "$bimg" -nt "$dimg" ]]; then
      info "$vm: creating overlay disk (${VM_DISK_SIZE}) from $distro base..."
      qemu-img create -f qcow2 -b "$bimg" -F qcow2 "$dimg"
      qemu-img resize "$dimg" "$VM_DISK_SIZE"
    fi

    if [[ ! -f "$siso" ]]; then
      local ssh_pubkey
      ssh_pubkey="$(find_ssh_pubkey)"
      info "$vm: generating cloud-init seed (scenario: $scenario)..."
      [[ -n "$ssh_pubkey" ]] && ok "Found SSH public key — injecting into VM"
      generate_userdata "$vm" "$ssh_pubkey" "$udata"
      printf 'instance-id: %s-01\nlocal-hostname: %s-test\n' "$vm" "$vm" > "$mdata"
      make_seed_iso "$siso" "$udata" "$mdata"
    fi

    info "$vm: starting VM (mem=${VM_MEM}M cpus=${VM_CPUS} scenario=${scenario})..."

    local accel_str; accel_str="$(qemu_accel_args)"
    # shellcheck disable=SC2206
    local accel_args=($accel_str)

    qemu-system-x86_64 \
      -name "cockpit-compose-${vm}" \
      "${accel_args[@]}" \
      -smp "$VM_CPUS" \
      -m "$VM_MEM" \
      -drive "file=${dimg},format=qcow2,if=virtio,cache=writeback" \
      -drive "file=${siso},format=raw,if=virtio,readonly=on" \
      -virtfs "local,path=${DIST_DIR},mount_tag=cockpit_compose,security_model=none,readonly=on" \
      -netdev "user,id=net0,hostfwd=tcp:127.0.0.1:${sp}-:22,hostfwd=tcp:127.0.0.1:${cp}-:9090" \
      -device virtio-net-pci,netdev=net0 \
      -display none \
      -serial "file:$(console_log "$vm")" \
      -pidfile "$(pid_file "$vm")" \
      -daemonize

    ok "$vm: started (PID $(cat "$(pid_file "$vm")"))"
    echo ""
    echo "    Cockpit → https://localhost:${cp}  (accept self-signed cert)"
    echo "    SSH     → ssh -p ${sp} -o StrictHostKeyChecking=no test@localhost"
    echo "    Ready?  → $0 wait $vm   (blocks until cloud-init finishes)"
    echo "    Logs    → $0 logs $vm"
    echo ""
    if [[ "$scenario" == "docker" || "$scenario" == "both" ]] && [[ "$distro" != "arch" ]]; then
      echo "    NOTE: Docker CE installs from the internet during first boot (~5 min)."
      echo ""
    fi
  done
}

cmd_wait() {
  local vm="${1:-}"
  [[ -n "$vm" ]] || die "Usage: $0 wait <vm>"
  # Validate
  vm_index "$vm" > /dev/null
  local sp; sp="$(ssh_port "$vm")"

  is_running "$vm" || die "$vm is not running — start it first: $0 start $vm"

  info "$vm: waiting for SSH on port $sp..."
  local elapsed=0 timeout=300
  while ! ssh -p "$sp" \
              -o StrictHostKeyChecking=no \
              -o UserKnownHostsFile=/dev/null \
              -o ConnectTimeout=2 \
              -o BatchMode=yes \
              test@localhost true 2>/dev/null; do
    sleep 5; elapsed=$((elapsed + 5))
    [[ $elapsed -ge $timeout ]] && die "Timed out after ${timeout}s waiting for SSH"
    printf "."
  done
  echo ""
  info "$vm: SSH ready — waiting for cloud-init to complete..."
  # cloud-init 24.x exits with code 2 for recoverable warnings even when status is "done".
  # Check the status text rather than relying on exit code alone.
  local ci_out
  ci_out=$(ssh -p "$sp" \
               -o StrictHostKeyChecking=no \
               -o UserKnownHostsFile=/dev/null \
               -o ConnectTimeout=5 \
               -o BatchMode=yes \
               test@localhost 'sudo cloud-init status --wait' 2>/dev/null || true)
  if ! echo "$ci_out" | grep -q "status: done"; then
    echo ""
    echo "WARNING: cloud-init did not reach 'done' (got: $ci_out)"
    echo "         Check: $0 logs $vm"
    echo "         Or SSH in and run: sudo cloud-init status --long"
    return 1
  fi
  echo ""
  if ssh -p "$sp" \
         -o StrictHostKeyChecking=no \
         -o UserKnownHostsFile=/dev/null \
         -o BatchMode=yes \
         test@localhost 'sudo systemctl is-active cockpit.socket' 2>/dev/null | grep -q "^active"; then
    ok "$vm: VM is ready!"
  else
    echo "WARNING: cockpit.socket is not active — SSH in and check: sudo systemctl status cockpit.socket"
  fi
  echo ""
  echo "    Open  → https://localhost:$(cockpit_port "$vm")"
  echo "    Login → test / test"
}

cmd_stop() {
  local vms
  read -ra vms <<< "$(resolve_vms "$@")"

  for vm in "${vms[@]}"; do
    local pf; pf="$(pid_file "$vm")"
    if is_running "$vm"; then
      info "$vm: stopping (PID $(cat "$pf"))..."
      kill "$(cat "$pf")"
      local i=0
      while kill -0 "$(cat "$pf")" 2>/dev/null && [[ $i -lt 20 ]]; do
        sleep 0.5; i=$((i+1))
      done
      rm -f "$pf"
      ok "$vm: stopped"
    else
      info "$vm: not running"
    fi
  done
}

cmd_status() {
  local distros=(arch debian fedora)
  # Print base image status per distro
  echo ""
  echo "Base images:"
  for d in "${distros[@]}"; do
    local img="$VM_DIR/$d/base.qcow2"
    if [[ -f "$img" ]]; then
      printf "  %-8s  ✓  %s\n" "$d" "$(du -sh "$img" | cut -f1)"
    else
      printf "  %-8s  ✗  not downloaded\n" "$d"
    fi
  done
  echo ""
  printf "  %-18s  %-8s  %-8s  %s\n" "VM" "STATE" "COCKPIT" "SSH"
  printf "  %-18s  %-8s  %-8s  %s\n" "--" "-----" "-------" "---"
  for vm in "${ALL_VMS[@]}"; do
    local state cp sp
    cp="$(cockpit_port "$vm")"
    sp="$(ssh_port "$vm")"
    if is_running "$vm"; then
      state="running"
    elif [[ -f "$(disk_img "$vm")" ]]; then
      state="stopped"
    else
      state="not created"
    fi
    printf "  %-18s  %-8s  :%-7s  :%s\n" "$vm" "$state" "$cp" "$sp"
  done
  echo ""
}

cmd_ssh() {
  local vm="${1:-}"
  [[ -n "$vm" ]] || die "Usage: $0 ssh <vm>"
  vm_index "$vm" > /dev/null
  is_running "$vm" || die "$vm is not running — start it: $0 start $vm"
  exec ssh \
    -p "$(ssh_port "$vm")" \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    test@localhost
}

cmd_logs() {
  local vm="${1:-}"
  [[ -n "$vm" ]] || die "Usage: $0 logs <vm>"
  vm_index "$vm" > /dev/null
  local log; log="$(console_log "$vm")"
  [[ -f "$log" ]] || die "No console log yet for $vm (start it first)"
  exec tail -f "$log"
}

cmd_clean() {
  local vms
  read -ra vms <<< "$(resolve_vms "$@")"
  for vm in "${vms[@]}"; do
    is_running "$vm" && { info "$vm: stopping first"; cmd_stop "$vm"; }
    info "$vm: removing disk and cloud-init state (base image kept)..."
    rm -f "$(disk_img "$vm")" "$(seed_iso "$vm")" \
          "$VM_DIR/$vm/user-data" "$VM_DIR/$vm/meta-data" \
          "$(console_log "$vm")" "$(pid_file "$vm")"
    ok "$vm: cleaned — next 'start' will reprovision from the base image"
  done
}

cmd_rebuild() {
  local vms
  read -ra vms <<< "$(resolve_vms "$@")"
  cmd_clean "${vms[@]}"
  cmd_start "${vms[@]}"
}

cmd_reset() {
  local distros
  read -ra distros <<< "$(resolve_distros "$@")"
  for distro in "${distros[@]}"; do
    # Stop all VMs for this distro
    for vm in "${ALL_VMS[@]}"; do
      [[ "$(vm_distro "$vm")" == "$distro" ]] && is_running "$vm" && cmd_stop "$vm"
    done
    info "$distro: removing all VM files including base image..."
    rm -rf "$VM_DIR/$distro" \
           "$VM_DIR/$distro-podman" "$VM_DIR/$distro-docker" "$VM_DIR/$distro-both"
    ok "$distro: reset — run 'download $distro' to start fresh"
  done
}

# ── main ──────────────────────────────────────────────────────────────────────

check_deps

case "${1:-}" in
  download) shift; cmd_download "$@" ;;
  build)    shift; cmd_build    ;;
  start)    shift; cmd_start    "$@" ;;
  wait)     shift; cmd_wait     "$@" ;;
  stop)     shift; cmd_stop     "$@" ;;
  status)         cmd_status    ;;
  ssh)      shift; cmd_ssh      "$@" ;;
  logs)     shift; cmd_logs     "$@" ;;
  clean)    shift; cmd_clean    "$@" ;;
  rebuild)  shift; cmd_rebuild  "$@" ;;
  reset)    shift; cmd_reset    "$@" ;;
  *)               usage ;;
esac
