#!/usr/bin/env bash
# 로컬 PeerJS 시그널링 서버(개발·테스트용). 기본값은 공개 PeerJS 클라우드(0.peerjs.com)라 평소엔 필요 없다.
# 사용: ./tools/dev_peer_server.sh  →  게임 주소 뒤에 ?peerhost=localhost&peerport=9000&peersecure=0
set -euo pipefail
npx --yes peer --port 9000 --host 0.0.0.0
