#!/bin/sh
# Linux Compose wrapper. Mount settings are data, never shell commands.
set -eu
project_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$project_dir"
if [ "$#" -eq 0 ]; then
    set -- up -d --build --wait
fi
mount_env=/dev/null
if [ -f .env ]; then mount_env=.env; fi
umask 077
mount_work=$(mktemp -d "${TMPDIR:-/tmp}/filehub-compose.XXXXXXXX")
cleanup() {
    rm -f "$mount_work/mounts.json"
    rmdir "$mount_work"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
awk -f "$project_dir/scripts/compose-mounts.awk" "$mount_env" > "$mount_work/mounts.json"
if [ -f .env ]; then
    docker compose --project-directory "$project_dir" --env-file "$project_dir/.env" \
        -f "$project_dir/compose.yaml" -f "$mount_work/mounts.json" "$@"
else
    docker compose --project-directory "$project_dir" \
        -f "$project_dir/compose.yaml" -f "$mount_work/mounts.json" "$@"
fi
