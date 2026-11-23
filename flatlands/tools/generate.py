#!/usr/bin/env python3
"""Flatlands 데이터 팩 생성기.

바닐라 worldgen 데이터를 읽어서, 지형을 정하는 몇 개의 함수만 직접 만든 것으로 바꾼 복사본을
`datapack-<target>/` 아래에 쓴다. 지표 규칙·동굴·광맥 등은 바닐라를 그대로 참조한다.

사용법:
    python3 tools/generate.py --target 1.21     --vanilla <1.21.1 서버 jar 에서 푼 폴더>
    python3 tools/generate.py --target 1.21-bop --vanilla <1.21.1 ...>      # Biomes O' Plenty 연동

(26.3 대상은 더 이상 관리하지 않는다. 필요하면 git 기록의 d83c86a 이전 커밋을 참고.)

모든 튜닝 값은 아래 PARAMS 한 곳에 모여 있다.
"""
import argparse, json, os, shutil

NS = "flatlands"

# ───────────────────────── 튜닝 값 ─────────────────────────
PARAMS = dict(
    # 육지 높이(블록). 바다 수면(y=63)보다 항상 위에 있도록 하한을 둔다.
    land_base=66.5,      # 평균 육지 높이의 기준값
    land_amp=1.9,        # 완만한 기복의 세기(블록). 클수록 언덕이 커진다
    land_scale=1.0,      # 기복 노이즈의 xz 배율. 클수록 기복의 주기가 짧아진다
    land_min=65.3,       # 육지 높이 하한 (수면 y=63 위에 강둑이 남도록)
    land_max=72.0,       # 육지 높이 상한
    micro_k=0.30,        # 바닐라 3D 노이즈(base_3d_noise)를 곱하는 비율. 0이면 완전 평탄, 1이면 바닐라 평원
    factor=6.25,         # 바닐라 평지와 같은 값. 높일수록 표면이 매끈해진다
    # 평탄 구역: 저주파 노이즈가 문턱을 넘는 넓은 지역은 기복과 잔 요철을 거의 없애고 산도 세우지 않는다
    flat_scale=0.5,      # 평탄 구역 노이즈의 xz 배율. 작을수록 구역이 넓다(0.5 → 한 구역이 1~2km)
    flat_lo=0.10, flat_hi=0.25,   # 노이즈가 lo→hi 로 커질수록 평탄 구역(0→1). 낮추면 평탄 구역이 늘어남
    flat_residual=0.2,   # 평탄 구역 안에 남기는 기복 비율(0.2 = 80% 제거)
    # 강: 큰 규모의 본류 + 가는 지류. 각자의 중심선 거리로 단면(RIVER_*)을 따로 적용한다.
    river_main_scale=0.14,    # 본류 노이즈의 xz 배율. 작을수록 강이 길고 크게 굽이친다(바닐라는 0.25)
    river_branch_scale=0.30,  # 지류 노이즈의 xz 배율
    river_main_w=0.60,        # 본류 단면(RIVER_MAIN)과 바이옴 폭에 곱하는 값. 키우면 본류가 넓어짐
    river_branch_w=0.55,      # 지류 폭 배율
    river_main_biome=0.072,   # 본류 |노이즈|가 (이 값 × 폭 배율)보다 작으면 river 바이옴 (물이 있는 구간보다 약간 넓게)
    river_branch_biome=0.046, # 지류 기준
    # 돌산: 평지 위에 드문드문 솟는 바위산
    mountain_scale=1.0,       # 산 노이즈의 xz 배율. 작을수록 산이 넓고 드물다
    mountain_foot_biome=0.08, # 산 높이 신호(0~1=0~40블록) 가 이 값을 넘으면 산기슭 바이옴
    mountain_peak_biome=0.30, # 이 값을 넘으면 봉우리 바이옴 (≈12블록 이상)
    rock_extra=0.8,           # 산 위에서 3D 노이즈에 더하는 세기. 클수록 거칠고 삐죽함
)

