#!/bin/sh
set -eu

REPOSITORY="lunce0503/flownote-service"
PREFIX="${HOME}/.local"
VERSION="${REMOTE_HOST_VERSION:-}"

usage() {
  cat <<'EOF'
Usage: install-remote-host.sh [--version X.Y.Z] [--prefix PATH]

Installs Flownote Remote Host for the current user. No sudo is used.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) VERSION="${2:?--version requires a value}"; shift 2 ;;
    --prefix) PREFIX="${2:?--prefix requires a value}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

for command in awk curl tar sha256sum node npm; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command is missing: $command" >&2
    exit 1
  fi
done

NODE_MAJOR=$(node -p "Number(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20 or newer is required (found $(node --version))." >&2
  exit 1
fi

if [ -z "$VERSION" ]; then
  RELEASE_JSON=$(curl --proto '=https' --tlsv1.2 -fsSL "https://api.github.com/repos/${REPOSITORY}/releases?per_page=100")
  TAG=$(printf '%s' "$RELEASE_JSON" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const r=JSON.parse(s).find(x=>/^remote-host-v/.test(x.tag_name));if(r)process.stdout.write(r.tag_name)})")
  case "$TAG" in
    remote-host-v*) VERSION=${TAG#remote-host-v} ;;
    *) echo "Latest release is not a Remote Host release." >&2; exit 1 ;;
  esac
else
  VERSION=${VERSION#remote-host-v}
  TAG="remote-host-v${VERSION}"
fi

case "$VERSION" in
  ''|*[!0-9.]*|.*|*..*|*.)
    echo "Invalid Remote Host version: $VERSION" >&2
    exit 2
    ;;
esac
if [ "$(printf '%s' "$VERSION" | awk -F. '{ print NF }')" -ne 3 ]; then
  echo "Invalid Remote Host version: $VERSION" >&2
  exit 2
fi

ASSET="remote-host-v${VERSION}.tar.gz"
BASE_URL="https://github.com/${REPOSITORY}/releases/download/${TAG}"
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/remote-host-install.XXXXXX")
trap 'rm -rf "$TMP_DIR"' EXIT HUP INT TERM

curl --proto '=https' --tlsv1.2 -fL "${BASE_URL}/${ASSET}" -o "${TMP_DIR}/${ASSET}"
curl --proto '=https' --tlsv1.2 -fL "${BASE_URL}/${ASSET}.sha256" -o "${TMP_DIR}/${ASSET}.sha256"
(cd "$TMP_DIR" && sha256sum -c "${ASSET}.sha256")

mkdir -p "${TMP_DIR}/package"
tar -xzf "${TMP_DIR}/${ASSET}" --strip-components=1 -C "${TMP_DIR}/package"
(cd "${TMP_DIR}/package" && npm ci --omit=dev --no-audit --no-fund)
node -e "import('${TMP_DIR}/package/node_modules/node-pty/lib/index.js').then(m => { if (typeof m.spawn !== 'function') process.exit(1) })"
chmod 0755 "${TMP_DIR}/package/dist/cli.js"

INSTALL_ROOT="${PREFIX}/lib/flownote-remote-host"
INSTALL_DIR="${INSTALL_ROOT}/${VERSION}"
BIN_DIR="${PREFIX}/bin"
mkdir -p "$INSTALL_ROOT" "$BIN_DIR"
rm -rf "$INSTALL_DIR"
mv "${TMP_DIR}/package" "$INSTALL_DIR"
ln -sfn "${INSTALL_DIR}/dist/cli.js" "${BIN_DIR}/remote-host"

printf 'Installed Flownote Remote Host %s\n' "$VERSION"
printf 'Executable: %s\n' "${BIN_DIR}/remote-host"
printf 'Next: remote-host doctor && remote-host init --host <LAN_OR_VPN_IP> --bind <LAN_OR_VPN_IP>\n'
