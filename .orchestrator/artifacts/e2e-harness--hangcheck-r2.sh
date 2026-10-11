#!/usr/bin/env bash
# Conductor probe (append-only): a hanging spec must end with "FAIL hang (timeout)" within the
# deadline, and leave no listener on the run's ports. Runs in the current directory (a copy).
set -u
P1=$((20000+RANDOM%9000)); P2=$((30000+RANDOM%9000))
printf "import { withApp } from './lib.mjs';\nawait withApp({}, async ({ page, app }) => { await page.goto(app.url); await new Promise(() => {}); });\n" > tests/e2e/hang.spec.mjs
start=$(date +%s); out=$(E2E_PORT=$P1 E2E_MOCK_PORT=$P2 E2E_SPEC_TIMEOUT=5 timeout 60 npm run test:e2e -- hang 2>&1); rc=$?; secs=$(( $(date +%s) - start ))
rm -f tests/e2e/hang.spec.mjs; sleep 1
echo "$out" | tail -5; echo "rc=$rc secs=$secs"
listen=$( (ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null) | grep -E ":($P1|$P2)\b" ); echo "listeners: ${listen:-none}"
echo "$out" | grep -q 'FAIL hang (timeout)' && [ "$rc" -ne 0 ] && [ "$rc" -ne 124 ] && [ "$secs" -lt 40 ] && [ -z "$listen" ]
