#!/usr/bin/env bash
# 웹 빌드: GODOT=/path/to/godot ./tools/build_web.sh  (Godot 4.3 + 웹 내보내기 템플릿 필요)
set -euo pipefail
cd "$(dirname "$0")/.."
GODOT="${GODOT:-godot}"
"$GODOT" --headless --path . --import
mkdir -p build/web
"$GODOT" --headless --path . --export-release Web build/web/index.html
echo "빌드 완료: build/web/index.html  (예: python3 -m http.server -d build/web 8765)"
