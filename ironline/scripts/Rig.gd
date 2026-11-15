class_name Rig
extends RefCounted
## 병사 캐릭터: 절차적 모델링 + 스키닝 + 코드 애니메이션, 그리고 1인칭 총/팔.
## 병사 한 명은 MeshInstance3D 하나(드로콜 1회)라서 100명도 감당할 수 있다.

const ROOT := 0
const HIPS := 1
const SPINE := 2
const CHEST := 3
const HEAD := 4
const UAR := 5
const LAR := 6
const UAL := 7
const LAL := 8
const THR := 9
const SHR := 10
const FTR := 11
const THL := 12
const SHL := 13
const FTL := 14

const NAMES := ["root", "hips", "spine", "chest", "head", "uarm_r", "larm_r", "uarm_l", "larm_l",
	"thigh_r", "shin_r", "foot_r", "thigh_l", "shin_l", "foot_l"]
const PARENT := [-1, 0, 1, 2, 3, 3, 5, 3, 7, 1, 9, 10, 1, 12, 13]
# 기준 자세에서 뼈의 전역 위치(m). 앞은 -Z.
const GLOBAL := [
	Vector3(0, 0, 0), Vector3(0, 0.92, 0), Vector3(0, 1.0, 0), Vector3(0, 1.22, 0), Vector3(0, 1.52, 0),
	Vector3(0.21, 1.43, 0), Vector3(0.27, 1.17, -0.07), Vector3(-0.21, 1.43, 0), Vector3(-0.12, 1.20, -0.24),
	Vector3(0.10, 0.90, 0), Vector3(0.10, 0.48, 0), Vector3(0.10, 0.10, 0),
	Vector3(-0.10, 0.90, 0), Vector3(-0.10, 0.48, 0), Vector3(-0.10, 0.10, 0),
]

const TEAM := [
	{"coat": Color(0.20, 0.27, 0.35), "coat2": Color(0.16, 0.22, 0.29), "pants": Color(0.15, 0.19, 0.25),
	 "helmet": Color(0.22, 0.25, 0.28), "wrap": Color(0.20, 0.23, 0.26), "mark": Color(0.55, 0.68, 0.88)},
	{"coat": Color(0.33, 0.29, 0.13), "coat2": Color(0.27, 0.23, 0.10), "pants": Color(0.27, 0.23, 0.11),
	 "helmet": Color(0.30, 0.26, 0.12), "wrap": Color(0.31, 0.27, 0.13), "mark": Color(0.88, 0.76, 0.42)},
]
const SKIN := Color(0.34, 0.225, 0.165)
const LEATHER := Color(0.09, 0.055, 0.03)
const WOOD := Color(0.11, 0.058, 0.026)
const STEEL := Color(0.10, 0.11, 0.12)
const BRASS := Color(0.45, 0.33, 0.12)

static var _mesh_cache := {}
static var _skin_cache: Skin = null


static func rest_local(i: int) -> Vector3:
	var p: int = PARENT[i]
	return GLOBAL[i] if p < 0 else GLOBAL[i] - GLOBAL[p]


static func make_skeleton() -> Skeleton3D:
	var sk := Skeleton3D.new()
	for i in NAMES.size():
		sk.add_bone(NAMES[i])
	for i in NAMES.size():
		sk.set_bone_parent(i, PARENT[i])
		sk.set_bone_rest(i, Transform3D(Basis.IDENTITY, rest_local(i)))
	sk.reset_bone_poses()
	return sk


static func skin() -> Skin:
	if _skin_cache == null:
		var sk := make_skeleton()
		_skin_cache = sk.create_skin_from_rest_transforms()
		sk.free()
	return _skin_cache


# ---------------------------------------------------------------- 무기 지오메트리

