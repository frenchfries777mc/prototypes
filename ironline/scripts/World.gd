class_name World
extends RefCounted
## 결정적 월드: 시드만 같으면 모든 클라이언트가 같은 지형과 소품을 만든다.
## 충돌은 물리 엔진을 쓰지 않고 높이 격자 + 직육면체 목록으로 직접 계산한다
## (봇 100명을 방장 브라우저에서 돌리려면 가벼워야 하고, 시뮬레이션이 렌더와 분리돼야 한다).

const HALF_X := 180.0
const HALF_Z := 100.0
const GRID := 2.0
const MARGIN := 40.0
const CELL := 8.0
const STEP_H := 0.55
const POINT_R := 14.0
const FLAT_Y := 0.5
const POINT_X := [-140.0, -70.0, 0.0, 70.0, 140.0]
const POINT_Z := [8.0, -14.0, 10.0, -12.0, 6.0]
const TRENCH_X := [-105.0, -35.0, 35.0, 105.0]

var seed_v := 1
var noise := FastNoiseLite.new()
var detail := FastNoiseLite.new()
var gx0 := 0.0
var gz0 := 0.0
var gw := 0
var gh := 0
var hmap := PackedFloat32Array()
var craters: Array = []
# {mn: Vector3, mx: Vector3, kind: int}  kind 0 석조벽 1 모래주머니 2 상자 3 목재
var boxes: Array = []
var box_cells := {}
var houses: Array = []
var house_centers: Array = []


func _init(s: int = 1) -> void:
	seed_v = s
	noise.seed = s
	noise.frequency = 0.011
	noise.fractal_octaves = 3
	detail.seed = s + 7
	detail.frequency = 0.09
	var rng := RandomNumberGenerator.new()
	rng.seed = s * 31 + 7
	for i in 26:
		var cx := rng.randf_range(-165.0, 165.0)
		var cz := rng.randf_range(-90.0, 90.0)
		if _near_point(cx, cz, POINT_R + 6.0):
			continue
		craters.append([cx, cz, rng.randf_range(3.0, 7.0), rng.randf_range(0.8, 1.7)])
	for i in range(1, 4):
		var sg := -1.0 if POINT_Z[i] > 0.0 else 1.0
		house_centers.append(Vector2(POINT_X[i] - 3.0, POINT_Z[i] + sg * 22.0))
	gx0 = -(HALF_X + MARGIN)
	gz0 = -(HALF_Z + MARGIN)
	gw = int((HALF_X + MARGIN) * 2.0 / GRID) + 1
	gh = int((HALF_Z + MARGIN) * 2.0 / GRID) + 1
	hmap.resize(gw * gh)
	for j in gh:
		for i in gw:
			hmap[j * gw + i] = _raw_height(gx0 + i * GRID, gz0 + j * GRID)
	_place_props(rng)


func point_pos(i: int) -> Vector3:
	return Vector3(POINT_X[i], height_at(POINT_X[i], POINT_Z[i]), POINT_Z[i])


func trench_center(tx: float, z: float) -> float:
	# 완만한 곡선 + 참호 특유의 지그재그(엄호 구간)
	var zig := (absf(fposmod(z / 13.0 + tx * 0.07, 1.0) - 0.5) * 2.0 - 0.5) * 2.2
	return tx + 6.0 * sin(z * 0.04 + tx * 0.1) + zig


## 거점들을 잇는 비포장 도로의 중심선 z.
func road_z(x: float) -> float:
	var xs := [-190.0, -140.0, -70.0, 0.0, 70.0, 140.0, 190.0]
	var zs := [8.0, 8.0, -14.0, 10.0, -12.0, 6.0, 6.0]
	var i := 0
	while i < xs.size() - 2 and x >= xs[i + 1]:
		i += 1
	var t := clampf((x - xs[i]) / (xs[i + 1] - xs[i]), 0.0, 1.0)
	return lerpf(zs[i], zs[i + 1], smoothstep(0.0, 1.0, t)) + sin(x * 0.07) * 1.6 + sin(x * 0.19) * 0.5


func road_mask(x: float, z: float) -> float:
	var d := absf(z - road_z(x))
	return 1.0 - smoothstep(1.1, 2.7, d)


func _near_point(x: float, z: float, r: float) -> bool:
	for i in 5:
		if Vector2(x - POINT_X[i], z - POINT_Z[i]).length() < r:
			return true
	return false