# 강 단면(절대 높이 T(d)): (중심선까지의 |노이즈| d, 그 지점의 땅 높이). 표면 = min(육지, 본류 T, 지류 T).
#  본류: 깊은 강바닥(y≈56.5) → 물가(62.5) → 평평한 하안단구(y≈64) 약 10블록 → 완만한 강둑이 육지에 닿음. 폭 ≈ 24블록.
#  지류: 얕고 좁은 강(바닥 y≈60.3, 물 깊이 ≈ 2.7) → 짧은 단구 → 육지. 폭 ≈ 7블록.
RIVER_MAIN = [(0.000, 56.5), (0.020, 57.0), (0.040, 60.0), (0.064, 62.5), (0.074, 64.0), (0.125, 64.6), (0.190, 67.5), (0.260, 74.0), (0.360, 84.0)]
RIVER_BRANCH = [(0.000, 60.3), (0.020, 60.8), (0.040, 62.5), (0.050, 63.7), (0.065, 64.2), (0.090, 64.6), (0.130, 67.0), (0.180, 73.0), (0.250, 82.0)]

# 바이옴 선택용 강 거리 D (router.ridges): D = min(본류|N|/기준, 지류|N|/기준) × RIVER_UNIT.
#  D<0.40 강 / 0.40~0.52 강변 모래·자갈 띠 / 0.52~1.05 강변 숲(하안림) / 그 바깥은 일반 육지. 산은 D<0.8 에서 서지 않는다.
RIVER_UNIT = 0.40
BANK_END, RIPARIAN_END = 0.52, 1.05

# 산 모양: (산 노이즈 값, 솟는 높이(블록)). 노이즈가 이 값을 넘는 곳만 솟는다(표준편차≈0.35 → 0.5 초과는 약 8%).
MOUNTAIN_PROFILE = [(0.40, 0.0), (0.50, 8.0), (0.65, 30.0), (0.85, 52.0), (1.10, 64.0)]
MOUNTAIN_SCALE_BLOCKS = 40.0   # 산 높이 신호를 0~1 로 맞출 때 나누는 값

# 기후 경계(온도 T, 습도 H, 침식 E). 노이즈 분포: T 표준편차≈0.40, H≈0.24, E≈0.31
T_COLD, T_HOT, H_WET, E_SUN = -0.55, 0.65, 0.35, 0.45
E_STONY, E_RIPARIAN = 0.35, 0.15   # 강변 자갈 띠가 되는 침식 값 / 강변 숲이 서는 침식 값(이보다 낮으면 평원)


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
    for dst, src in (("river_main", "ridge"), ("river_branch", "ridge"), ("rolling", "erosion"),
                     ("mountain", "continentalness"), ("flatzone", "temperature")):
        write(root, f"noise/{dst}", load(vdir, f"noise/{src}"))


