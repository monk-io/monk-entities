# Shared test helpers for the job/test/*.sh scripts. Source, don't execute:
#   . "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# Computes a dataset directory's hash EXACTLY the way entrypoint.sh's own dataset_hash()
# function does, by extracting and reusing that function's live definition rather than
# duplicating its formula in test code. Duplicating the formula is how 4 tests went stale
# in one shot the last time this function's implementation changed (2026-08-19,
# architecture review finding 5) — every test that hardcoded "the hash of this content" had
# to be found and fixed by hand. Extracting the real definition means a future change to
# dataset_hash() can never silently desync from what these tests expect.
#
# Args: host_workspace_dir container_data_path image job_dir
#   host_workspace_dir  - host path bind-mounted as /workspace for this call
#   container_data_path - path INSIDE the container to hash, e.g. /workspace/data/t-dataset
#   image               - job image to run
#   job_dir             - host path to job/ (where entrypoint.sh lives)
compute_dataset_hash(){
  local host_workspace_dir="$1" container_data_path="$2" image="$3" job_dir="$4"
  local fn_def
  fn_def=$(grep '^dataset_hash(){' "$job_dir/entrypoint.sh")
  if [ -z "$fn_def" ]; then
    echo "compute_dataset_hash: could not find dataset_hash() in $job_dir/entrypoint.sh — did its definition change shape?" >&2
    return 1
  fi
  docker run --rm --user "$(id -u):$(id -g)" -v "$host_workspace_dir":/workspace \
    --entrypoint bash "$image" -c "$fn_def"$'\n'"dataset_hash '$container_data_path'"
}