## 총구가 -Z, 원점은 리시버 중앙. cg=천·가죽·나무, mg=금속.
static func _weapon(cg: Geo, mg: Geo, w: int, xf: Transform3D, bone: int) -> void:
	var T := func(p: Vector3) -> Transform3D: return xf * Transform3D(Basis.IDENTITY, p)
	match w:
		0:
			mg.rod(xf * Vector3(0, 0.018, -0.28), xf * Vector3(0, 0.018, -1.02), 0.0115, 0.0098, STEEL, bone, 8)
			mg.rod(xf * Vector3(0, 0.018, -1.02), xf * Vector3(0, 0.018, -1.045), 0.012, 0.012, STEEL, bone, 8)
			mg.box(Vector3(0.006, 0.03, 0.008), T.call(Vector3(0, 0.047, -0.99)), STEEL, bone)
			mg.box(Vector3(0.036, 0.05, 0.22), T.call(Vector3(0, 0.0, -0.13)), STEEL, bone)
			mg.box(Vector3(0.03, 0.012, 0.05), T.call(Vector3(0, 0.032, -0.02)), STEEL, bone)
			mg.rod(xf * Vector3(0.018, 0.012, -0.045), xf * Vector3(0.07, -0.002, -0.036), 0.006, 0.006, STEEL, bone, 6)
			mg.sphere(0.013, T.call(Vector3(0.076, -0.003, -0.035)), STEEL, bone)
			cg.box(Vector3(0.042, 0.04, 0.48), T.call(Vector3(0, -0.008, -0.56)), WOOD, bone)
			cg.box(Vector3(0.046, 0.026, 0.40), T.call(Vector3(0, 0.032, -0.62)), WOOD * 1.15, bone)
			cg.box(Vector3(0.04, 0.07, 0.16), T.call(Vector3(0, -0.035, 0.06)), WOOD, bone)
			cg.prism(Vector2(0.044, 0.09), Vector2(0.046, 0.15), 0.2, xf * Transform3D(Basis(Vector3.RIGHT, deg_to_rad(-90)), Vector3(0, -0.06, 0.28)), WOOD * 0.9, bone)
			mg.box(Vector3(0.012, 0.01, 0.075), T.call(Vector3(0, -0.062, 0.0)), STEEL, bone)
			cg.box(Vector3(0.03, 0.05, 0.075), T.call(Vector3(0, -0.05, -0.1)), WOOD, bone)
			mg.rod(xf * Vector3(0, 0.0, -0.45), xf * Vector3(0, 0.0, -0.455), 0.03, 0.03, STEEL, bone, 8)
		1:
			mg.rod(xf * Vector3(0, 0.012, -0.12), xf * Vector3(0, 0.012, -0.46), 0.024, 0.024, STEEL, bone, 10)
			mg.rod(xf * Vector3(0, 0.012, -0.46), xf * Vector3(0, 0.012, -0.52), 0.011, 0.011, STEEL, bone, 8)
			mg.box(Vector3(0.042, 0.056, 0.30), T.call(Vector3(0, 0.0, -0.06)), STEEL, bone)
			mg.box(Vector3(0.026, 0.17, 0.04), T.call(Vector3(-0.04, -0.105, -0.12)), STEEL, bone)
			cg.box(Vector3(0.04, 0.075, 0.2), T.call(Vector3(0, -0.02, 0.2)), WOOD, bone)
			cg.box(Vector3(0.04, 0.09, 0.05), T.call(Vector3(0, -0.07, 0.06)), WOOD, bone)
			cg.box(Vector3(0.04, 0.04, 0.2), T.call(Vector3(0, -0.02, -0.32)), WOOD, bone)
			mg.box(Vector3(0.006, 0.03, 0.008), T.call(Vector3(0, 0.05, -0.43)), STEEL, bone)
		_:
			mg.rod(xf * Vector3(0, 0.016, -0.15), xf * Vector3(0, 0.016, -0.90), 0.016, 0.012, STEEL, bone, 10)
			mg.rod(xf * Vector3(0, 0.016, -0.90), xf * Vector3(0, 0.016, -0.97), 0.022, 0.022, STEEL, bone, 8)
			mg.box(Vector3(0.05, 0.06, 0.36), T.call(Vector3(0, 0.0, -0.02)), STEEL, bone)
			mg.rod(xf * Vector3(0, 0.03, -0.18), xf * Vector3(0, 0.075, -0.18), 0.095, 0.095, Color(0.14, 0.15, 0.15), bone, 14)
			cg.box(Vector3(0.05, 0.085, 0.30), T.call(Vector3(0, -0.035, 0.2)), WOOD, bone)
			cg.box(Vector3(0.04, 0.09, 0.05), T.call(Vector3(0, -0.08, 0.04)), WOOD, bone)
			mg.rod(xf * Vector3(0.0, 0.0, -0.62), xf * Vector3(0.11, -0.30, -0.78), 0.006, 0.006, STEEL, bone, 6)
			mg.rod(xf * Vector3(0.0, 0.0, -0.62), xf * Vector3(-0.11, -0.30, -0.78), 0.006, 0.006, STEEL, bone, 6)


