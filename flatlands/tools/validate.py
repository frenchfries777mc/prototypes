#!/usr/bin/env python3
"""정적 검증: 데이터 팩이 가리키는 모든 ID(밀도 함수·노이즈·바이옴·노이즈 설정)가 실제로 존재하는지,
밀도 함수 참조에 순환이 없는지, 바이옴 목록의 형식이 맞는지 확인한다. (게임을 실행하지는 않는다.)

    python3 tools/validate.py --target 26.3|1.21 --vanilla /path/to/extracted
"""
import argparse, glob, json, os, sys

NON_REF_KEYS = {"type", "axis", "noise", "metric", "biome"}
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--vanilla", required=True); ap.add_argument("--target", choices=["26.3","1.21","1.21-bop"], required=True); ap.add_argument("--pack"); ap.add_argument("--mod-data", help="1.21-bop: 풀어 둔 Biomes O' Plenty jar 폴더(data/biomesoplenty/...)")
    a = ap.parse_args(); pack = os.path.abspath(a.pack or os.path.join(ROOT, f"datapack-{a.target}"))
    errors = []

    def path_of(rid, kind):
        ns, p = rid.split(":", 1)
        base = pack if ns == "flatlands" else os.path.join(a.vanilla)
        return os.path.join(base, "data", ns, "worldgen", kind, p + ".json")

    def exists(rid, kind):
        if rid.startswith("biomesoplenty:"):
            if not a.mod_data: errors.append("biomesoplenty 바이옴을 확인하려면 --mod-data 가 필요함"); return True
            return os.path.exists(os.path.join(a.mod_data, "data/biomesoplenty/worldgen", kind, rid.split(":", 1)[1] + ".json"))
        return os.path.exists(path_of(rid, kind))

    # 1) 모든 JSON 이 파싱되는가
    for f in glob.glob(os.path.join(pack, "**", "*.json"), recursive=True) + [os.path.join(pack, "pack.mcmeta")]:
        try: json.load(open(f))
        except Exception as e: errors.append(f"JSON 파싱 실패 {f}: {e}")

    # 2) 밀도 함수 참조 + 노이즈 참조 + 순환
    graph = {}
    def refs(node, out, noises):
        if isinstance(node, str): out.add(node)
        elif isinstance(node, list):
            for v in node: refs(v, out, noises)
        elif isinstance(node, dict):
            for k, v in node.items():
                if k == "noise" and isinstance(v, str): noises.add(v)
                elif k in NON_REF_KEYS: continue
                else: refs(v, out, noises)
    for f in sorted(glob.glob(os.path.join(pack, "data/flatlands/worldgen/density_function/*.json"))):
        rid = "flatlands:" + os.path.basename(f)[:-5]
        r, n = set(), set(); refs(json.load(open(f)), r, n); graph[rid] = r
        for x in r:
            if not exists(x, "density_function"): errors.append(f"{rid}: 없는 밀도 함수 참조 {x}")
        for x in n:
            if not exists(x, "noise"): errors.append(f"{rid}: 없는 노이즈 {x}")
    state = {}
    def dfs(n, stack):
        if state.get(n) == 2 or not n.startswith("flatlands:"): return
        if state.get(n) == 1: errors.append("순환 참조: " + " → ".join(stack + [n])); return
        state[n] = 1
        for m in graph.get(n, ()): dfs(m, stack + [n])
        state[n] = 2
    for n in graph: dfs(n, [])

    # 3) 노이즈 설정
    ns = json.load(open(os.path.join(pack, "data/flatlands/worldgen/noise_settings/overworld.json")))
    r, n = set(), set(); refs({k: v for k, v in ns.items() if k not in ("material_rule", "default_block", "default_fluid")}, r, n)
    for x in r:
        if ":" in x and not x.startswith("minecraft:overworld/caves") and (x.startswith("flatlands:") or x.startswith("minecraft:overworld/") or x.startswith("minecraft:shift")):
            if not exists(x, "density_function"): errors.append(f"noise_settings: 없는 함수 {x}")
    for k, v in ns["noise_router"].items():
        if isinstance(v, str) and not exists(v, "density_function"): errors.append(f"noise_router.{k}: 없는 함수 {v}")
    if a.target == "26.3":
        if not exists(ns["material_rule"], "material_rule"): errors.append("material_rule 없음: " + ns["material_rule"])
        for k in ns["spawn_target"][0]:
            if not exists(k, "density_function"): errors.append(f"spawn_target 키 없음: {k}")
    else:
        need = {"continentalness", "depth", "erosion", "humidity", "offset", "temperature", "weirdness"}
        for pt in ns["spawn_target"]:
            if set(pt) != need: errors.append(f"spawn_target 키가 이상함: {sorted(pt)}")
        for k in ("surface_rule", "final_density" if False else "noise_router", "noise"):
            if k not in ns: errors.append(f"noise_settings 에 {k} 없음")
        left = json.dumps(ns["noise_router"])
        for bad in ("overworld/offset", "overworld/factor", "overworld/depth", "overworld/sloped_cheese", "overworld/jaggedness", "overworld/ridges\""):
            if f"minecraft:{bad}" in left: errors.append(f"1.21 라우터에 바닐라 지형 함수 참조가 남아 있음: {bad}")

    # 4) 월드 프리셋 / 바이옴
    for f in sorted(glob.glob(os.path.join(pack, "data/flatlands/worldgen/world_preset/*.json"))):
        d = json.load(open(f)); name = os.path.basename(f)
        g = d["dimensions"]["minecraft:overworld"]["generator"]
        if not exists(g["settings"], "noise_settings"): errors.append(f"{name}: 없는 noise_settings {g['settings']}")
        used = set()
        for e in g["biome_source"]["biomes"]:
            if not exists(e["biome"], "biome"): errors.append(f"{name}: 없는 바이옴 {e['biome']}")
            used.add(e["biome"])
            p = e["parameters"]
            if set(p) != {"temperature", "humidity", "continentalness", "erosion", "depth", "weirdness", "offset"}: errors.append(f"{name}: 파라미터 키가 이상함 {sorted(p)}")
            for k, v in p.items():
                vs = v if isinstance(v, list) else [v, v]
                if len(vs) != 2 or vs[0] > vs[1] or not all(-2.0 <= t <= 2.0 for t in vs): errors.append(f"{name}: {e['biome']} {k}={v}")
        print(f"{name}: 바이옴 {len(used)}종 {sorted(b.split(':')[1] for b in used)}")
    tag = json.load(open(os.path.join(pack, "data/minecraft/tags/worldgen/world_preset/normal.json")))
    for v in tag["values"]:
        if not exists(v, "world_preset"): errors.append(f"world_preset 태그가 없는 프리셋을 가리킴: {v}")
    if a.target == "1.21-bop":
        tb = json.load(open(os.path.join(pack, "data/terrablender/tags/dimension_type/overworld_regions.json")))
        if tb != {"replace": True, "values": []}: errors.append(f"terrablender overworld_regions 태그가 비어 있지 않음: {tb}")
        else: print("terrablender overworld_regions 태그: replace=true, values=[] (지역 주입 끔)")
    mc = json.load(open(os.path.join(pack, "pack.mcmeta")))["pack"]
    print("pack.mcmeta:", mc)

    if errors:
        print("\n".join("✗ " + e for e in errors)); sys.exit(1)
    print(f"✓ 밀도 함수 {len(graph)}개, 참조·노이즈·바이옴·프리셋 모두 확인됨. 순환 없음.")

if __name__ == "__main__":
    main()
