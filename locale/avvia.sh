#!/bin/sh
# Mac e Linux: ./avvia.sh
cd "$(dirname "$0")" && exec python3 server.py "$@"