# ---------------------------------------------------------------- 병사

static func soldier_mesh(team: int, weapon: int, low: bool = false) -> ArrayMesh:
	var key := team * 8 + weapon + (50 if low else 0)
	if _mesh_cache.has(key):
		return _mesh_cache[key]
	Geo.lod = 0.5 if low else 1.0
	var p: Dictionary = TEAM[team]
	var cg := Geo.new()
	var mg := Geo.new()
	cg.skinned = true
	mg.skinned = true
	var coat: Color = p.coat
	var coat2: Color = p.coat2
	var pants: Color = p.pants
	var mark: Color = p.mark
	var glove := Color(0.10, 0.065, 0.04)
	var fine := not low
	var X := func(pos: Vector3) -> Transform3D: return Transform3D(Basis.IDENTITY, pos)
	var SC := func(pos: Vector3, sc: Vector3) -> Transform3D: return Transform3D(Basis.from_scale(sc), pos)
	# --- 다리 / 각반 / 군화
	for side in [1.0, -1.0]:
		var th: int = THR if side > 0 else THL
		var sh: int = SHR if side > 0 else SHL
		var ft: int = FTR if side > 0 else FTL
		var x: float = 0.10 * side
		cg.limb(Vector3(x, 0.92, 0), Vector3(x, 0.50, 0.0), 0.090, 0.066, pants, th)
		cg.limb(Vector3(x, 0.50, 0.0), Vector3(x, 0.14, 0.0), 0.064, 0.05, pants, sh)
		cg.sphere(0.07, X.call(Vector3(x, 0.5, 0.0)), pants, sh)
		var wraps := 6 if fine else 3
		for k in wraps:
			var y := 0.17 + (0.36 / wraps) * k
			cg.cone(0.058 - 0.0016 * k, 0.058 - 0.0016 * k, 0.36 / wraps * 1.05, X.call(Vector3(x, y, 0)), p.wrap * (0.95 + 0.1 * (k % 2)), sh, 10, false)
		cg.prism(Vector2(0.115, 0.30), Vector2(0.10, 0.24), 0.085, Transform3D(Basis.IDENTITY, Vector3(x, 0.0, -0.045)), LEATHER * 0.8, ft)
		cg.sphere(0.058, X.call(Vector3(x, 0.05, -0.17)), LEATHER * 0.75, ft, Vector3(1.0, 0.75, 1.1), 4, 8)
		cg.prism(Vector2(0.10, 0.12), Vector2(0.085, 0.10), 0.095, Transform3D(Basis.IDENTITY, Vector3(x, 0.04, 0.025)), LEATHER, ft)
		mg.box(Vector3(0.12, 0.018, 0.33), Geo.xf_at(Vector3(x, 0.009, -0.05)), Color(0.04, 0.035, 0.03), ft)
	# --- 외투 자락 / 골반 / 허리띠 (매끈한 타원 단면)
	var skirt := [Vector2(0.0, 0.60), Vector2(0.235, 0.60), Vector2(0.252, 0.66), Vector2(0.238, 0.78), Vector2(0.200, 0.92), Vector2(0.168, 1.0)]
	cg.lathe(skirt, 16, SC.call(Vector3.ZERO, Vector3(1.0, 1.0, 0.66)), coat2, HIPS)
	cg.cone(0.175, 0.178, 0.055, SC.call(Vector3(0, 0.96, 0), Vector3(1.0, 1.0, 0.66)), LEATHER, SPINE, 16, false)
	mg.box(Vector3(0.05, 0.042, 0.014), Geo.xf_at(Vector3(0, 0.985, -0.122)), BRASS, SPINE)
	# --- 몸통
	var lower := [Vector2(0.0, 1.0), Vector2(0.15, 1.0), Vector2(0.165, 1.07), Vector2(0.186, 1.18), Vector2(0.205, 1.22)]
	var upper := [Vector2(0.205, 1.22), Vector2(0.216, 1.30), Vector2(0.224, 1.38), Vector2(0.208, 1.45), Vector2(0.135, 1.49), Vector2(0.075, 1.505), Vector2(0.0, 1.51)]
	cg.lathe(lower, 16, SC.call(Vector3.ZERO, Vector3(1.0, 1.0, 0.64)), coat, SPINE)
	cg.lathe(upper, 16, SC.call(Vector3.ZERO, Vector3(1.0, 1.0, 0.64)), coat, CHEST)
	cg.cone(0.085, 0.066, 0.055, X.call(Vector3(0, 1.485, 0)), coat2, CHEST, 12, false)
	if fine:
		for k in 5:
			mg.sphere(0.0085, X.call(Vector3(0, 1.08 + 0.095 * k, -0.137 - 0.003 * k)), BRASS, CHEST, Vector3.ONE, 4, 6)
		for sx in [1.0, -1.0]:
			cg.box(Vector3(0.09, 0.09, 0.028), X.call(Vector3(0.105 * sx, 1.20, -0.13)), coat2 * 0.85, CHEST)
			cg.box(Vector3(0.088, 0.018, 0.03), X.call(Vector3(0.105 * sx, 1.245, -0.13)), coat2 * 0.7, CHEST)
			cg.box(Vector3(0.07, 0.014, 0.05), X.call(Vector3(0.18 * sx, 1.47, 0.0)), LEATHER, CHEST)
			mg.box(Vector3(0.022, 0.014, 0.01), X.call(Vector3(0.05 * sx, 1.485, -0.07)), mark, CHEST)
	# 탄띠와 탄약 주머니
	var band_basis := Basis(Vector3(0, 0, 1), deg_to_rad(38))
	cg.box(Vector3(0.055, 0.56, 0.014), Transform3D(band_basis, Vector3(0.0, 1.27, -0.146)), LEATHER, CHEST)
	for k in 3:
		cg.box(Vector3(0.062, 0.075, 0.042), X.call(Vector3(-0.07 + 0.07 * k, 1.04, -0.155)), LEATHER * 1.1, SPINE)
		if fine:
			cg.box(Vector3(0.064, 0.016, 0.044), X.call(Vector3(-0.07 + 0.07 * k, 1.075, -0.155)), LEATHER * 0.8, SPINE)
	# --- 배낭 / 장구류
	cg.box(Vector3(0.30, 0.34, 0.13), X.call(Vector3(0, 1.26, 0.2)), LEATHER * 1.25, CHEST)
	cg.rod(Vector3(-0.19, 1.47, 0.2), Vector3(0.19, 1.47, 0.2), 0.062, 0.062, coat2 * 1.3, CHEST, 10)
	cg.cone(0.045, 0.045, 0.1, X.call(Vector3(-0.17, 0.97, 0.15)), coat2 * 0.8, SPINE, 10, true)
	if fine:
		mg.cone(0.065, 0.065, 0.045, X.call(Vector3(0.06, 1.44, 0.2)), STEEL * 2.0, CHEST, 10, true)
		cg.rod(Vector3(-0.16, 1.1, 0.27), Vector3(-0.16, 1.42, 0.27), 0.014, 0.014, WOOD, CHEST, 6)
		mg.box(Vector3(0.1, 0.012, 0.11), X.call(Vector3(-0.16, 1.1, 0.27)), STEEL, CHEST)
		mg.rod(Vector3(0.20, 0.98, 0.0), Vector3(0.22, 0.62, -0.02), 0.012, 0.012, STEEL, HIPS, 5)
	# --- 머리
	cg.cone(0.045, 0.04, 0.1, X.call(Vector3(0, 1.50, 0)), SKIN * 0.9, HEAD, 10, false)
	cg.sphere(0.097, SC.call(Vector3(0, 1.665, 0.0), Vector3(0.9, 1.12, 1.0)), SKIN, HEAD, Vector3.ONE, 9, 14)
	cg.sphere(0.075, SC.call(Vector3(0, 1.625, -0.02), Vector3(0.95, 0.85, 1.0)), SKIN * 0.97, HEAD, Vector3.ONE, 6, 10)
	cg.sphere(0.103, SC.call(Vector3(0, 1.66, 0.025), Vector3(0.94, 1.1, 0.95)), Color(0.04, 0.025, 0.015), HEAD, Vector3.ONE, 6, 10)
	cg.sphere(0.017, SC.call(Vector3(0, 1.648, -0.098), Vector3(0.8, 1.2, 1.5)), SKIN * 1.05, HEAD, Vector3.ONE, 4, 8)
	cg.box(Vector3(0.016, 0.04, 0.026), X.call(Vector3(0, 1.66, -0.092)), SKIN * 1.0, HEAD)
	for sx in [1.0, -1.0]:
		cg.sphere(0.017, SC.call(Vector3(0.092 * sx, 1.655, 0.002), Vector3(0.45, 1.2, 0.85)), SKIN * 0.9, HEAD, Vector3.ONE, 4, 8)
		cg.sphere(0.0155, SC.call(Vector3(0.038 * sx, 1.683, -0.083), Vector3(1.1, 0.75, 0.55)), Color(0.55, 0.52, 0.48), HEAD, Vector3.ONE, 4, 8)
		cg.sphere(0.0085, X.call(Vector3(0.038 * sx, 1.683, -0.0925)), Color(0.02, 0.015, 0.012), HEAD, Vector3.ONE, 4, 6)
		cg.box(Vector3(0.036, 0.009, 0.014), X.call(Vector3(0.04 * sx, 1.704, -0.09)), Color(0.07, 0.04, 0.02), HEAD)
		cg.sphere(0.024, SC.call(Vector3(0.05 * sx, 1.612, -0.07), Vector3(1.0, 0.7, 0.9)), SKIN * 0.88, HEAD, Vector3.ONE, 4, 8)
	cg.box(Vector3(0.05, 0.007, 0.012), X.call(Vector3(0, 1.607, -0.093)), Color(0.28, 0.1, 0.08), HEAD)
	cg.box(Vector3(0.072, 0.017, 0.022), X.call(Vector3(0, 1.625, -0.093)), Color(0.07, 0.04, 0.02), HEAD)
	if team == 0:
		var prof := [Vector2(0.0, 0.14), Vector2(0.065, 0.136), Vector2(0.105, 0.115), Vector2(0.126, 0.082), Vector2(0.131, 0.04), Vector2(0.168, 0.026), Vector2(0.172, 0.018), Vector2(0.12, 0.022)]
		prof.reverse()
		cg.lathe(prof, 18, X.call(Vector3(0, 1.625, 0)), p.helmet, HEAD)
		cg.rod(Vector3(0, 1.755, 0.14), Vector3(0, 1.778, -0.02), 0.01, 0.014, p.helmet * 0.8, HEAD, 6)
		cg.rod(Vector3(0, 1.778, -0.02), Vector3(0, 1.74, -0.125), 0.014, 0.01, p.helmet * 0.8, HEAD, 6)
		mg.box(Vector3(0.026, 0.02, 0.012), X.call(Vector3(0, 1.725, -0.136)), mark, HEAD)
		if fine:
			for sx in [1.0, -1.0]:
				mg.sphere(0.01, X.call(Vector3(0.115 * sx, 1.68, 0.0)), BRASS, HEAD, Vector3.ONE, 3, 6)
				cg.box(Vector3(0.012, 0.1, 0.006), X.call(Vector3(0.1 * sx, 1.585, -0.035)), LEATHER, HEAD)
			cg.box(Vector3(0.12, 0.008, 0.02), X.call(Vector3(0, 1.545, -0.07)), LEATHER, HEAD)
	else:
		cg.cone(0.118, 0.122, 0.07, X.call(Vector3(0, 1.66, 0)), p.helmet, HEAD, 18, false)
		var prof2 := [Vector2(0.0, 0.145), Vector2(0.07, 0.143), Vector2(0.13, 0.124), Vector2(0.138, 0.072), Vector2(0.123, 0.0)]
		prof2.reverse()
		cg.lathe(prof2, 18, X.call(Vector3(0, 1.66, 0)), p.helmet * 1.05, HEAD)
		cg.prism(Vector2(0.17, 0.095), Vector2(0.15, 0.08), 0.014, X.call(Vector3(0, 1.652, -0.135)), LEATHER, HEAD)
		mg.cone(0.02, 0.02, 0.006, Transform3D(Basis(Vector3.RIGHT, -PI * 0.5), Vector3(0, 1.725, -0.136)), mark, HEAD, 10, true)
		cg.box(Vector3(0.126, 0.02, 0.012), X.call(Vector3(0, 1.715, -0.124)), p.mark * 0.55, HEAD)
		if fine:
			cg.box(Vector3(0.12, 0.008, 0.02), X.call(Vector3(0, 1.64, -0.1)), LEATHER, HEAD)
	# --- 팔과 총 (총을 든 자세로 모델링)
	var rifle_xf := Transform3D(Basis(Vector3.UP, deg_to_rad(-2)), Vector3(0.10, 1.335, -0.20))
	var s_r := Vector3(0.21, 1.43, 0.0)
	var e_r := GLOBAL[LAR] as Vector3
	var h_r := rifle_xf * Vector3(0.0, -0.05, 0.03)
	var s_l := Vector3(-0.21, 1.43, 0.0)
	var e_l := GLOBAL[LAL] as Vector3
	var h_l := rifle_xf * Vector3(0.0, -0.045, -0.47)
	cg.sphere(0.064, X.call(s_r), coat, UAR)
	cg.limb(s_r, e_r, 0.057, 0.048, coat, UAR)
	cg.sphere(0.05, X.call(e_r), coat, LAR)
	cg.limb(e_r, h_r, 0.047, 0.04, coat, LAR)
	cg.sphere(0.042, SC.call(h_r, Vector3(1.0, 0.9, 1.3)), glove, LAR)
	cg.sphere(0.064, X.call(s_l), coat, UAL)
	cg.limb(s_l, e_l, 0.057, 0.048, coat, UAL)
	cg.sphere(0.05, X.call(e_l), coat, LAL)
	cg.limb(e_l, h_l, 0.047, 0.04, coat, LAL)
	cg.sphere(0.042, SC.call(h_l, Vector3(1.0, 0.9, 1.3)), glove, LAL)
	# 소매 끝단과 팀 완장(멀리서도 팀 식별)
	cg.cone(0.05, 0.05, 0.03, Transform3D(cg._basis_y(h_r - e_r), h_r - (h_r - e_r).normalized() * 0.09), coat2 * 0.8, LAR, 10, false)
	cg.cone(0.05, 0.05, 0.03, Transform3D(cg._basis_y(h_l - e_l), h_l - (h_l - e_l).normalized() * 0.09), coat2 * 0.8, LAL, 10, false)
	var arm_dir := (e_l - s_l).normalized()
	cg.cone(0.064, 0.064, 0.07, Transform3D(cg._basis_y(arm_dir), s_l + arm_dir * 0.11), mark * 0.9, UAL, 12, false)
	_weapon(cg, mg, weapon, rifle_xf, CHEST)
	var mesh := ArrayMesh.new()
	cg.commit_to(mesh, Geo.mat_cloth_shader())
	mg.commit_to(mesh, Geo.mat_gear())
	Geo.lod = 1.0
	_mesh_cache[key] = mesh
	return mesh


