#!/usr/bin/env bash
#
# Public self-hosted verification entrypoint.
# The implementation currently lives in pilot-verify.sh for compatibility.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/pilot-verify.sh" "$@"