def build_functions(root, vdir, P, ver):
    S = Syn(ver)
    F = lambda n: f"{NS}:{n}"
    V = lambda n: f"minecraft:overworld/{n}"
    build_noises(root, vdir)

    # 1) 평탄 구역 마스크 z: 0 = 일반 지형, 1 = 거의 완전 평지. relief = 1 - (1-residual)*z 를 기복·잔 요철·산에 곱한다.
    zone = S.clamp(S.mul(S.add(S.noise(F("flatzone"), P["flat_scale"]), -P["flat_lo"]), 1.0/(P["flat_hi"]-P["flat_lo"])), 0.0, 1.0)
    write(root, "density_function/flat_zone", S.cache2d(zone))
    write(root, "density_function/relief", S.cache2d(S.sub(1.0, S.mul(F("flat_zone"), 1.0 - P["flat_residual"]))))

    # 2) 강: 본류(큰 규모)와 지류(작은 규모) 각각의 중심선까지의 |노이즈|
    write(root, "density_function/river_main_abs", S.cache2d(S.un("abs", S.noise(F("river_main"), P["river_main_scale"]))))
    write(root, "density_function/river_branch_abs", S.cache2d(S.un("abs", S.noise(F("river_branch"), P["river_branch_scale"]))))
    #    바이옴 선택용 거리 D(무차원). 같은 중심선에서 만들어지므로 물이 있는 곳과 river 바이옴이 어긋나지 않는다.
    wm, wb = P["river_main_w"], P["river_branch_w"]
    dist = S.min(S.mul(F("river_main_abs"), RIVER_UNIT / (P["river_main_biome"]*wm)), S.mul(F("river_branch_abs"), RIVER_UNIT / (P["river_branch_biome"]*wb)))
    write(root, "density_function/river_distance", S.cache2d(S.clamp(dist, 0.0, 2.0)))
    #    산은 강에서 충분히 떨어진 곳에서만 선다(D<0.8 이면 0, D>1.0 이면 1)
    write(root, "density_function/river_clear", S.cache2d(S.clamp(S.mul(S.add(F("river_distance"), -0.8), 5.0), 0.0, 1.0)))

    # 3) 완만한 육지 기복(블록). 평탄 구역에서는 relief 만큼만 남는다.
    raw = S.add(P["land_base"], S.mul(S.mul(S.noise(F("rolling"), P["land_scale"]), P["land_amp"]), F("relief")))
    write(root, "density_function/land_height", S.cache2d(S.clamp(raw, P["land_min"], P["land_max"])))

    # 4) 돌산: 산 노이즈가 문턱을 넘는 곳만 솟고, 강 근처와 평탄 구역에서는 서지 않는다.
    #    문턱에서 바로 가파르게 솟게 하려고 스플라인 도함수를 직접 지정한다.
    ders = [0.0, 140.0, 190.0, 95.0, 0.0]
    mt = {"type": "minecraft:spline", "spline": {"coordinate": F("mountain_noise"),
          "points": [{"location": x, "value": y, "derivative": d} for (x, y), d in zip(MOUNTAIN_PROFILE, ders)]}}
    write(root, "density_function/mountain_noise", S.cache2d(S.noise(F("mountain"), P["mountain_scale"])))
    write(root, "density_function/mountain_rise", S.cache2d(S.mul(S.mul(mt, F("river_clear")), S.sub(1.0, F("flat_zone")))))
    write(root, "density_function/mountain_height", S.clamp(S.mul(F("mountain_rise"), 1.0/MOUNTAIN_SCALE_BLOCKS), 0.0, 1.0))
    write(root, "density_function/rock_mask", S.clamp(S.mul(F("mountain_height"), 4.0), 0.0, 1.0))

    # 5) 표면 높이 = min(육지, 본류 단면, 지류 단면) + 산 높이
    write(root, "density_function/river_main_profile", S.cache2d(S.spline(F("river_main_abs"), [(round(d*wm, 5), y) for d, y in RIVER_MAIN])))
    write(root, "density_function/river_branch_profile", S.cache2d(S.spline(F("river_branch_abs"), [(round(d*wb, 5), y) for d, y in RIVER_BRANCH])))
    base = S.min(F("land_height"), S.min(F("river_main_profile"), F("river_branch_profile")))
    write(root, "density_function/surface_height", S.cache2d(S.add(base, F("mountain_rise"))))

    # 6) offset: 바닐라 depth = (1 - y/128) + offset 이므로 표면이 y=S 이려면 offset = S/128 - 1
    write(root, "density_function/offset", S.cache2d(S.add(S.mul(F("surface_height"), 0.0078125), -1.0)))
    write(root, "density_function/factor", P["factor"])
    write(root, "density_function/depth", S.add(S.ygrad(-64, 1.5, 320, -1.5), F("offset")))

    # 7) sloped_cheese: 바닐라에서 jaggedness 를 빼고, 3D 노이즈를 (micro_k × relief + 산 위에서는 rock_extra) 배로 쓴다.
    k = S.add(S.mul(F("relief"), P["micro_k"]), S.mul(F("rock_mask"), P["rock_extra"]))
    core = S.add(S.mul(S.un("quarter_negative", S.mul(F("depth"), F("factor"))), 4.0), S.mul(k, V("base_3d_noise")))
    write(root, "density_function/sloped_cheese", {"type": "minecraft:cache", "input": core} if S.new else core)

    mapping = {V("sloped_cheese"): F("sloped_cheese"), V("offset"): F("offset"), V("factor"): F("factor"), V("depth"): F("depth"),
               V("preliminary_surface_level"): F("preliminary_surface_level")}
    if S.new:
        for n in ("final_density", "preliminary_surface_level", "chunk_surface_level"):
            d = sub_refs(load(vdir, f"density_function/overworld/{n}"), mapping)
            write(root, f"density_function/{n}", strip_caves(d, F("sloped_cheese")) if n == "final_density" else d)
    return mapping


