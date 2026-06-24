#!/usr/bin/env bash
# The balanced hard-gate (pipeline §B). Run with REAL exit codes, each under a
# hard timeout so a hung command fails fast (exit 124) instead of blocking
# forever. ALL must be 0. The Architect re-runs this itself — a builder's
# "all green" is never trusted.
#
# Usage: bash gate.sh
set -uo pipefail

cd "$(dirname "$0")"

run() {
  local name="$1"; shift
  echo "── ${name} ──"
  "$@"
  local code=$?
  if [ "$code" -eq 124 ]; then
    echo "!! ${name} HUNG (exit 124) — investigate open handles / non-exiting process"
  fi
  return $code
}

run "typecheck"     timeout 120 pnpm -r --no-bail typecheck ; tc=$?
run "lint"          timeout 120 pnpm lint                   ; ln=$?
run "lint:content"  timeout 60  pnpm lint:content           ; lc=$?
# Capture the REAL test exit code, not the pipe's (the classic green-but-failing trap).
run "test"          timeout 300 bash -c 'pnpm -r --no-bail test 2>&1 | tee /tmp/skate-test.log; exit ${PIPESTATUS[0]}' ; tst=$?
run "build"         timeout 120 pnpm -r build               ; bd=$?

echo ""
echo "════════════════════════════════════════════"
echo " typecheck=$tc  lint=$ln  content=$lc  test=$tst  build=$bd"
# Record per-package test counts so a silent drop (deleted/skipped tests that
# read as 'green') is visible run over run.
if [ -f /tmp/skate-test.log ]; then
  echo " test summary:"
  grep -E "Test Files|Tests " /tmp/skate-test.log | sed 's/^/   /' || true
fi
echo "════════════════════════════════════════════"

if [ "$tc" -eq 0 ] && [ "$ln" -eq 0 ] && [ "$lc" -eq 0 ] && [ "$tst" -eq 0 ] && [ "$bd" -eq 0 ]; then
  echo "GATE: GREEN ✅"
  exit 0
fi
echo "GATE: RED ❌ (exit 124 on any line = HUNG, not passed)"
exit 1
