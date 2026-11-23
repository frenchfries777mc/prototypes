#!/usr/bin/env python3
"""datapack-*/ 과 resourcepack-*/ 을 dist/ 아래 zip 으로 묶는다. (pack.mcmeta 가 zip 최상위에 와야 한다.)
항상 같은 결과가 나오도록 파일 순서와 시간을 고정한다."""
import os, zipfile

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, "..")
TARGETS = [("26.3", "26.3"), ("1.21", "1.21-1.21.1")]   # (폴더 접미사, 파일 이름에 쓸 버전)
def pack(src, dst):
    src = os.path.abspath(src); os.makedirs(os.path.dirname(dst), exist_ok=True)
    files = sorted(os.path.relpath(os.path.join(d, f), src) for d, _, fs in os.walk(src) for f in fs)
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as z:
        for rel in files:
            info = zipfile.ZipInfo(rel.replace(os.sep, "/"), date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED; info.external_attr = 0o644 << 16
            z.writestr(info, open(os.path.join(src, rel), "rb").read())
    print(f"{os.path.relpath(dst, ROOT)}  ({len(files)}개 파일, {os.path.getsize(dst)//1024} KB)")

for suffix, label in TARGETS:
    pack(os.path.join(ROOT, f"datapack-{suffix}"), os.path.join(ROOT, "dist", f"flatlands-datapack-{label}.zip"))
    pack(os.path.join(ROOT, f"resourcepack-{suffix}"), os.path.join(ROOT, "dist", f"flatlands-names-resourcepack-{label}.zip"))

# Biomes O' Plenty 연동 팩(1.21.1 NeoForge). 이름 표시용 리소스 팩은 1.21 것을 그대로 쓴다.
pack(os.path.join(ROOT, "datapack-1.21-bop"), os.path.join(ROOT, "dist", "flatlands-datapack-1.21.1-BiomesOPlenty.zip"))
