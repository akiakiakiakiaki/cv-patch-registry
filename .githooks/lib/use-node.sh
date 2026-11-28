# Sourced by the hooks: run from the repository root with the Node version of .nvmrc.
# Git GUIs (e.g. VS Code) often start with a PATH whose first node is too old; use the .nvmrc version via nvm.
repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -f .nvmrc ] && [ -s "$NVM_DIR/nvm.sh" ]; then
  set +eu
  . "$NVM_DIR/nvm.sh" --no-use
  nvm use --silent >/dev/null
  set -eu
fi
