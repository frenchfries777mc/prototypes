#!/usr/bin/env python3
"""Flatlands 데이터 팩 생성기.

바닐라 worldgen 데이터를 읽어서, 지형을 정하는 몇 개의 함수만 직접 만든 것으로 바꾼 복사본을
`datapack-<target>/` 아래에 쓴다. 지표 규칙·동굴·광맥 등은 바닐라를 그대로 참조한다.

사용법:
    python3 tools/generate.py --target 26.3     --vanilla <26.3 서버 jar 에서 푼 data 폴더의 부모>
    python3 tools/generate.py --target 1.21     --vanilla <1.21.1 서버 jar 에서 푼 폴더>
    python3 tools/generate.py --target 1.21-bop --vanilla <1.21.1 ...>      # Biomes O' Plenty 연동

모든 튜닝 값은 아래 PARAMS 한 곳에 모여 있다.
"""
import argparse, json, os, shutil

NS = "flatlands"

# ───────────────────────── 튜닝 값 ─────────────────────────
PARAMS = dict(
    # 육지 높이(블록). 바다 수면(y=63)보다 항상 위에 있도록 하한을 둔다.
    land_base=66.5,      # 평균 육지 높이의 기준값
    land_amp=3.0,        # 완만한 기복의 세기(블록). 클수록 언덕이 커진다
    land_scale=1.0,      # 기복 노이즈의 xz 배율. 클수록 기복의 주기가 짧아진다
    land_min=65.3,       # 육지 높이 하한 (수면 y=63 위에 강둑이 남도록)
    land_max=72.0,       # 육지 높이 상한
    # 강: 큰 규모의 본류 + 가는 지류. 두 노이즈의 "0 근처" 중 가까운 쪽까지의 거리 D 를 쓴다.
    river_main_scale=0.14,    # 본류 노이즈의 xz 배율. 작을수록 강이 길고 크게 굽이친다(바닐라는 0.25)
    river_branch_scale=0.30,  # 지류 노이즈의 xz 배율
    river_branch_k=0.80,      # 지류 거리에 곱하는 값. 작을수록 지류가 넓어진다
    river_width_scale=0.85,   # 강 단면(RIVER_PROFILE)과 river 바이옴 폭에 곱하는 값. 본류 배율을 낮춘 만큼 줄여서 폭을 유지
    river_bed=58.5,           # 강바닥 높이
    river_biome_width=0.044,  # D 가 (이 값 × river_width_scale) 보다 작으면 river 바이옴
    # 돌산: 평지 위에 드문드문 솟는 바위산
    mountain_scale=1.0,       # 산 노이즈의 xz 배율. 작을수록 산이 넓고 드물다
    mountain_foot_biome=0.08, # 산 높이 신호(0~1=0~40블록) 가 이 값을 넘으면 산기슭 바이옴
    mountain_peak_biome=0.30, # 이 값을 넘으면 봉우리 바이옴 (≈12블록 이상)
    rock_extra=0.8,           # 산 위에서 3D 노이즈에 더하는 세기. 클수록 거칠고 삐죽함
    # 미세 기복
    micro_k=0.55,        # 바닐라 3D 노이즈(base_3d_noise)를 곱하는 비율. 0이면 완전 평탄
    factor=6.25,         # 바닐라 평지와 같은 값. 높일수록 표면이 매끈해진다
)

# 강 단면: (거리 D, 강바닥 쪽 가중치 w).  표면 = 육지높이 + w * (강바닥 - 육지높이). D 는 river_width_scale 로 줄어든다.
RIVER_PROFILE = [(0.00, 1.00), (0.015, 0.93), (0.03, 0.64), (0.05, 0.30), (0.08, 0.10), (0.11, 0.00)]

# 산 모양: (산 노이즈 값, 솟는 높이(블록)). 노이즈가 이 값을 넘는 곳만 솟는다(표준편차≈0.35 → 0.5 초과는 약 8%).
MOUNTAIN_PROFILE = [(0.45, 0.0), (0.55, 8.0), (0.70, 30.0), (0.90, 52.0), (1.15, 64.0)]
MOUNTAIN_SCALE_BLOCKS = 40.0   # 산 높이 신호를 0~1 로 맞출 때 나누는 값

