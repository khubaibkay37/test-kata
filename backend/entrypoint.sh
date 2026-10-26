#!/bin/sh
set -eu
python -c 'from seed import seed; seed()'
# gthread hands a connection to a thread only once a request arrives. Sync workers
# block on idle sockets, so WebKit's spare connections could stall every worker.
# See docs/webkit-parallel-workers.md.
exec gunicorn --bind 0.0.0.0:${PORT:-8000} --workers 2 --worker-class gthread --threads 4 'app:create_app()'