def strip_caves(node, sloped_ref):
    """final_density 에서 동굴을 모두 걷어낸다: sloped_cheese 로 분기하는 range_choice(치즈·스파게티·입구·기둥 동굴)를
    sloped_cheese 자체로 바꾸고, 가는 터널(noodle)은 큰 상수로 바꿔 min() 에서 영향이 없게 한다."""
    if isinstance(node, dict):
        if node.get("type") == "minecraft:range_choice" and node.get("input") == sloped_ref:
            return sloped_ref
        return {k: strip_caves(v, sloped_ref) for k, v in node.items()}
    if isinstance(node, list): return [strip_caves(v, sloped_ref) for v in node]
    if node == "minecraft:overworld/caves/noodle": return 64.0
    return node


def build_overrides(root, vdir, ver):
    """바닐라 데이터 중 월드 전체에 적용되는 것을 덮어쓴다(이 팩을 켠 월드에만 적용):
    동굴·협곡 카버를 끄고(확률 0), 용암호수 배치 개수를 0 으로 만든다.
    26.3 은 카버 구조가 달라(cave 는 probability 대신 count) 0 이 허용되는지 확인할 수 없어 협곡만 끈다."""
    base = os.path.join(root, "data/minecraft/worldgen")
    def put(rel, d):
        out = os.path.join(base, rel + ".json"); os.makedirs(os.path.dirname(out), exist_ok=True)
        json.dump(d, open(out, "w"), indent=2); open(out, "a").write("\n")
    if ver == "26.3":
        d = load(vdir, "carver/canyon"); d["probability"] = 0.0; put("carver/canyon", d)
    else:
        for name in ("cave", "cave_extra_underground", "canyon"):
            d = load(vdir, f"configured_carver/{name}"); d["config"]["probability"] = 0.0; put(f"configured_carver/{name}", d)
    for name in ("lake_lava_surface", "lake_lava_underground"):
        d = load(vdir, f"placed_feature/{name}"); d["placement"] = [{"type": "minecraft:count", "count": 0}]; put(f"placed_feature/{name}", d)


def build_noise_settings(root, vdir, mapping, P, ver):
    ns = load(vdir, "noise_settings/overworld")
    V = lambda n: f"minecraft:overworld/{n}"
    m = dict(mapping)
    m[V("ridges")] = f"{NS}:river_distance"          # weirdness 축 = 강까지의 거리 D
    m[V("continents")] = f"{NS}:mountain_height"     # continentalness 축 = 산 높이 신호
    full = [-1.0, 1.0]
    far = [RIPARIAN_END + 0.05, 2.0]                  # 스폰은 강·강변 숲·산이 아닌 평지에서 찾는다
    low = [-1.0, P["mountain_foot_biome"]]
    if ver == "26.3":
        m[V("final_density")] = f"{NS}:final_density"; m[V("chunk_surface_level")] = f"{NS}:chunk_surface_level"
        ns = sub_refs(ns, m)
        ns["spawn_target"] = [{f"{NS}:mountain_height": low, V("erosion"): full, f"{NS}:river_distance": far, V("temperature"): full, V("vegetation"): full}]
    else:
        ns = sub_refs(ns, m)
        ns["noise_router"]["final_density"] = strip_caves(ns["noise_router"]["final_density"], f"{NS}:sloped_cheese")
        ns["spawn_target"] = [{"continentalness": low, "depth": 0.0, "erosion": full, "humidity": full, "offset": 0.0, "temperature": full, "weirdness": far}]
    write(root, "noise_settings/overworld", ns)