# 기후 경계(온도 T, 습도 H, 침식 E). 노이즈 분포: T 표준편차≈0.40, H≈0.24, E≈0.31
T_COLD, T_HOT, H_WET, E_SUN = -0.55, 0.65, 0.35, 0.45


def pchip_derivs(pts):
    """단조 3차 에르미트(Fritsch–Carlson) 도함수. 스플라인이 출렁이지 않게 한다. 양 끝 기울기는 0."""
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    n = len(xs); h = [xs[i+1]-xs[i] for i in range(n-1)]
    d = [(ys[i+1]-ys[i])/h[i] for i in range(n-1)]
    m = [0.0]*n
    for i in range(1, n-1):
        if d[i-1]*d[i] <= 0: m[i] = 0.0
        else:
            w1 = 2*h[i]+h[i-1]; w2 = h[i]+2*h[i-1]
            m[i] = (w1+w2)/(w1/d[i-1]+w2/d[i])
    return [round(v, 6) for v in m]


def load(vdir, rel):
    with open(os.path.join(vdir, "data/minecraft/worldgen", rel + ".json")) as f:
        return json.load(f)


def sub_refs(obj, mapping):
    """JSON 안의 문자열 참조를 통째로 치환한다(키 포함)."""
    if isinstance(obj, str): return mapping.get(obj, obj)
    if isinstance(obj, list): return [sub_refs(v, mapping) for v in obj]
    if isinstance(obj, dict): return {sub_refs(k, mapping): sub_refs(v, mapping) for k, v in obj.items()}
    return obj


