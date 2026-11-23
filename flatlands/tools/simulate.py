#!/usr/bin/env python3
"""근사 시뮬레이터: 게임을 돌리지 않고도 데이터 팩의 지형 높이·강 면적·바이옴 비율을 추정한다.

데이터 팩의 밀도 함수 JSON 을 그대로 읽어서 평가한다(작은 인터프리터). 바닐라 노이즈(ImprovedNoise /
PerlinNoise / NormalNoise / BlendedNoise)는 알려진 알고리즘을 파이썬(numpy)으로 옮긴 것이다.

한계(= 실제 게임과 다른 점): 시드가 달라 모양은 다르고 통계만 같다 / 4×8×4 셀 보간·동굴·구조물 무시 /
바닐라 노이즈 정의는 새 형식의 amplitude_modifiers 를 옛 amplitudes 와 같다고 보고 읽는다.
그래서 수치는 "대략 이 정도"로만 읽어야 한다.

    python3 tools/simulate.py --vanilla /path/to/extracted [--size 1536] [--step 8] [--preset flatlands]
"""
import argparse, json, math, os, sys, zlib
import numpy as np

# ───────────── 노이즈 ─────────────
GRAD = np.array([[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
                 [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],[1,1,0],[0,-1,1],[-1,1,0],[0,-1,-1]], dtype=np.float64)

def fade(t): return t*t*t*(t*(t*6-15)+10)
def wrap(v): return v - np.floor(v/3.3554432e7 + 0.5)*3.3554432e7

class Improved:
    def __init__(self, rng):
        self.xo, self.yo, self.zo = rng.random(3)*256.0
        p = np.arange(256); rng.shuffle(p); self.p = np.concatenate([p, p, p])  # 인덱스가 256을 넘어도 안전하게
    def noise(self, x, y, z, y_scale=0.0, y_max=0.0):
        x = x + self.xo; y = y + self.yo; z = z + self.zo
        xi = np.floor(x); yi = np.floor(y); zi = np.floor(z)
        xf = x - xi; yf = y - yi; zf = z - zi
        if y_scale != 0.0:
            ym = np.where((y_max >= 0.0) & (y_max < yf), y_max, yf)
            yoff = np.floor(ym/y_scale + 1e-7)*y_scale
        else: yoff = 0.0
        xi = xi.astype(np.int64) & 255; yi = yi.astype(np.int64) & 255; zi = zi.astype(np.int64) & 255
        P = self.p
        i = P[xi]; j = P[xi+1]
        k = P[i+yi]; l = P[i+yi+1]; m = P[j+yi]; n = P[j+yi+1]
        yf2 = yf - yoff
        def g(h, a, b, c):
            v = GRAD[P[h] & 15]; return v[..., 0]*a + v[..., 1]*b + v[..., 2]*c
        d0 = g(k+zi, xf, yf2, zf);         d1 = g(m+zi, xf-1, yf2, zf)
        d2 = g(l+zi, xf, yf2-1, zf);       d3 = g(n+zi, xf-1, yf2-1, zf)
        d4 = g(k+zi+1, xf, yf2, zf-1);     d5 = g(m+zi+1, xf-1, yf2, zf-1)
        d6 = g(l+zi+1, xf, yf2-1, zf-1);   d7 = g(n+zi+1, xf-1, yf2-1, zf-1)
        u = fade(xf); v = fade(yf); w = fade(zf)
        lerp = lambda t, a, b: a + t*(b-a)
        return lerp(w, lerp(v, lerp(u, d0, d1), lerp(u, d2, d3)), lerp(v, lerp(u, d4, d5), lerp(u, d6, d7)))

class Perlin:
    def __init__(self, rng, first_octave, amps):
        self.amps = amps; n = len(amps)
        self.oct = [Improved(rng) if a != 0 else None for a in amps]
        self.lowest_value = 2.0**(n-1)/(2.0**n - 1.0); self.lowest_input = 2.0**first_octave
    def value(self, x, y, z):
        out = 0.0; fi = self.lowest_input; fv = self.lowest_value
        for a, o in zip(self.amps, self.oct):
            if o is not None: out = out + a*o.noise(wrap(x*fi), wrap(y*fi), wrap(z*fi))*fv
            fi *= 2.0; fv /= 2.0
        return out

class Normal:
    def __init__(self, rng, first_octave, amps):
        self.a = Perlin(rng, first_octave, amps); self.b = Perlin(rng, first_octave, amps)
        nz = [i for i, v in enumerate(amps) if v != 0]; span = max(nz) - min(nz)
        self.factor = (1.0/6.0)/(0.1*(1.0 + 1.0/(span + 1)))
    def value(self, x, y, z):
        f = 1.0181268882175227
        return (self.a.value(x, y, z) + self.b.value(x*f, y*f, z*f))*self.factor

class Blended:
    """바닐라 old_blended_noise (base_3d_noise)."""
    def __init__(self, rng, xz_scale, y_scale, xz_factor, y_factor, smear):
        mk = lambda lo, hi: [Improved(rng) for _ in range(hi-lo+1)]   # 옥타브 -15..0 (또는 -7..0), 인덱스 0 = 가장 낮은 주파수
        self.lo = mk(-15, 0); self.hi = mk(-15, 0); self.main = mk(-7, 0)
        self.xzm = 684.412*xz_scale; self.ym = 684.412*y_scale; self.xzf = xz_factor; self.yf = y_factor; self.smear = smear
    def value(self, x, y, z):
        d0 = x*self.xzm; d1 = y*self.ym; d2 = z*self.xzm
        d3 = d0/self.xzf; d4 = d1/self.yf; d5 = d2/self.xzf
        d6 = self.ym*self.smear; d7 = d6/self.yf
        main = 0.0; f = 1.0
        for i in range(8):
            o = self.main[len(self.main)-1-i]
            main = main + o.noise(wrap(d3*f), wrap(d4*f), wrap(d5*f), d7*f, d4*f)/f
            f /= 2.0
        sel = (main/10.0 + 1.0)/2.0
        mn = 0.0; mx = 0.0; f = 1.0
        need_lo = bool(np.any(sel < 1.0)); need_hi = bool(np.any(sel > 0.0))
        for j in range(16):
            a = wrap(d0*f); b = wrap(d1*f); c = wrap(d2*f); ys = d6*f
            if need_lo: mn = mn + self.lo[len(self.lo)-1-j].noise(a, b, c, ys, d1*f)/f
            if need_hi: mx = mx + self.hi[len(self.hi)-1-j].noise(a, b, c, ys, d1*f)/f
            f /= 2.0
        t = np.clip(sel, 0.0, 1.0)
        return (mn/512.0 + t*(mx/512.0 - mn/512.0))/128.0

# ───────────── 밀도 함수 인터프리터 ─────────────
class World:
    def __init__(self, vanilla, pack, seed=12345):
        self.v = vanilla; self.p = pack; self.seed = seed
        self.fn_cache = {}; self.noises = {}; self.blended = {}
    def _load_fn(self, rid):
        if rid not in self.fn_cache:
            ns, p = rid.split(":", 1)
            base = self.p if ns == "flatlands" else self.v
            self.fn_cache[rid] = json.load(open(os.path.join(base, "data", ns, "worldgen", "density_function", p + ".json")))
        return self.fn_cache[rid]
    def _noise(self, rid):
        if rid not in self.noises:
            ns_, nm_ = rid.split(":")
            d = json.load(open(os.path.join(self.p if ns_ == "flatlands" else self.v, "data", ns_, "worldgen/noise", nm_ + ".json")))
            rng = np.random.default_rng(zlib.crc32(rid.encode()) ^ self.seed)
            self.noises[rid] = Normal(rng, d.get("base_octave", d.get("firstOctave")), d.get("amplitude_modifiers", d.get("amplitudes")))
        return self.noises[rid]
    def ev(self, node, c, memo):
        if isinstance(node, (int, float)): return float(node)
        if isinstance(node, str):
            if node not in memo: memo[node] = self.ev(self._load_fn(node), c, memo)
            return memo[node]
        node = self.norm(node)
        t = node["type"].split(":")[1]; E = lambda k: self.ev(node[k], c, memo)
        if t == "add": return E("left") + E("right")
        if t == "sub": return E("left") - E("right")
        if t == "mul": return E("left")*E("right")
        if t == "div": return E("left")/E("right")
        if t == "min": return np.minimum(E("left"), E("right"))
        if t == "max": return np.maximum(E("left"), E("right"))
        if t == "abs": return np.abs(E("input"))
        if t == "square": return E("input")**2
        if t == "clamp": return np.clip(E("input"), node["min"], node["max"])
        if t == "half_negative": v = E("input"); return np.where(v > 0, v, v*0.5)
        if t == "quarter_negative": v = E("input"); return np.where(v > 0, v, v*0.25)
        if t in ("cache", "interpolated", "blend_density"): return E("input")
        if t == "blend_alpha": return 1.0
        if t == "blend_offset": return 0.0
        if t == "lerp": a = E("alpha"); f = E("first"); s = E("second"); return f + a*(s - f)
        if t == "gradient":
            y = c["y"]; f, to = node["from_coordinate"], node["to_coordinate"]
            u = np.clip((y - f)/(to - f), 0.0, 1.0); return node["from_value"] + u*(node["to_value"] - node["from_value"])
        if t in ("shift_a", "shift_b"):
            n = self._noise(node["noise"]); x, z = c["x"], c["z"]
            return n.value(x*0.25, 0.0, z*0.25)*4.0 if t == "shift_a" else n.value(z*0.25, x*0.25, 0.0)*4.0
        if t == "noise":
            n = self._noise(node["noise"]); xs = node["xz_scale"]; ys = node["y_scale"]
            sx = self.ev(node["shift_x"], c, memo) if "shift_x" in node else 0.0
            sz = self.ev(node["shift_z"], c, memo) if "shift_z" in node else 0.0
            return n.value(c["x"]*xs + sx, c["y"]*ys, c["z"]*xs + sz)
        if t == "old_blended_noise":
            key = json.dumps(node, sort_keys=True)
            if key not in self.blended:
                rng = np.random.default_rng(self.seed + 7)
                self.blended[key] = Blended(rng, node["xz_scale"], node["y_scale"], node["xz_factor"], node["y_factor"], node["smear_scale_multiplier"])
            return self.blended[key].value(c["x"], c["y"], c["z"])
        if t == "spline": return self.spline(node["spline"], c, memo)
        raise NotImplementedError(t)
    @staticmethod
    def norm(node):
        """1.21~1.21.1 의 옛 문법을 26.3 문법으로 바꿔 읽는다."""
        t = node["type"].split(":")[1]; n = dict(node)
        if "argument1" in n: n["left"] = n.pop("argument1"); n["right"] = n.pop("argument2")
        if "argument" in n:
            if t in ("shift_a", "shift_b"): n["noise"] = n.pop("argument")   # 노이즈 ID 가 argument 에 들어 있다
            else: n["input"] = n.pop("argument")
        if t in ("flat_cache", "cache_2d", "cache_once"): n["type"] = "minecraft:cache"
        if t == "y_clamped_gradient":
            n.update(type="minecraft:gradient", axis="y", from_coordinate=n["from_y"], to_coordinate=n["to_y"])
        if t == "shifted_noise": n["type"] = "minecraft:noise"
        return n
    def spline(self, sp, c, memo):
        if isinstance(sp, (int, float)): return float(sp)
        x = self.ev(sp["coordinate"], c, memo); pts = sp["points"]
        locs = [p["location"] for p in pts]
        vals = [self.spline(p["value"], c, memo) for p in pts]   # 값이 다시 스플라인일 수 있음
        ders = [p["derivative"] for p in pts]
        x = np.asarray(x, dtype=np.float64); out = np.zeros_like(x)
        for i in range(len(pts)-1):
            m = (x >= locs[i]) & (x < locs[i+1])
            if not m.any(): continue
            h = locs[i+1] - locs[i]; t = (x - locs[i])/h
            v0, v1 = vals[i], vals[i+1]
            if isinstance(v0, np.ndarray): v0 = v0; v1 = v1
            h00 = 2*t**3 - 3*t**2 + 1; h10 = t**3 - 2*t**2 + t; h01 = -2*t**3 + 3*t**2; h11 = t**3 - t**2
            seg = h00*v0 + h10*h*ders[i] + h01*v1 + h11*h*ders[i+1]
            out = np.where(m, seg, out)
        out = np.where(x < locs[0], vals[0] + ders[0]*(x - locs[0]), out)
        out = np.where(x >= locs[-1], vals[-1] + ders[-1]*(x - locs[-1]), out)
        return out

# ───────────── 바이옴 조회(Climate 거리) ─────────────
def biome_lookup(entries, T, H, C, E, D, W):
    names = sorted({e["biome"] for e in entries}); idx = {n: i for i, n in enumerate(names)}
    def span(v): return (v, v) if not isinstance(v, list) else (v[0], v[1])
    best = np.full(T.shape, np.inf); who = np.zeros(T.shape, dtype=np.int32)
    for e in entries:
        p = e["parameters"]; cost = 0.0
        for k, v in (("temperature", T), ("humidity", H), ("continentalness", C), ("erosion", E), ("depth", D), ("weirdness", W)):
            lo, hi = span(p[k]); cost = cost + np.maximum(np.maximum(lo - v, v - hi), 0.0)**2
        m = cost < best; best = np.where(m, cost, best); who = np.where(m, idx[e["biome"]], who)
    return names, who

def save_png(path, h, water, d, step, scale=4, zone=None):
    """높이 음영 + 물(파랑). 육지는 높이에 따라 초록 농도, river 바이옴 영역(둑 포함)은 살짝 밝게."""
    from PIL import Image
    gx, gz = np.gradient(h.astype(float)); shade = np.clip(0.5 + (-gx - gz)*0.18, 0.15, 1.0)   # 북서쪽 광원
    t = np.clip((h - 62)/10.0, 0, 1)
    r = 70 + 70*t; g = 150 + 60*t; b = 60 + 40*t
    rgb = np.stack([r, g, b], axis=-1)
    rock = np.clip((h - 72)/20.0, 0, 1)[..., None]            # 72 이상은 회색 바위로, 100 이상은 눈 덮인 흰색으로
    snow = np.clip((h - 100)/25.0, 0, 1)[..., None]
    rgb = rgb*(1 - rock) + np.array([125, 120, 115])*rock
    rgb = rgb*(1 - snow) + np.array([240, 240, 245])*snow
    rgb = rgb*shade[..., None]
    if zone is not None:
        rgb = rgb*(1 - 0.18*zone[..., None]) + np.array([40, 30, 0])*0.18*zone[..., None]    # 평탄 구역은 약간 노랗게
    bank = (d < 0.40) & ~water
    rgb[bank] = rgb[bank]*0.8 + np.array([45, 45, 25])
    depth = np.clip((62 - h)/5.0, 0, 1)
    rgb[water] = np.stack([60 - 30*depth, 120 - 50*depth, 215 - 50*depth], axis=-1)[water]
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8).transpose(1, 0, 2)).resize((h.shape[0]*scale, h.shape[1]*scale), Image.NEAREST)
    img.save(path); print("그림 저장:", path)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vanilla", required=True); ap.add_argument("--target", choices=["1.21", "1.21-bop"], default="1.21"); ap.add_argument("--pack")
    ap.add_argument("--size", type=int, default=1536, help="한 변 길이(블록)"); ap.add_argument("--step", type=int, default=8)
    ap.add_argument("--preset", default="flatlands"); ap.add_argument("--seed", type=int, default=12345)
    ap.add_argument("--ymin", type=int, default=52); ap.add_argument("--ymax", type=int, default=140)
    ap.add_argument("--png", help="지형 창을 위에서 본 그림으로 저장할 경로(PNG)")
    ap.add_argument("--climate-size", dest="climate_size", type=int, default=40960); ap.add_argument("--climate-step", dest="climate_step", type=int, default=64)
    a = ap.parse_args()
    pack = os.path.abspath(a.pack or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", f"datapack-{a.target}")); w = World(a.vanilla, pack, a.seed)
    n = a.size//a.step; ax = (np.arange(n) - n/2)*a.step + 0.5
    X, Z = np.meshgrid(ax, ax, indexing="ij"); X = X.ravel(); Z = Z.ravel()
    def ctx(y): return {"x": X, "z": Z, "y": np.full_like(X, float(y))}
    memo = {}
    G = lambda rid, y=0: w.ev(rid, ctx(y), {})
    d = G("flatlands:river_distance"); S = G("flatlands:surface_height")
    entries = json.load(open(os.path.join(pack, "data/flatlands/worldgen/world_preset", a.preset + ".json")))["dimensions"]["minecraft:overworld"]["generator"]["biome_source"]["biomes"]
    print(f"[지형 창] 격자 {n}x{n} (간격 {a.step}블록, 한 변 {a.size}블록)")

    # 각 열의 지표 = 밀도 > 0 인 가장 높은 y (동굴 무시)
    top = np.full(X.shape, a.ymin - 1.0)
    for y in list(range(a.ymin, 92)) + list(range(92, a.ymax + 1, 2)):    # 높은 곳은 2블록 간격(산 통계용)
        dens = w.ev("flatlands:sloped_cheese", ctx(y), {})
        top = np.where(dens > 0, float(y), top)
    solid_top = top
    print(f"  밀도 평가 y={a.ymin}..{a.ymax} 완료")

    # 해수면 63 → 물 블록은 y<=62. 지표(가장 높은 고체)가 61 이하여야 위에 물이 한 칸이라도 생긴다.
    water = solid_top <= 61
    land = ~water
    print(f"\n[지표 높이 — 육지 열 {land.mean()*100:.1f}% / 물 밑 열 {water.mean()*100:.1f}%]")
    hl = solid_top[land]
    q = np.percentile(hl, [1, 5, 25, 50, 75, 95, 99])
    print(f"  육지 y: 평균 {hl.mean():.1f}  표준편차 {hl.std():.2f}  최소 {hl.min():.0f}  최대 {hl.max():.0f}")
    print("  육지 y 백분위 1/5/25/50/75/95/99%: " + " ".join(f"{v:.0f}" for v in q))
    rise = G("flatlands:mountain_rise"); zone = G("flatlands:flat_zone")
    far = land & (d > 1.1) & (rise < 0.5)   # 강변 숲 띠 바깥의 평지(산 제외)만
    hf = solid_top[far]
    print(f"  강에서 먼 평지(산 제외): 평균 {hf.mean():.1f}  표준편차 {hf.std():.2f}  5~95% 범위 {np.percentile(hf,5):.0f}~{np.percentile(hf,95):.0f}")
    # 평탄 구역 안/밖의 출렁임: 전체 표준편차와, 64블록 격자 안에서 평균을 뺀 국소 표준편차
    gh = solid_top.reshape(n, n); gfar = far.reshape(n, n); gz = zone.reshape(n, n); b = max(1, 64 // a.step)
    def local_sd(mask):
        vals = []
        for i in range(0, n - b + 1, b):
            for j in range(0, n - b + 1, b):
                m = mask[i:i+b, j:j+b]
                if m.all(): blk = gh[i:i+b, j:j+b]; vals.append(blk - blk.mean())
        return np.concatenate([v.ravel() for v in vals]).std() if vals else float("nan")
    zin = far & (zone > 0.95); zout = far & (zone < 0.05)
    print(f"  평탄 구역 면적(zone>0.95) 육지의 {(zone[land] > 0.95).mean()*100:.0f}%  /  구역 밖(zone<0.05) {(zone[land] < 0.05).mean()*100:.0f}%")
    for nm, mk in (("일반 지형(구역 밖)", zout), ("평탄 구역 안", zin)):
        if mk.sum() > 50:
            print(f"  {nm}: 전체 표준편차 {solid_top[mk].std():.2f}  국소(64블록) 표준편차 {local_sd(mk.reshape(n, n)):.2f}  5~95% {np.percentile(solid_top[mk],5):.0f}~{np.percentile(solid_top[mk],95):.0f}")
    mh = G("flatlands:mountain_rise")
    mm = mh > 3.0
    print(f"  산(솟은 높이>3블록) 면적 {mm.mean()*100:.1f}%  /  >15블록 {(mh>15).mean()*100:.2f}%  /  >30블록 {(mh>30).mean()*100:.2f}%  / 지표 최고 y {solid_top.max():.0f}")
    if mm.any():
        sl_m = np.abs(np.gradient(solid_top.reshape(n, n), a.step)[0]).ravel()[mm]
        print(f"  산 위 가로 기울기(높이차/블록): 중앙값 {np.median(sl_m):.2f}  90% {np.percentile(sl_m,90):.2f}  (1.0 = 45도)")
    # 본류/지류: 어느 단면이 표면을 정하는지로 구분
    pm = G("flatlands:river_main_profile"); pb = G("flatlands:river_branch_profile")
    is_main = pm <= pb
    for nm, mk in (("본류", water & is_main), ("지류", water & ~is_main)):
        if mk.any(): print(f"  {nm}: 물 열 {mk.mean()*100:.1f}%  강바닥 평균 y {solid_top[mk].mean():.1f}  (물 깊이 평균 {63 - solid_top[mk].mean():.1f})")
    sh = (d > 0.40) & (d < 0.69) & land & (rise < 0.5)
    if sh.any(): print(f"  하안단구 구간(D 0.40~0.69) 육지 열 중 y 63.5~65.5(평평한 선반): {((solid_top[sh] >= 63.5) & (solid_top[sh] <= 65.5)).mean()*100:.0f}%  평균 y {solid_top[sh].mean():.1f}")
    hw = solid_top[water]
    if hw.size: print(f"  강바닥 y: 평균 {hw.mean():.1f}  최소 {hw.min():.0f}  최대 {hw.max():.0f}")
    g = solid_top.reshape(n, n)
    dx = np.abs(np.diff(g, axis=0)).ravel()/a.step; dz = np.abs(np.diff(g, axis=1)).ravel()/a.step
    sl = np.concatenate([dx, dz])
    print(f"  인접 열 기울기(높이차/{a.step}블록): 중앙값 {np.median(sl):.3f}  95% {np.percentile(sl,95):.3f}  99% {np.percentile(sl,99):.3f}  최대 {sl.max():.2f}   (1.0 = 45도)")
    rw_ = json.load(open(os.path.join(pack, "data/flatlands/worldgen/world_preset", a.preset + ".json")))["dimensions"]["minecraft:overworld"]["generator"]["biome_source"]["biomes"]
    rivw = max(e["parameters"]["weirdness"][1] for e in rw_ if e["biome"].endswith("river"))
    print(f"\n[강 일관성 — 이 창 한정] river 바이옴 폭 d<{rivw:.2f}")
    inriv = d < rivw
    print(f"  물 밑 열 중 river 바이옴 영역 안: {inriv[water].mean()*100:.1f}%   |  river 영역 열 중 실제 물: {water[inriv].mean()*100:.1f}%")
    def run_stats(mask2d):
        runs = []
        for row in mask2d:
            c = 0
            for v in row:
                if v: c += 1
                elif c: runs.append(c*a.step); c = 0
            if c: runs.append(c*a.step)
        return runs
    for nm, mk in (("본류", water & is_main), ("지류", water & ~is_main)):
        r_ = run_stats(mk.reshape(n, n))
        if r_: print(f"  {nm} 물 폭(x방향 단면; 비스듬하면 실제보다 넓게 나옴): 중앙값 {np.median(r_):.0f}블록  90% {np.percentile(r_,90):.0f}  최대 {max(r_)}")
    if a.png:
        save_png(a.png, solid_top.reshape(n, n), water.reshape(n, n), d.reshape(n, n), a.step, zone=zone.reshape(n, n))
    # 해석적 물 판정(S<62)과 실제 판정이 얼마나 다른지 → 아래 넓은 창 통계를 실제 값으로 환산할 때 쓴다
    wa = S < 62.0
    print(f"  (해석적 S<62 물 비율 {wa.mean()*100:.1f}% vs 밀도 기반 {water.mean()*100:.1f}%)")

    # ───── 넓은 창: 바이옴 비율 / 강 면적 (2D 함수만 평가하므로 가볍다) ─────
    big = a.climate_size; cs = a.climate_step; m = big//cs
    cx = (np.arange(m) - m/2)*cs + 0.5
    CX, CZ = np.meshgrid(cx, cx, indexing="ij"); CX = CX.ravel(); CZ = CZ.ravel()
    cc = {"x": CX, "z": CZ, "y": np.zeros_like(CX)}
    GC = lambda rid: w.ev(rid, cc, {})
    cd = GC("flatlands:river_distance"); cS = GC("flatlands:surface_height")
    if a.target in ("1.21", "1.21-bop"):
        rt = json.load(open(os.path.join(a.vanilla, "data/minecraft/worldgen/noise_settings/overworld.json")))["noise_router"]
        cT = w.ev(rt["temperature"], cc, {}); cH = w.ev(rt["vegetation"], cc, {})
    else:
        cT = GC("minecraft:overworld/temperature"); cH = GC("minecraft:overworld/vegetation")
    nsr = json.load(open(os.path.join(pack, "data/flatlands/worldgen/noise_settings/overworld.json")))["noise_router"]
    cC = GC(nsr["continents"]); cE = GC(nsr["erosion"])    # 라우터의 continents = 산 높이 신호
    print(f"\n[넓은 창 {big}x{big} 블록, 간격 {cs}, 표본 {m*m}개]")
    for nm, v in (("temperature", cT), ("vegetation", cH), ("산 높이 신호", cC), ("erosion", cE), ("river_distance", cd)):
        print(f"  {nm:14s} 평균 {v.mean():+.3f}  표준편차 {v.std():.3f}  5~95% [{np.percentile(v,5):+.2f}, {np.percentile(v,95):+.2f}]")
    names, who = biome_lookup(entries, cT, cH, cC, cE, np.zeros_like(cT), cd)
    print(f"\n[바이옴 면적 비율 — 프리셋 {a.preset}, 지표 기준]")
    counts = {nm: (who == i).mean()*100 for i, nm in enumerate(names)}
    for nm, v in sorted(counts.items(), key=lambda kv: -kv[1]):
        if v > 0: print(f"  {nm.split(':')[1]:20s} {v:5.1f}%")
    ring = sum(v for k, v in counts.items() if k.split(":")[1] in ("beach", "snowy_beach", "stony_shore"))
    print(f"  (강변 모래·자갈 띠 {ring:.1f}%)")
    PLAINSY = ("plains", "sunflower_plains", "river", "frozen_river", "field", "grassland", "prairie", "pasture", "lavender_field", "shrubland")
    MTN = ("stony_peaks", "frozen_peaks", "windswept_hills", "snowy_slopes")
    mt = sum(v for k, v in counts.items() if k.split(":")[1] in MTN)
    print(f"  (돌산·산기슭 바이옴 합계 {mt:.1f}%)")
    pr = sum(v for k, v in counts.items() if k.split(":")[1] in PLAINSY)
    bop = sum(v for k, v in counts.items() if k.startswith("biomesoplenty:"))
    if bop: print(f"  (Biomes O' Plenty 바이옴 합계 {bop:.1f}%)")
    rv = sum(v for k, v in counts.items() if k.endswith("river"))
    print(f"  → 평원 계열(바닐라+BoP 평원류)·강 합계 {pr:.1f}%   (강만 {rv:.1f}%)")
    print(f"  해석적 물(S<62) 면적 {(cS < 62).mean()*100:.1f}%   |  river 바이옴 면적 {rv:.1f}%")

if __name__ == "__main__":
    main()