# ───────────────────────── 바이옴 목록 ─────────────────────────
FULL = [-1.0, 1.0]
def rng(a, b): return [a, b]

W_ANY = [-1.0, 2.0]   # 강 거리 D 는 0~2 이므로 '아무 데나'도 2 까지 열어 둔다(안 그러면 강에서 먼 곳에서 거리 페널티를 받는다)
def entry(biome, T=FULL, H=FULL, C=FULL, E=FULL, D=0.0, W=W_ANY):
    return {"biome": biome, "parameters": {"temperature": T, "humidity": H, "continentalness": C, "erosion": E, "depth": D, "weirdness": W, "offset": 0.0}}

def surface(biome, **kw):
    """지표 바이옴은 depth 0 과 1 두 항목을 넣는다(바닐라와 같은 방식 → 지하도 같은 바이옴이 이어진다). 동굴이 없으므로 동굴 바이옴은 넣지 않는다."""
    return [entry(biome, D=0.0, **kw), entry(biome, D=1.0, **kw)]

W_RIVER, W_BANK, W_RIPA, W_FAR = rng(0.0, RIVER_UNIT), rng(RIVER_UNIT, BANK_END), rng(BANK_END, RIPARIAN_END), rng(RIPARIAN_END, 2.0)

def rivers(cold_frozen=True):
    if cold_frozen:
        return surface("minecraft:frozen_river", T=rng(-1.0, T_COLD), W=W_RIVER) + surface("minecraft:river", T=rng(T_COLD, 1.0), W=W_RIVER)
    return surface("minecraft:river", W=W_RIVER)

def banks(all_climates=True):
    """강변 띠: 모래(beach), 침식이 큰 곳은 자갈(stony_shore), 아주 추운 곳은 눈 쌓인 해변."""
    L = surface("minecraft:snowy_beach", T=rng(-1.0, T_COLD), W=W_BANK)
    L += surface("minecraft:beach", T=rng(T_COLD, 1.0), E=rng(-1.0, E_STONY), W=W_BANK)
    L += surface("minecraft:stony_shore", T=rng(T_COLD, 1.0), E=rng(E_STONY, 1.0), W=W_BANK)
    return L

def mountains(P, simple=False):
    """산 높이 신호(C)가 문턱을 넘으면 돌산 바이옴. 추운 곳은 눈 덮인 쪽."""
    foot, peak = P["mountain_foot_biome"], P["mountain_peak_biome"]
    cold = rng(-1.0, -0.45); warm = rng(-0.45, 1.0)
    if simple:
        return surface("minecraft:stony_peaks", C=rng(foot, 1.0))
    return (surface("minecraft:snowy_slopes", T=cold, C=rng(foot, peak)) + surface("minecraft:windswept_hills", T=warm, C=rng(foot, peak)) +
            surface("minecraft:frozen_peaks", T=cold, C=rng(peak, 1.0)) + surface("minecraft:stony_peaks", T=warm, C=rng(peak, 1.0)))