def write(root, rel, data):
    path = os.path.join(root, "data", NS, "worldgen", rel + ".json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False); f.write("\n")


class Syn:
    """버전별 밀도 함수 문법 차이를 감싼다. 26.3: left/right/input, 1.21~1.21.1: argument1/argument2/argument."""
    def __init__(self, ver): self.new = (ver == "26.3")
    def bin(self, t, l, r):
        return {"type": f"minecraft:{t}", "left": l, "right": r} if self.new else {"type": f"minecraft:{t}", "argument1": l, "argument2": r}
    def add(self, l, r): return self.bin("add", l, r)
    def mul(self, l, r): return self.bin("mul", l, r)
    def min(self, l, r): return self.bin("min", l, r)
    def sub(self, l, r): return self.bin("sub", l, r) if self.new else self.add(l, self.mul(-1.0, r))   # 1.21 에는 sub 가 없다
    def un(self, t, x): return {"type": f"minecraft:{t}", "input" if self.new else "argument": x}
    def clamp(self, x, lo, hi): return {"type": "minecraft:clamp", "input": x, "min": lo, "max": hi}
    def cache2d(self, x):
        return {"type": "minecraft:cache", "input": x} if self.new else {"type": "minecraft:flat_cache", "argument": {"type": "minecraft:cache_2d", "argument": x}}
    def noise(self, noise, scale):
        if self.new:
            return {"type": "minecraft:noise", "noise": noise, "shift_x": "minecraft:shift_x", "shift_z": "minecraft:shift_z", "xz_scale": scale, "y_scale": 0.0}
        return {"type": "minecraft:shifted_noise", "noise": noise, "shift_x": "minecraft:shift_x", "shift_y": 0.0, "shift_z": "minecraft:shift_z", "xz_scale": scale, "y_scale": 0.0}
    def ygrad(self, y0, v0, y1, v1):
        if self.new: return {"type": "minecraft:gradient", "axis": "y", "from_coordinate": y0, "from_value": v0, "to_coordinate": y1, "to_value": v1}
        return {"type": "minecraft:y_clamped_gradient", "from_y": y0, "from_value": v0, "to_y": y1, "to_value": v1}
    def spline(self, coord, pts):
        ders = pchip_derivs(pts)
        return {"type": "minecraft:spline", "spline": {"coordinate": coord, "points": [{"location": x, "value": y, "derivative": d} for (x, y), d in zip(pts, ders)]}}


def build_noises(root, vdir):
    """독립된 시드가 필요한 노이즈를 바닐라 노이즈 정의의 복사본으로 만든다(통계는 같고 위치만 달라짐).
    새 노이즈 형식(26.3)의 정규화 값까지 그대로 가져오므로 형식이 틀릴 위험이 없다."""
    for dst, src in (("river_main", "ridge"), ("river_branch", "ridge"), ("rolling", "erosion"), ("mountain", "continentalness")):
        write(root, f"noise/{dst}", load(vdir, f"noise/{src}"))


def build_functions(root, vdir, P, ver):
    S = Syn(ver)
    F = lambda n: f"{NS}:{n}"
    V = lambda n: f"minecraft:overworld/{n}"
    build_noises(root, vdir)

    # 1) 강: 본류(큰 규모)와 지류(작은 규모)의 중심선까지의 거리 중 가까운 쪽 → D. 같은 값이 지형 깎기와 바이옴 선택에 쓰인다.
    write(root, "density_function/river_main", S.cache2d(S.noise(F("river_main"), P["river_main_scale"])))
    write(root, "density_function/river_branch", S.cache2d(S.noise(F("river_branch"), P["river_branch_scale"])))
    write(root, "density_function/river_distance",
          S.min(S.un("abs", F("river_main")), S.mul(S.un("abs", F("river_branch")), P["river_branch_k"])))

    # 2) 강 단면 가중치 w(D): 1 = 강 한가운데, 0 = 강에서 충분히 먼 곳
    ws = P["river_width_scale"]
    write(root, "density_function/river_weight", S.cache2d(S.spline(F("river_distance"), [(round(d*ws, 5), w) for d, w in RIVER_PROFILE])))

    # 3) 완만한 육지 기복(블록)
    raw = S.add(P["land_base"], S.mul(S.noise(F("rolling"), P["land_scale"]), P["land_amp"]))
    write(root, "density_function/land_height", S.cache2d(S.clamp(raw, P["land_min"], P["land_max"])))

    # 4) 돌산: 산 노이즈가 문턱을 넘는 곳만 솟고, 강 가까이(w>0)에서는 사라진다.
    #    spline 은 끝점 기울기가 0 이라 "문턱에서 바로 가파르게" 솟게 하려고 도함수를 직접 지정한다.
    ders = [0.0, 140.0, 190.0, 95.0, 0.0]
    mt = {"type": "minecraft:spline", "spline": {"coordinate": F("mountain_noise"),
          "points": [{"location": x, "value": y, "derivative": d} for (x, y), d in zip(MOUNTAIN_PROFILE, ders)]}}
    write(root, "density_function/mountain_noise", S.cache2d(S.noise(F("mountain"), P["mountain_scale"])))
    write(root, "density_function/mountain_rise", S.cache2d(S.mul(mt, S.sub(1.0, F("river_weight")))))
    # 산 높이 신호(0~1). 바이옴 선택(router.continents)과 거칠기 마스크에 쓴다.
    write(root, "density_function/mountain_height", S.clamp(S.mul(F("mountain_rise"), 1.0/MOUNTAIN_SCALE_BLOCKS), 0.0, 1.0))
    write(root, "density_function/rock_mask", S.clamp(S.mul(F("mountain_height"), 4.0), 0.0, 1.0))

    # 5) 표면 높이 = 육지 + w*(강바닥-육지) + 산 높이
    surface = S.add(S.add(F("land_height"), S.mul(F("river_weight"), S.sub(P["river_bed"], F("land_height")))), F("mountain_rise"))
    write(root, "density_function/surface_height", S.cache2d(surface))

    # 6) offset: 바닐라 depth = (1 - y/128) + offset 이므로 표면이 y=S 이려면 offset = S/128 - 1
    write(root, "density_function/offset", S.cache2d(S.add(S.mul(F("surface_height"), 0.0078125), -1.0)))
    write(root, "density_function/factor", P["factor"])
    write(root, "density_function/depth", S.add(S.ygrad(-64, 1.5, 320, -1.5), F("offset")))

    # 7) sloped_cheese: 바닐라에서 jaggedness 를 빼고, 3D 노이즈를 (micro_k + 산 위에서는 rock_extra) 배로 쓴다 → 산에서만 거칠어진다.
    k = S.add(P["micro_k"], S.mul(F("rock_mask"), P["rock_extra"]))
    core = S.add(S.mul(S.un("quarter_negative", S.mul(F("depth"), F("factor"))), 4.0), S.mul(k, V("base_3d_noise")))
    write(root, "density_function/sloped_cheese", {"type": "minecraft:cache", "input": core} if S.new else core)

    mapping = {V("sloped_cheese"): F("sloped_cheese"), V("offset"): F("offset"), V("factor"): F("factor"), V("depth"): F("depth"),
               V("preliminary_surface_level"): F("preliminary_surface_level")}
    if S.new:
        for n in ("final_density", "preliminary_surface_level", "chunk_surface_level"):
            write(root, f"density_function/{n}", sub_refs(load(vdir, f"density_function/overworld/{n}"), mapping))
    return mapping


def build_noise_settings(root, vdir, mapping, P, ver):
    ns = load(vdir, "noise_settings/overworld")
    V = lambda n: f"minecraft:overworld/{n}"
    m = dict(mapping)
    m[V("ridges")] = f"{NS}:river_distance"          # weirdness 축 = 강까지의 거리
    m[V("continents")] = f"{NS}:mountain_height"     # continentalness 축 = 산 높이 신호
    full = [-1.0, 1.0]
    far = [P["river_biome_width"]*P["river_width_scale"] + 0.03, 1.0]   # 스폰은 강·산이 아닌 평지에서 찾는다
    low = [-1.0, P["mountain_foot_biome"]]
    if ver == "26.3":
        m[V("final_density")] = f"{NS}:final_density"; m[V("chunk_surface_level")] = f"{NS}:chunk_surface_level"
        ns = sub_refs(ns, m)
        ns["spawn_target"] = [{f"{NS}:mountain_height": low, V("erosion"): full, f"{NS}:river_distance": far, V("temperature"): full, V("vegetation"): full}]
    else:
        ns = sub_refs(ns, m)
        ns["spawn_target"] = [{"continentalness": low, "depth": 0.0, "erosion": full, "humidity": full, "offset": 0.0, "temperature": full, "weirdness": far}]
    write(root, "noise_settings/overworld", ns)


# ───────────────────────── 바이옴 목록 ─────────────────────────
FULL = [-1.0, 1.0]
def rng(a, b): return [a, b]

def entry(biome, T=FULL, H=FULL, C=FULL, E=FULL, D=0.0, W=FULL):
    return {"biome": biome, "parameters": {"temperature": T, "humidity": H, "continentalness": C, "erosion": E, "depth": D, "weirdness": W, "offset": 0.0}}

def surface(biome, **kw):
    """지표 바이옴은 depth 0 과 1 두 항목을 넣는다(바닐라와 같은 방식 → 지하도 같은 바이옴이 이어진다)."""
    return [entry(biome, D=0.0, **kw), entry(biome, D=1.0, **kw)]

def cave_biomes():
    return [entry("minecraft:dripstone_caves", E=rng(0.70, 1.0), D=rng(0.2, 0.9)),
            entry("minecraft:lush_caves", H=rng(0.7, 1.0), D=rng(0.2, 0.9))]

def rivers(P, cold_frozen=True):
    rw = P["river_biome_width"]*P["river_width_scale"]; river = rng(0.0, rw)
    if cold_frozen:
        return surface("minecraft:frozen_river", T=rng(-1.0, T_COLD), W=river) + surface("minecraft:river", T=rng(T_COLD, 1.0), W=river)
    return surface("minecraft:river", W=river)

def mountains(P, simple=False):
    """산 높이 신호(C)가 문턱을 넘으면 돌산 바이옴. 추운 곳은 눈 덮인 쪽. 강 근처는 높이가 0 이라 자동으로 빠진다."""
    foot, peak = P["mountain_foot_biome"], P["mountain_peak_biome"]
    cold = rng(-1.0, -0.45); warm = rng(-0.45, 1.0)
    if simple:
        return surface("minecraft:stony_peaks", C=rng(foot, 1.0))
    return (surface("minecraft:snowy_slopes", T=cold, C=rng(foot, peak)) + surface("minecraft:windswept_hills", T=warm, C=rng(foot, peak)) +
            surface("minecraft:frozen_peaks", T=cold, C=rng(peak, 1.0)) + surface("minecraft:stony_peaks", T=warm, C=rng(peak, 1.0)))

def biomes_mixed(P):
    rw = P["river_biome_width"]*P["river_width_scale"]
    land = rng(rw, 1.0); lowC = rng(-1.0, P["mountain_foot_biome"])
    cold, hot = rng(-1.0, T_COLD), rng(T_HOT, 1.0)
    L = rivers(P) + mountains(P)
    L += surface("minecraft:snowy_plains", T=cold, C=lowC, W=land)
    L += surface("minecraft:desert", T=hot, H=rng(-1.0, 0.10), C=lowC, W=land)
    L += surface("minecraft:plains", T=hot, H=rng(0.10, 1.0), C=lowC, W=land)
    L += surface("minecraft:forest", T=rng(T_COLD, -0.15), H=rng(H_WET, 1.0), C=lowC, W=land)
    L += surface("minecraft:flower_forest", T=rng(-0.15, 0.20), H=rng(H_WET, 1.0), C=lowC, W=land)
    L += surface("minecraft:birch_forest", T=rng(0.20, T_HOT), H=rng(H_WET, 1.0), C=lowC, W=land)
    L += surface("minecraft:sunflower_plains", T=rng(T_COLD, T_HOT), H=rng(-1.0, H_WET), E=rng(E_SUN, 1.0), C=lowC, W=land)
    L += surface("minecraft:plains", T=rng(T_COLD, T_HOT), H=rng(-1.0, H_WET), E=rng(-1.0, E_SUN), C=lowC, W=land)
    return L + cave_biomes()

def biomes_pure(P):
    rw = P["river_biome_width"]*P["river_width_scale"]
    land = rng(rw, 1.0); lowC = rng(-1.0, P["mountain_foot_biome"])
    L = rivers(P, cold_frozen=False) + mountains(P, simple=True)
    L += surface("minecraft:sunflower_plains", E=rng(E_SUN, 1.0), C=lowC, W=land)
    L += surface("minecraft:plains", E=rng(-1.0, E_SUN), C=lowC, W=land)
    return L + cave_biomes()

def biomes_bop(P):
    """바닐라 평원 위주 + Biomes O' Plenty 의 평원 계열 바이옴만 섞은 목록(돌산은 바닐라 바이옴).
    온대(T_COLD..T_HOT)·건조하지 않은 곳(H<H_WET)을 온도/습도 구간으로 나눠 상자가 겹치지 않게 배치한다."""
    rw = P["river_biome_width"]*P["river_width_scale"]
    land = rng(rw, 1.0); lowC = rng(-1.0, P["mountain_foot_biome"])
    cold, hot = rng(-1.0, T_COLD), rng(T_HOT, 1.0)
    BOP = lambda n: f"biomesoplenty:{n}"
    sunE, restE = rng(E_SUN, 1.0), rng(-1.0, E_SUN)
    L = rivers(P) + mountains(P)
    L += surface("minecraft:snowy_plains", T=cold, C=lowC, W=land)
    L += surface("minecraft:desert", T=hot, H=rng(-1.0, 0.10), C=lowC, W=land)
    L += surface("minecraft:plains", T=hot, H=rng(0.10, 1.0), C=lowC, W=land)
    L += surface("minecraft:forest", T=rng(T_COLD, -0.15), H=rng(H_WET, 1.0), C=lowC, W=land)
    L += surface("minecraft:flower_forest", T=rng(-0.15, 0.20), H=rng(H_WET, 1.0), C=lowC, W=land)
    L += surface("minecraft:birch_forest", T=rng(0.20, T_HOT), H=rng(H_WET, 1.0), C=lowC, W=land)
    L += surface("minecraft:sunflower_plains", T=rng(T_COLD, T_HOT), H=rng(-1.0, H_WET), E=sunE, C=lowC, W=land)
    cool, mid, warm = rng(T_COLD, -0.15), rng(-0.15, 0.25), rng(0.25, T_HOT)
    L += surface(BOP("shrubland"), T=rng(T_COLD, T_HOT), H=rng(-1.0, -0.30), E=restE, C=lowC, W=land)
    L += surface("minecraft:plains", T=cool, H=rng(-0.30, 0.00), E=restE, C=lowC, W=land)
    L += surface(BOP("field"), T=cool, H=rng(0.00, H_WET), E=restE, C=lowC, W=land)
    L += surface("minecraft:plains", T=mid, H=rng(-0.30, 0.05), E=restE, C=lowC, W=land)
    L += surface(BOP("grassland"), T=mid, H=rng(0.05, H_WET), E=restE, C=lowC, W=land)
    L += surface(BOP("prairie"), T=warm, H=rng(-0.30, -0.05), E=restE, C=lowC, W=land)
    L += surface(BOP("pasture"), T=warm, H=rng(-0.05, 0.15), E=restE, C=lowC, W=land)
    L += surface(BOP("lavender_field"), T=warm, H=rng(0.15, H_WET), E=restE, C=lowC, W=land)
    return L + cave_biomes()


def build_presets(root, vdir, P, target):
    normal = load(vdir, "world_preset/normal")
    presets = (("bop", biomes_bop(P)),) if target == "1.21-bop" else (("flatlands", biomes_mixed(P)), ("plains_and_rivers", biomes_pure(P)))
    for name, biomes in presets:
        d = json.loads(json.dumps(normal))
        d["dimensions"]["minecraft:overworld"]["generator"] = {"type": "minecraft:noise", "settings": f"{NS}:overworld", "biome_source": {"type": "minecraft:multi_noise", "biomes": biomes}}
        write(root, f"world_preset/{name}", d)
    tag = os.path.join(root, "data/minecraft/tags/worldgen/world_preset/normal.json")
    os.makedirs(os.path.dirname(tag), exist_ok=True)
    with open(tag, "w") as f:
        json.dump({"values": [f"{NS}:{n}" for n, _ in presets]}, f, indent=2); f.write("\n")
    if target == "1.21-bop":
        # TerraBlender 는 차원 타입이 이 태그에 있어야 overworld 지역(BoP 의 지역 포함)을 주입한다.
        # 태그를 비워서 이 월드에서는 주입을 끄고, 고른 BoP 바이옴은 위 목록에 직접 넣었다.
        tb = os.path.join(root, "data/terrablender/tags/dimension_type/overworld_regions.json")
        os.makedirs(os.path.dirname(tb), exist_ok=True)
        with open(tb, "w") as f:
            json.dump({"replace": True, "values": []}, f, indent=2); f.write("\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", choices=["26.3", "1.21", "1.21-bop"], required=True, help="26.3 / 1.21(=1.21~1.21.1) / 1.21-bop(1.21.1 NeoForge + Biomes O' Plenty)")
    ap.add_argument("--vanilla", required=True, help="해당 버전의 data/minecraft/worldgen 이 들어 있는 폴더")
    ap.add_argument("--out", help="기본값: datapack-<target>")
    a = ap.parse_args()
    root = os.path.abspath(a.out or os.path.join(os.path.dirname(__file__), "..", f"datapack-{a.target}"))
    shutil.rmtree(os.path.join(root, "data"), ignore_errors=True)
    base = "1.21" if a.target == "1.21-bop" else a.target      # 지형 함수·노이즈 설정은 1.21 과 같다
    mapping = build_functions(root, a.vanilla, PARAMS, base)
    build_noise_settings(root, a.vanilla, mapping, PARAMS, base)
    build_presets(root, a.vanilla, PARAMS, a.target)
    mc = os.path.join(root, "pack.mcmeta")
    if not os.path.exists(mc):
        fmt = {"26.3": {"min_format": 121, "max_format": 121}, "1.21": {"pack_format": 48, "supported_formats": [48, 48]}, "1.21-bop": {"pack_format": 48, "supported_formats": [48, 48]}}[a.target]
        label = {"26.3": "26.3", "1.21": "1.21~1.21.1", "1.21-bop": "1.21.1 + Biomes O' Plenty"}[a.target]
        json.dump({"pack": {"description": f"Flatlands - 평원과 강 위주의 평평하고 자연스러운 지형 ({label})", **fmt}}, open(mc, "w"), indent=2, ensure_ascii=False)
    print("written to", root)

if __name__ == "__main__":
    main()