func _raw_height(x: float, z: float) -> float:
	var h := noise.get_noise_2d(x, z) * 4.5 + detail.get_noise_2d(x, z) * 0.5
	var w := 0.0
	for i in 5:
		var d := Vector2(x - POINT_X[i], z - POINT_Z[i]).length()
		w = maxf(w, 1.0 - smoothstep(POINT_R - 3.0, POINT_R + 9.0, d))
	h = lerpf(h, FLAT_Y, w)
	# 집터는 평평하게
	var wh := 0.0
	for hc in house_centers:
		wh = maxf(wh, 1.0 - smoothstep(7.5, 13.0, Vector2(x - hc.x, z - hc.y).length()))
	h = lerpf(h, 0.35, wh)
	var fl := maxf(w, wh)
	# 길은 아주 살짝 다져져 있다
	h -= 0.07 * road_mask(x, z)
	for tx in TRENCH_X:
		var cx := trench_center(tx, z)
		var dd := absf(x - cx)
		var depth := 1.55 + 0.25 * sin(z * 0.21 + tx)
		h -= depth * (1.0 - smoothstep(1.2, 3.0, dd)) * (1.0 - fl)
		# 퍼 올린 흙둑
		h += 0.5 * smoothstep(2.4, 3.5, dd) * (1.0 - smoothstep(3.5, 6.5, dd)) * (1.0 - fl)
	for c in craters:
		var dx: float = x - c[0]
		var dz: float = z - c[1]
		var r: float = c[2]
		var d2 := dx * dx + dz * dz
		if d2 < r * r * 1.6:
			var t := sqrt(d2) / r
			h -= c[3] * (1.0 - smoothstep(0.0, 1.0, t))
			h += 0.3 * smoothstep(0.8, 1.0, t) * (1.0 - smoothstep(1.0, 1.3, t))
	return h


func height_at(x: float, z: float) -> float:
	var fx := (x - gx0) / GRID
	var fz := (z - gz0) / GRID
	var ix := clampi(int(floor(fx)), 0, gw - 2)
	var iz := clampi(int(floor(fz)), 0, gh - 2)
	var tx := clampf(fx - ix, 0.0, 1.0)
	var tz := clampf(fz - iz, 0.0, 1.0)
	var i0 := iz * gw + ix
	var a := lerpf(hmap[i0], hmap[i0 + 1], tx)
	var b := lerpf(hmap[i0 + gw], hmap[i0 + gw + 1], tx)
	return lerpf(a, b, tz)


# ---------------------------------------------------------------- 소품 배치

func _add_box(cx: float, cz: float, sx: float, sz: float, h: float, kind: int) -> void:
	var mn := Vector3(cx - sx * 0.5, 0.0, cz - sz * 0.5)
	var mx := Vector3(cx + sx * 0.5, 0.0, cz + sz * 0.5)
	var by := minf(minf(height_at(mn.x, mn.z), height_at(mx.x, mn.z)),
		minf(height_at(mn.x, mx.z), height_at(mx.x, mx.z))) - 0.35
	mn.y = by
	mx.y = by + h + 0.35
	_register(mn, mx, kind)


func _add_box_y(cx: float, cz: float, sx: float, sz: float, y0: float, y1: float, kind: int, gy: float) -> void:
	_register(Vector3(cx - sx * 0.5, gy + y0, cz - sz * 0.5), Vector3(cx + sx * 0.5, gy + y1, cz + sz * 0.5), kind)


func _register(mn: Vector3, mx: Vector3, kind: int) -> void:
	var idx := boxes.size()
	boxes.append({"mn": mn, "mx": mx, "kind": kind})
	var x0 := int(floor((mn.x - 1.0) / CELL))
	var x1 := int(floor((mx.x + 1.0) / CELL))
	var z0 := int(floor((mn.z - 1.0) / CELL))
	var z1 := int(floor((mx.z + 1.0) / CELL))
	for cx2 in range(x0, x1 + 1):
		for cz2 in range(z0, z1 + 1):
			var key := Vector2i(cx2, cz2)
			if not box_cells.has(key):
				box_cells[key] = []
			box_cells[key].append(idx)


