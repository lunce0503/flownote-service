#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly AUTOMATION_ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
readonly PROJECT_ROOT="$(cd "$AUTOMATION_ROOT/../.." && pwd)"
readonly BIN_DIR="${HOME:?HOME is required}/.local/bin"
readonly UNIT_DIR="$HOME/.config/systemd/user"
readonly DATA_DIR="$HOME/.local/share/flownote-codex"
readonly STATE_DIR="$HOME/.local/state/flownote-codex"
readonly AUTOMATION_REPOSITORY="$DATA_DIR/repo"
readonly CONTAINER_IMAGE="${FLOWNOTE_AUTOMATION_CONTAINER_IMAGE:-flownote-codex-automation:0.160.0}"

DRY_RUN=0
ENABLE_UNITS=0
CLONE_REPOSITORY=1
REPOSITORY_URL=''

usage() {
  cat <<'USAGE'
Usage: automation/codex/install.sh [options]

Options:
  --repository-url URL  Clone URL for the clean automation repository.
  --no-clone            Install scripts and units without cloning a repository.
  --enable              Enable the weekly/feedback timers and inbox path watcher.
  --dry-run             Print the installation plan without changing the server.
  -h, --help            Show this help.
USAGE
}

while (($#)); do
  case "$1" in
    --repository-url)
      [[ $# -ge 2 ]] || { echo "--repository-url requires a value." >&2; exit 64; }
      REPOSITORY_URL="$2"
      shift 2
      ;;
    --no-clone)
      CLONE_REPOSITORY=0
      shift
      ;;
    --enable)
      ENABLE_UNITS=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 64
      ;;
  esac
done

readonly BINARIES=(
  flownote-codex-run
  flownote-codex-dispatch
  flownote-codex-feedback-collect
  flownote-codex-notify
  flownote-codex-feedback-release
)

readonly UNITS=(
  'flownote-codex@.service'
  'flownote-codex-dispatch.service'
  'flownote-codex-inbox.path'
  'flownote-codex-weekly.timer'
  'flownote-codex-feedback.service'
  'flownote-codex-feedback.timer'
)

for binary in "${BINARIES[@]}"; do
  [[ -x "$AUTOMATION_ROOT/bin/$binary" ]] || {
    echo "Missing executable: $AUTOMATION_ROOT/bin/$binary" >&2
    exit 78
  }
done

for unit in "${UNITS[@]}"; do
  [[ -f "$AUTOMATION_ROOT/systemd/$unit" ]] || {
    echo "Missing systemd unit: $AUTOMATION_ROOT/systemd/$unit" >&2
    exit 78
  }
done

printf 'Flownote Codex automation installation plan\n'
printf '  project: %s\n' "$PROJECT_ROOT"
printf '  repository: %s\n' "$AUTOMATION_REPOSITORY"
printf '  state: %s\n' "$STATE_DIR"
printf '  container image: %s\n' "$CONTAINER_IMAGE"

for binary in "${BINARIES[@]}"; do
  printf '  binary: %s/%s\n' "$BIN_DIR" "$binary"
done

for unit in "${UNITS[@]}"; do
  printf '  unit: %s/%s\n' "$UNIT_DIR" "$unit"
done

if ((DRY_RUN)); then
  printf 'Dry run complete; no files were changed.\n'
  exit 0
fi

if [[ "${FLOWNOTE_AUTOMATION_SKIP_IMAGE_CHECK:-0}" != "1" ]]; then
  command -v docker >/dev/null 2>&1 || {
    echo "Docker is required for the isolated Codex runtime." >&2
    exit 69
  }
  if ! docker image inspect "$CONTAINER_IMAGE" >/dev/null 2>&1; then
    docker build --tag "$CONTAINER_IMAGE" "$AUTOMATION_ROOT/container"
  fi
fi

install -d -m 700 "$BIN_DIR" "$DATA_DIR" "$STATE_DIR"
install -d -m 700 \
  "$STATE_DIR/runs" \
  "$STATE_DIR/worktrees" \
  "$STATE_DIR/inbox" \
  "$STATE_DIR/processing" \
  "$STATE_DIR/done" \
  "$STATE_DIR/failed"
install -d -m 755 "$UNIT_DIR"

install_link() {
  local source="$1"
  local destination="$2"

  if [[ -L "$destination" ]]; then
    if [[ "$(readlink -f "$destination")" == "$(readlink -f "$source")" ]]; then
      return
    fi
    echo "Refusing to replace a different symlink: $destination" >&2
    exit 73
  fi

  if [[ -e "$destination" ]]; then
    echo "Refusing to replace an existing path: $destination" >&2
    exit 73
  fi

  ln -s "$source" "$destination"
}

for binary in "${BINARIES[@]}"; do
  install_link "$AUTOMATION_ROOT/bin/$binary" "$BIN_DIR/$binary"
done

for unit in "${UNITS[@]}"; do
  install -m 644 "$AUTOMATION_ROOT/systemd/$unit" "$UNIT_DIR/$unit"
done

if ((CLONE_REPOSITORY)); then
  if git -C "$AUTOMATION_REPOSITORY" rev-parse --git-dir >/dev/null 2>&1; then
    printf 'Automation repository already exists; clone skipped.\n'
  else
    if [[ -e "$AUTOMATION_REPOSITORY" ]]; then
      echo "Repository target exists but is not a Git repository: $AUTOMATION_REPOSITORY" >&2
      exit 73
    fi

    if [[ -z "$REPOSITORY_URL" ]]; then
      REPOSITORY_URL="$(git -C "$PROJECT_ROOT" remote get-url origin)"
    fi

    git clone --bare -- "$REPOSITORY_URL" "$AUTOMATION_REPOSITORY"
    git -C "$AUTOMATION_REPOSITORY" config \
      remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
    git -C "$AUTOMATION_REPOSITORY" fetch --prune origin
  fi
fi

systemctl --user daemon-reload

if ((ENABLE_UNITS)); then
  systemctl --user enable --now \
    flownote-codex-weekly.timer \
    flownote-codex-feedback.timer \
    flownote-codex-inbox.path
else
  cat <<'NEXT_STEPS'
Installed without enabling scheduled execution.

Test manually:
  systemctl --user start flownote-codex@weekly-review.service

Enable the safe triggers after inspecting the first result:
  systemctl --user enable --now flownote-codex-weekly.timer flownote-codex-feedback.timer flownote-codex-inbox.path
NEXT_STEPS
fi
