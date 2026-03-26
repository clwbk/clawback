#!/usr/bin/env bash
# Start Mailpit for local SMTP capture. SMTP on :1025, web UI on :8025.
set -euo pipefail
docker run -d --name mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit
echo "Mailpit running — web UI: http://localhost:8025"
