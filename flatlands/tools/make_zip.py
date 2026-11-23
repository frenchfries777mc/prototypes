#!/usr/bin/env python3
"""datapack/ 과 resourcepack/ 을 dist/ 아래 zip 으로 묶는다. (pack.mcmeta 가 zip 최상위에 와야 한다.)
항상 같은 결과가 나오도록 파일 순서와 시간을 고정한다."""
import os, zipfile

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, "..")
VERSION = "26.3"

def pack(src, dst):
    src = os.path.abspath(src); os.makedirs(os.path.dirname(dst), exist_ok=True)
    files = sorted(os.path.relpath(os.path.join(d, f), src) for d, _, fs in os.walk(src) for f in fs)
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as z:
        for rel in files:
            info = zipfile.ZipInfo(rel.replace(os.sep, "/"), date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED; info.external_attr = 0o644 << 16
            z.writestr(info, open(os.path.join(src, rel), "rb").read())
    print(f"{os.path.relpath(dst, ROOT)}  ({len(files)}개 파일, {os.path.getsize(dst)//1024} KB)")

pack(os.path.join(ROOT, "datapack"), os.path.join(ROOT, "dist", f"flatlands-datapack-{VERSION}.zip"))
pack(os.path.join(ROOT, "resourcepack"), os.path.join(ROOT, "dist", f"flatlands-names-resourcepack-{VERSION}.zip"))