func _place_props(rng: RandomNumberGenerator) -> void:
	# 1) 거점마다 폐가와 엄폐물
	for i in 5:
		var px: float = POINT_X[i]
		var pz: float = POINT_Z[i]
		if i >= 1 and i <= 3:
			var sgn := -1.0 if pz > 0.0 else 1.0
			_add_house(px - 3.0, pz + sgn * 22.0, rng)
			for bq in 2:
				_add_box(px - 3.0 + rng.randf_range(-6.0, 6.0), pz + sgn * (22.0 - 6.4 - rng.randf() * 1.5), 0.9, 0.9, 1.05, 5)
		if i == 1 or i == 3:
			var gsgn := -1.0 if pz > 0.0 else 1.0
			_add_box(px + 4.0, pz - gsgn * 17.0, 3.8, 2.4, 1.5, 7)
		if i == 0 or i == 4 or i == 2:
			var nt := 3 if i != 2 else 1
			for tq in nt:
				var ta := rng.randf() * TAU
				var tr := rng.randf_range(16.0, 20.0)
				_add_box(px + cos(ta) * tr, pz + sin(ta) * tr, 3.4, 2.7, 1.9, 6)
		for k in 7:
			var a := rng.randf() * TAU
			var r := rng.randf_range(10.5, 20.0)
			var x := px + cos(a) * r
			var z := pz + sin(a) * r
			var roll := rng.randf()
			if roll < 0.4:
				_add_box(x, z, 3.6, 0.9, 0.95, 1)
				_add_box(x + 3.0, z + (1.6 if rng.randf() < 0.5 else -1.6), 0.9, 3.6, 0.95, 1)
			elif roll < 0.75:
				var s := rng.randf_range(1.1, 1.6)
				_add_box(x, z, s, s, s, 2)
			else:
				var horiz := rng.randf() < 0.5
				_add_box(x, z, 3.2 if horiz else 0.7, 0.7 if horiz else 3.2, rng.randf_range(1.5, 2.3), 0)
	# 2) 참호 가장자리 모래주머니
	for tx in TRENCH_X:
		var z := -86.0
		while z < 86.0:
			var cx := trench_center(tx, z)
			if not _near_point(cx, z, POINT_R + 14.0):
				var side := 1.0 if rng.randf() < 0.5 else -1.0
				_add_box(cx + side * 4.6, z, 1.0, 5.0, 0.95, 1)
			z += 11.0 + rng.randf() * 6.0
	# 3) 무인지대 잡동사니
	var placed := 0
	var tries := 0
	while placed < 38 and tries < 400:
		tries += 1
		var x := rng.randf_range(-170.0, 170.0)
		var z := rng.randf_range(-92.0, 92.0)
		if _near_point(x, z, POINT_R + 8.0):
			continue
		var skip := false
		for tx in TRENCH_X:
			if absf(x - trench_center(tx, z)) < 5.5:
				skip = true
		if skip:
			continue
		var roll := rng.randf()
		if roll < 0.45:
			var horiz := rng.randf() < 0.5
			_add_box(x, z, 4.4 if horiz else 0.7, 0.7 if horiz else 4.4, rng.randf_range(1.6, 2.6), 0)
		elif roll < 0.75:
			var s := rng.randf_range(1.0, 1.7)
			_add_box(x, z, s, s, s, 2)
		else:
			_add_box(x, z, 0.9, 4.0, 1.0, 1)
		placed += 1


## 창문과 문이 뚫린 벽체. 창으로는 총알이 지나가고(LOS 통과), 부서진 벽은 낮고 들쑥날쑥하다.
func _add_house(cx: float, cz: float, rng: RandomNumberGenerator) -> void:
	var hw := 4.8
	var hd := 3.7
	var t := 0.5
	var h := rng.randf_range(3.0, 3.5)
	var gy := height_at(cx, cz)
	var wrecked := rng.randi_range(0, 3)  # 0 북 1 남 2 서 3 동 중 한 면이 크게 무너짐
	var op: Array = []
	var door := [cx, 1.5, 0.0, 2.25]
	var win_n := [[cx - 3.0, 1.1, 0.95, 2.15], [cx + 3.0, 1.1, 0.95, 2.15]]
	var win_s := [[cx - 2.0, 1.1, 0.95, 2.15], [cx + 2.0, 1.1, 0.95, 2.15]]
	var win_w := [[cz, 1.1, 0.95, 2.15]]
	var win_e := [[cz - 1.6, 1.1, 0.95, 2.15], [cz + 1.6, 1.1, 0.95, 2.15]]
	_wall_run(cx - hw, cx + hw, cz - hd, true, h, t, [door] + win_n, gy, rng, wrecked == 0, op)
	_wall_run(cx - hw, cx + hw, cz + hd, true, h, t, win_s, gy, rng, wrecked == 1, op)
	_wall_run(cz - hd + t * 0.5, cz + hd - t * 0.5, cx - hw, false, h, t, win_w, gy, rng, wrecked == 2, op)
	_wall_run(cz - hd + t * 0.5, cz + hd - t * 0.5, cx + hw, false, h, t, win_e, gy, rng, wrecked == 3, op)
	houses.append({"cx": cx, "cz": cz, "hw": hw, "hd": hd, "h": h, "gy": gy, "open": op, "wrecked": wrecked})


