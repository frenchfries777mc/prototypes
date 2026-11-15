#!/usr/bin/env bash
# 헤드리스 시뮬레이션 테스트. 인자: 팀당 인원, 시뮬레이션 초, 시드
set -euo pipefail
cd "$(dirname "$0")/.."
GODOT="${GODOT:-godot}"
"$GODOT" --headless --path . --import >/dev/null 2>&1 || true
"$GODOT" --headless --path . -s res://scripts/tests/sim_test.gd -- "${1:-40}" "${2:-120}" "${3:-1234}"