def land(P, W, riparian=None):
    """온대 평원 + 기후 극단의 다른 바이옴. W 로 강에서의 거리 구간을 정한다.
    riparian 이 주어지면(강변 숲 구간) 온대 평원 상자를 침식 값으로 나눠, 침식이 높은 쪽을 강변 숲으로 바꾼다."""
    lowC = rng(-1.0, P["mountain_foot_biome"]); cold, hot = rng(-1.0, T_COLD), rng(T_HOT, 1.0)
    L = surface("minecraft:snowy_plains", T=cold, C=lowC, W=W)
    L += surface("minecraft:desert", T=hot, H=rng(-1.0, 0.10), C=lowC, W=W)
    L += surface("minecraft:plains", T=hot, H=rng(0.10, 1.0), C=lowC, W=W)
    L += surface("minecraft:forest", T=rng(T_COLD, -0.15), H=rng(H_WET, 1.0), C=lowC, W=W)
    L += surface("minecraft:flower_forest", T=rng(-0.15, 0.20), H=rng(H_WET, 1.0), C=lowC, W=W)
    L += surface("minecraft:birch_forest", T=rng(0.20, T_HOT), H=rng(H_WET, 1.0), C=lowC, W=W)
    mid, dry = rng(T_COLD, T_HOT), rng(-1.0, H_WET)
    if riparian is None:
        L += surface("minecraft:sunflower_plains", T=mid, H=dry, E=rng(E_SUN, 1.0), C=lowC, W=W)
        L += surface("minecraft:plains", T=mid, H=dry, E=rng(-1.0, E_SUN), C=lowC, W=W)
    else:
        L += surface("minecraft:plains", T=mid, H=dry, E=rng(-1.0, E_RIPARIAN), C=lowC, W=W)
        for (t, h, name) in riparian:
            L += surface(name, T=t, H=h, E=rng(E_RIPARIAN, 1.0), C=lowC, W=W)
    return L

# 강변 숲(하안림): 바닐라는 서늘하면 forest, 따뜻하면 birch_forest
RIPA_VANILLA = [(rng(T_COLD, 0.20), rng(-1.0, H_WET), "minecraft:forest"), (rng(0.20, T_HOT), rng(-1.0, H_WET), "minecraft:birch_forest")]
# BoP: 건조하면 갈대 습지(marsh), 촉촉하면 습지 숲(wetland). 온도 구간 전체에 적용
RIPA_BOP = [(rng(T_COLD, T_HOT), rng(-1.0, 0.0), "biomesoplenty:marsh"), (rng(T_COLD, T_HOT), rng(0.0, H_WET), "biomesoplenty:wetland")]

def biomes_mixed(P):
    return rivers() + banks() + mountains(P) + land(P, W_RIPA, RIPA_VANILLA) + land(P, W_FAR)

def biomes_pure(P):
    lowC = rng(-1.0, P["mountain_foot_biome"])
    L = rivers(cold_frozen=False) + surface("minecraft:beach", W=W_BANK) + mountains(P, simple=True)
    for W in (W_RIPA, W_FAR):
        L += surface("minecraft:sunflower_plains", E=rng(E_SUN, 1.0), C=lowC, W=W)
        L += surface("minecraft:plains", E=rng(-1.0, E_SUN), C=lowC, W=W)
    return L

