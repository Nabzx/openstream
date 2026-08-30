#!/usr/bin/env bash
#
# Stand up the Parakeet prototype server on :8178. Needs Python 3.10+ and
# a network connection on the first run to fetch parakeet-mlx and the model
# (~600 MB into the Hugging Face cache).
#
# With this running, start OpenStream normally: the app's whisper-server
# supervisor will fail to bind :8178 (it's taken), so instead run the app
# from source with the transcription server disabled - see README.md.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if [ ! -d .venv ]; then
  python3 -m venv .venv
  ./.venv/bin/pip install --quiet --upgrade pip
  ./.venv/bin/pip install --quiet "parakeet-mlx" "fastapi" "uvicorn" "numpy" "python-multipart"
fi

exec ./.venv/bin/python server.py
