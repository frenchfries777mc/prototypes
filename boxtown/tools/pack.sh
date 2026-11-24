#!/bin/sh
# 모델 파일(GLB) 수백 개를 하나로 묶는다. 배포할 때 돌린다: sh tools/pack.sh <assets 폴더>
# 결과: pack.bin.gz(이어 붙여 압축한 것), pack.json(파일마다 시작 위치와 길이). 게임은 이 둘만 받으면 된다.
# 묶음이 없거나 못 읽으면 게임은 전처럼 파일을 하나씩 받는다.
set -e
cd "$1"
rm -f pack.bin pack.bin.gz pack.json
off=0
first=1
printf '{' > pack.json
for f in $(find . -name '*.glb' | sed 's#^\./##' | sort); do
  size=$(wc -c < "$f" | tr -d ' ')
  key=${f%.glb}
  if [ $first -eq 1 ]; then first=0; else printf ',' >> pack.json; fi
  printf '"%s":[%s,%s]' "$key" "$off" "$size" >> pack.json
  cat "$f" >> pack.bin
  off=$((off + size))
done
printf '}' >> pack.json
gzip -9 pack.bin
ls -la pack.bin.gz pack.json