## 한 면의 벽을 창/문 구멍 둘레의 조각으로 쪼개 충돌체로 등록한다.
## along_x=true 면 x 방향으로 뻗는 벽(고정 좌표는 z), 아니면 z 방향(고정 좌표는 x).
func _wall_run(u_start: float, u_end: float, fixed: float, along_x: bool, h: float, t: float,
		openings: Array, gy: float, rng: RandomNumberGenerator, wrecked: bool, op_out: Array) -> void:
	var wall_h := h * (0.55 if wrecked else 1.0)
	var ops := openings.duplicate()
	ops.sort_custom(func(a, b): return a[0] < b[0])
	var cursor := u_start
	var pieces: Array = []  # [u0, u1, y0, y1]
	for o in ops:
		var u0: float = o[0] - o[1] * 0.5
		var u1: float = o[0] + o[1] * 0.5
		var y0: float = o[2]
		var y1: float = minf(o[3], wall_h)
		if u0 > cursor + 0.05:
			pieces.append([cursor, u0, 0.0, wall_h])
		if y0 > 0.05:
			pieces.append([u0, u1, 0.0, y0])
		if y1 < wall_h - 0.05 and y1 > y0:
			pieces.append([u0, u1, y1, wall_h])
		op_out.append({"u": o[0], "w": o[1], "y0": y0, "y1": y1, "fixed": fixed, "along_x": along_x, "t": t})
		cursor = u1
	if u_end > cursor + 0.05:
		pieces.append([cursor, u_end, 0.0, wall_h])
	for i in pieces.size():
		var pc: Array = pieces[i]
		var y1: float = pc[3]
		# 맨 끝 조각과 무너진 벽은 높이가 들쑥날쑥
		if pc[2] == 0.0 and (i == 0 or i == pieces.size() - 1 or wrecked):
			y1 = pc[3] * rng.randf_range(0.5, 1.0)
		var uc: float = (pc[0] + pc[1]) * 0.5
		var ul: float = pc[1] - pc[0]
		if along_x:
			_add_box_y(uc, fixed, ul, t, pc[2], y1, 8, gy)
		else:
			_add_box_y(fixed, uc, t, ul, pc[2], y1, 8, gy)


# ---------------------------------------------------------------- 충돌/시야

## 원(반지름 r)과 겹치는 막는 상자의 윗면 높이. 없으면 -1e9. feet 보다 STEP_H 이하로 낮은 건 올라설 수 있어 무시.
func block_top(x: float, z: float, r: float, feet: float) -> float:
	var key := Vector2i(int(floor(x / CELL)), int(floor(z / CELL)))
	if not box_cells.has(key):
		return -1e9
	var best := -1e9
	for bi in box_cells[key]:
		var b: Dictionary = boxes[bi]
		var mn: Vector3 = b.mn
		var mx: Vector3 = b.mx
		if mx.y <= feet + STEP_H:
			continue
		var dx := x - clampf(x, mn.x, mx.x)
		var dz := z - clampf(z, mn.z, mx.z)
		if dx * dx + dz * dz < r * r:
			best = maxf(best, mx.y)
	return best


func ground_y(x: float, z: float, feet: float) -> float:
	var g := height_at(x, z)
	var key := Vector2i(int(floor(x / CELL)), int(floor(z / CELL)))
	if box_cells.has(key):
		for bi in box_cells[key]:
			var b: Dictionary = boxes[bi]
			var mn: Vector3 = b.mn
			var mx: Vector3 = b.mx
			if x >= mn.x and x <= mx.x and z >= mn.z and z <= mx.z and mx.y <= feet + STEP_H:
				g = maxf(g, mx.y)
	return g


func inside_box(p: Vector3) -> bool:
	var key := Vector2i(int(floor(p.x / CELL)), int(floor(p.z / CELL)))
	if not box_cells.has(key):
		return false
	for bi in box_cells[key]:
		var b: Dictionary = boxes[bi]
		var mn: Vector3 = b.mn
		var mx: Vector3 = b.mx
		if p.x >= mn.x and p.x <= mx.x and p.y >= mn.y and p.y <= mx.y and p.z >= mn.z and p.z <= mx.z:
			return true
	return false


## 시선이 지형이나 상자에 막히지 않으면 true.
func los(a: Vector3, b: Vector3) -> bool:
	var d := b - a
	var dist := d.length()
	if dist < 0.5:
		return true
	var dir := d / dist
	var t := 0.8
	while t < dist:
		var p := a + dir * t
		if p.y < height_at(p.x, p.z) or inside_box(p):
			return false
		t += 0.8
	return true


## 처음 막히는 지점까지의 거리. 막히지 않으면 max_d.
func raycast(origin: Vector3, dir: Vector3, max_d: float) -> float:
	var t := 0.8
	while t < max_d:
		var p := origin + dir * t
		if p.y < height_at(p.x, p.z) or inside_box(p):
			return t
		t += 0.8
	return max_d