def biomes_bop(P):
    """바닐라 평원 위주 + Biomes O' Plenty 의 평원 계열 바이옴(+ 강변 습지)을 섞은 목록. 돌산은 바닐라 바이옴.
    온대·건조하지 않은 곳(H<H_WET)을 온도/습도 구간으로 나눠 상자가 겹치지 않게 배치한다."""
    lowC = rng(-1.0, P["mountain_foot_biome"]); BOP = lambda n: f"biomesoplenty:{n}"
    L = rivers() + banks() + mountains(P) + land(P, W_RIPA, RIPA_BOP)
    # 일반 육지(강에서 먼 곳): 평원 상자(온대·건조하지 않은 곳)만 BoP 평원류로 쪼갠다
    W = W_FAR; cold, hot = rng(-1.0, T_COLD), rng(T_HOT, 1.0)
    L += surface("minecraft:snowy_plains", T=cold, C=lowC, W=W)
    L += surface("minecraft:desert", T=hot, H=rng(-1.0, 0.10), C=lowC, W=W)
    L += surface("minecraft:plains", T=hot, H=rng(0.10, 1.0), C=lowC, W=W)
    L += surface("minecraft:forest", T=rng(T_COLD, -0.15), H=rng(H_WET, 1.0), C=lowC, W=W)
    L += surface("minecraft:flower_forest", T=rng(-0.15, 0.20), H=rng(H_WET, 1.0), C=lowC, W=W)
    L += surface("minecraft:birch_forest", T=rng(0.20, T_HOT), H=rng(H_WET, 1.0), C=lowC, W=W)
    sunE, restE = rng(E_SUN, 1.0), rng(-1.0, E_SUN)
    L += surface("minecraft:sunflower_plains", T=rng(T_COLD, T_HOT), H=rng(-1.0, H_WET), E=sunE, C=lowC, W=W)
    cool, mid, warm = rng(T_COLD, -0.15), rng(-0.15, 0.25), rng(0.25, T_HOT)
    L += surface(BOP("shrubland"), T=rng(T_COLD, T_HOT), H=rng(-1.0, -0.30), E=restE, C=lowC, W=W)
    L += surface("minecraft:plains", T=cool, H=rng(-0.30, 0.00), E=restE, C=lowC, W=W)
    L += surface(BOP("field"), T=cool, H=rng(0.00, H_WET), E=restE, C=lowC, W=W)
    L += surface("minecraft:plains", T=mid, H=rng(-0.30, 0.05), E=restE, C=lowC, W=W)
    L += surface(BOP("grassland"), T=mid, H=rng(0.05, H_WET), E=restE, C=lowC, W=W)
    L += surface(BOP("prairie"), T=warm, H=rng(-0.30, -0.05), E=restE, C=lowC, W=W)
    L += surface(BOP("pasture"), T=warm, H=rng(-0.05, 0.15), E=restE, C=lowC, W=W)
    L += surface(BOP("lavender_field"), T=warm, H=rng(0.15, H_WET), E=restE, C=lowC, W=W)
    return L


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
    ap.add_argument("--target", choices=["1.21", "1.21-bop"], required=True, help="1.21(=1.21~1.21.1) / 1.21-bop(1.21.1 NeoForge + Biomes O' Plenty)")
    ap.add_argument("--vanilla", required=True, help="해당 버전의 data/minecraft/worldgen 이 들어 있는 폴더")
    ap.add_argument("--out", help="기본값: datapack-<target>")
    a = ap.parse_args()
    root = os.path.abspath(a.out or os.path.join(os.path.dirname(__file__), "..", f"datapack-{a.target}"))
    shutil.rmtree(os.path.join(root, "data"), ignore_errors=True)
    base = "1.21" if a.target == "1.21-bop" else a.target      # 지형 함수·노이즈 설정은 1.21 과 같다
    mapping = build_functions(root, a.vanilla, PARAMS, base)
    build_noise_settings(root, a.vanilla, mapping, PARAMS, base)
    build_overrides(root, a.vanilla, base)
    build_presets(root, a.vanilla, PARAMS, a.target)
    mc = os.path.join(root, "pack.mcmeta")
    if not os.path.exists(mc):
        fmt = {"pack_format": 48, "supported_formats": [48, 48]}
        label = {"1.21": "1.21~1.21.1", "1.21-bop": "1.21.1 + Biomes O' Plenty"}[a.target]
        json.dump({"pack": {"description": f"Flatlands - 평원과 강 위주의 평평하고 자연스러운 지형 ({label})", **fmt}}, open(mc, "w"), indent=2, ensure_ascii=False)
    print("written to", root)

if __name__ == "__main__":
    main()
