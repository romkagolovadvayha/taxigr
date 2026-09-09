#!/usr/bin/env bash
set -Eeuo pipefail

source_file="${1:?Usage: upload-file.sh local-file remote-target}"
target="${2:?Remote target is required}"
upload_timeout="${UPLOAD_TIMEOUT_SECONDS:-180}"
[[ "$upload_timeout" =~ ^[1-9][0-9]*$ ]] || { echo 'Invalid upload timeout' >&2; exit 1; }
test -f "$source_file"

bytes="$(wc -c < "$source_file")"
echo "Uploading $(basename "$source_file") ($bytes bytes); timeout $upload_timeout seconds per attempt"

# Current scp uses SFTP. A second attempt with the SCP protocol also handles
# servers where the SFTP subsystem stalls, while retaining SSH authentication.
for protocol in sftp scp; do
  options=()
  [[ "$protocol" != scp ]] || options+=(-O)
  started=$SECONDS
  echo "Starting $protocol transfer"
  if timeout --kill-after=10s "${upload_timeout}s" scp "${options[@]}" -- "$source_file" "$target"; then
    echo "Upload completed in $((SECONDS - started)) seconds"
    exit 0
  else
    status=$?
    echo "::warning::$protocol transfer failed after $((SECONDS - started)) seconds (exit $status)"
  fi
done

echo '::error::Both upload attempts failed; the running release was not changed.'
exit 1