# ---------------------------------------------------------------- 애니메이션

static func new_state() -> Dictionary:
	return {"phase": randf() * TAU, "amp": 0.0, "pitch": 0.0}


static func animate(sk: Skeleton3D, st: Dictionary, speed: float, dt: float, pitch: float, airborne: bool, strafe: float) -> void:
	var target_amp := clampf(speed / 4.6, 0.0, 1.3)
	st.amp = lerpf(st.amp, target_amp, minf(1.0, dt * 10.0))
	var amp: float = st.amp
	st.phase += dt * (3.0 + speed * 1.55)
	st.pitch = lerpf(st.pitch, pitch, minf(1.0, dt * 12.0))
	var ph: float = st.phase
	var s := sin(ph)
	var s2 := sin(ph + PI)
	var swing := 0.62 * amp
	var tr := s * swing
	var tl := s2 * swing
	var kr := maxf(0.0, sin(ph + 1.9)) * 0.95 * amp
	var kl := maxf(0.0, sin(ph + 1.9 + PI)) * 0.95 * amp
	if airborne:
		tr = 0.5
		tl = -0.2
		kr = 0.8
		kl = 0.3
	var qx := func(a: float) -> Quaternion: return Quaternion(Vector3.RIGHT, a)
	var qy := func(a: float) -> Quaternion: return Quaternion(Vector3.UP, a)
	var qz := func(a: float) -> Quaternion: return Quaternion(Vector3.BACK, a)
	sk.set_bone_pose_rotation(THR, qx.call(tr))
	sk.set_bone_pose_rotation(THL, qx.call(tl))
	sk.set_bone_pose_rotation(SHR, qx.call(-kr))
	sk.set_bone_pose_rotation(SHL, qx.call(-kl))
	sk.set_bone_pose_rotation(FTR, qx.call(kr * 0.25 - tr * 0.25))
	sk.set_bone_pose_rotation(FTL, qx.call(kl * 0.25 - tl * 0.25))
	sk.set_bone_pose_position(HIPS, rest_local(HIPS) + Vector3(0, -0.012 * amp - absf(s) * 0.035 * amp, 0))
	sk.set_bone_pose_rotation(HIPS, qy.call(s * 0.09 * amp) * qz.call(s * 0.03 * amp))
	var lean := -0.07 * amp
	sk.set_bone_pose_rotation(CHEST, qx.call(lean + st.pitch * 0.55) * qy.call(-s * 0.07 * amp + strafe * 0.18))
	sk.set_bone_pose_rotation(HEAD, qx.call(st.pitch * 0.4 - lean * 0.5))


