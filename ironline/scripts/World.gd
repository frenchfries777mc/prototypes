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
	return tx + 7.0 * sin(z * 0.045 + tx * 0.1)


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
		w = maxf(w, 1.0 - smoothstep(POINT_R + 2.0, POINT_R + 16.0, d))
	h = lerpf(h, FLAT_Y, w)
	for tx in TRENCH_X:
		var cx := trench_center(tx, z)
		var dd := absf(x - cx)
		h -= 1.7 * (1.0 - smoothstep(1.3, 3.4, dd)) * (1.0 - w)
	for c in craters:
		var dx: float = x - c[0]
		var dz: float = z - c[1]
		var r: float = c[2]
		var d2 := dx * dx + dz * dz
		if d2 < r * r * 1.6:
			var t := sqrt(d2) / r
			h -= c[3] * (1.0 - smoothstep(0.0, 1.0, t))
			h += 0.25 * smoothstep(0.8, 1.0, t) * (1.0 - smoothstep(1.0, 1.25, t))
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


func _add_house(cx: float, cz: float, rng: RandomNumberGenerator) -> void:
	var hw := 4.6
	var hd := 3.6
	var t := 0.7
	var h := rng.randf_range(2.8, 3.4)
	houses.append({"cx": cx, "cz": cz, "hw": hw, "hd": hd, "h": h})
	# 남쪽(z+)은 통벽, 북쪽(z-)은 출입구
	_add_box(cx, cz + hd, hw * 2.0, t, h, 0)
	_add_box(cx - hw * 0.5 - 1.0, cz - hd, hw - 2.0, t, h * 0.85, 0)
	_add_box(cx + hw * 0.5 + 1.0, cz - hd, hw - 2.0, t, h, 0)
	_add_box(cx - hw, cz, t, hd * 2.0 - 3.0, h, 3)
	_add_box(cx + hw, cz - 0.5, t, hd * 2.0 - 2.0, h * 0.6, 0)


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