static func death_pose(sk: Skeleton3D) -> void:
	sk.set_bone_pose_rotation(THR, Quaternion(Vector3.RIGHT, 0.5))
	sk.set_bone_pose_rotation(THL, Quaternion(Vector3.RIGHT, -0.2))
	sk.set_bone_pose_rotation(SHR, Quaternion(Vector3.RIGHT, -0.7))
	sk.set_bone_pose_rotation(SHL, Quaternion(Vector3.RIGHT, -0.4))


# ---------------------------------------------------------------- 1인칭 총과 팔

static func viewmodel_mesh(weapon: int) -> ArrayMesh:
	var key := 100 + weapon
	if _mesh_cache.has(key):
		return _mesh_cache[key]
	var cg := Geo.new()
	var mg := Geo.new()
	var coat: Color = TEAM[0].coat
	_weapon(cg, mg, weapon, Transform3D.IDENTITY, 0)
	# 오른손(그립)과 소매
	var hr := Vector3(0.0, -0.05, 0.03)
	cg.sphere(0.036, Geo.xf_at(hr), SKIN, 0, Vector3(1.0, 0.9, 1.2))
	cg.limb(hr + Vector3(0.0, -0.01, 0.04), Vector3(0.10, -0.26, 0.40), 0.04, 0.05, coat, 0)
	# 왼손(받침)과 소매
	var hl := Vector3(-0.005, -0.048, -0.47)
	cg.sphere(0.04, Geo.xf_at(hl), SKIN, 0, Vector3(1.0, 0.85, 1.3))
	cg.limb(hl + Vector3(-0.01, -0.01, 0.05), Vector3(-0.17, -0.20, -0.08), 0.043, 0.05, coat, 0)
	var mesh := ArrayMesh.new()
	cg.commit_to(mesh, Geo.mat_cloth())
	mg.commit_to(mesh, Geo.mat_gear())
	_mesh_cache[key] = mesh
	return mesh
