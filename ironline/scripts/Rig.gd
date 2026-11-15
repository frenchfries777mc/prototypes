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
	var I := Transform3D.IDENTITY
	var coat: Color = p.coat
	var coat2: Color = p.coat2
	var pants: Color = p.pants
	# --- 다리
	for side in [1.0, -1.0]:
		var th: int = THR if side > 0 else THL
		var sh: int = SHR if side > 0 else SHL
		var ft: int = FTR if side > 0 else FTL
		var x: float = 0.10 * side
		cg.limb(Vector3(x, 0.92, 0), Vector3(x, 0.50, 0.0), 0.088, 0.066, pants, th)
		cg.limb(Vector3(x, 0.50, 0.0), Vector3(x, 0.14, 0.0), 0.064, 0.05, pants, sh)
		# 각반(puttee)
		for k in 5:
			var y := 0.17 + 0.062 * k
			cg.cone(0.057 - 0.0016 * k, 0.057 - 0.0016 * k, 0.045, Transform3D(Basis.IDENTITY, Vector3(x, y, 0)), p.wrap, sh, 10, false)
		# 군화
		cg.prism(Vector2(0.115, 0.30), Vector2(0.10, 0.25), 0.085, Transform3D(Basis.IDENTITY, Vector3(x, 0.0, -0.045)), LEATHER * 0.8, ft)
		cg.prism(Vector2(0.10, 0.12), Vector2(0.085, 0.10), 0.09, Transform3D(Basis.IDENTITY, Vector3(x, 0.04, 0.025)), LEATHER, ft)
		mg.box(Vector3(0.12, 0.018, 0.31), Geo.xf_at(Vector3(x, 0.009, -0.045)), Color(0.04, 0.035, 0.03), ft)
	# --- 골반, 외투 자락, 허리띠
	cg.prism(Vector2(0.34, 0.21), Vector2(0.33, 0.20), 0.14, Geo.xf_at(Vector3(0, 0.84, 0)), pants, HIPS)
	cg.prism(Vector2(0.42, 0.28), Vector2(0.35, 0.215), 0.31, Geo.xf_at(Vector3(0, 0.62, 0)), coat2, HIPS)
	cg.box(Vector3(0.355, 0.05, 0.225), Geo.xf_at(Vector3(0, 0.985, 0)), LEATHER, SPINE)
	mg.box(Vector3(0.05, 0.04, 0.012), Geo.xf_at(Vector3(0, 0.985, -0.115)), BRASS, SPINE)
	# --- 몸통
	cg.prism(Vector2(0.335, 0.205), Vector2(0.37, 0.215), 0.22, Geo.xf_at(Vector3(0, 1.01, 0)), coat, SPINE)
	cg.prism(Vector2(0.37, 0.215), Vector2(0.43, 0.235), 0.27, Geo.xf_at(Vector3(0, 1.22, 0)), coat, CHEST)
	cg.prism(Vector2(0.43, 0.235), Vector2(0.20, 0.17), 0.045, Geo.xf_at(Vector3(0, 1.49, 0)), coat, CHEST)
	cg.cone(0.075, 0.062, 0.05, Geo.xf_at(Vector3(0, 1.50, 0)), coat2, CHEST, 12, false)
	# 단추 줄과 주머니
	for k in 5:
		mg.sphere(0.008, Geo.xf_at(Vector3(0, 1.08 + 0.095 * k, -0.114 - 0.002 * k)), BRASS, CHEST, Vector3.ONE, 4, 6)
	cg.box(Vector3(0.085, 0.09, 0.025), Geo.xf_at(Vector3(0.11, 1.20, -0.118)), coat2 * 0.85, CHEST)
	cg.box(Vector3(0.085, 0.09, 0.025), Geo.xf_at(Vector3(-0.11, 1.20, -0.118)), coat2 * 0.85, CHEST)
	# 탄띠(어깨에서 허리로 사선)와 탄약 주머니
	var band_basis := Basis(Vector3(0, 0, 1), deg_to_rad(38))
	cg.box(Vector3(0.055, 0.56, 0.014), Transform3D(band_basis, Vector3(0.0, 1.27, -0.122)), LEATHER, CHEST)
	for k in 3:
		cg.box(Vector3(0.062, 0.07, 0.04), Geo.xf_at(Vector3(-0.07 + 0.07 * k, 1.04, -0.13)), LEATHER * 1.1, SPINE)
	# --- 배낭, 담요 말이, 수통
	cg.box(Vector3(0.30, 0.34, 0.13), Geo.xf_at(Vector3(0, 1.26, 0.18)), LEATHER * 1.25, CHEST)
	cg.rod(Vector3(-0.19, 1.47, 0.18), Vector3(0.19, 1.47, 0.18), 0.062, 0.062, coat2 * 1.3, CHEST, 10)
	cg.cone(0.045, 0.045, 0.1, Geo.xf_at(Vector3(-0.17, 0.97, 0.13)), coat2 * 0.8, SPINE, 10, true)
	# --- 머리
	cg.cone(0.045, 0.04, 0.1, Geo.xf_at(Vector3(0, 1.50, 0)), SKIN * 0.95, HEAD, 10, false)
	cg.sphere(0.103, Geo.xf_at(Vector3(0, 1.655, 0.0)), SKIN, HEAD, Vector3(0.92, 1.1, 1.0), 9, 14)
	cg.box(Vector3(0.024, 0.045, 0.034), Geo.xf_at(Vector3(0, 1.645, -0.105)), SKIN * 0.95, HEAD)
	for sx in [1.0, -1.0]:
		cg.sphere(0.017, Geo.xf_at(Vector3(0.095 * sx, 1.655, 0.0)), SKIN * 0.9, HEAD, Vector3(0.5, 1.2, 0.9), 5, 8)
		cg.box(Vector3(0.026, 0.012, 0.012), Geo.xf_at(Vector3(0.04 * sx, 1.685, -0.097)), Color(0.02, 0.015, 0.012), HEAD)
		cg.box(Vector3(0.034, 0.008, 0.012), Geo.xf_at(Vector3(0.042 * sx, 1.705, -0.095)), Color(0.07, 0.04, 0.02), HEAD)
	cg.box(Vector3(0.07, 0.016, 0.02), Geo.xf_at(Vector3(0, 1.617, -0.098)), Color(0.07, 0.04, 0.02), HEAD)
	if team == 0:
		# 철모: 돔 + 챙
		var prof := [Vector2(0.0, 0.135), Vector2(0.06, 0.131), Vector2(0.10, 0.112), Vector2(0.123, 0.08),
			Vector2(0.128, 0.04), Vector2(0.165, 0.03), Vector2(0.168, 0.022), Vector2(0.118, 0.026)]
		prof.reverse()
		cg.lathe(prof, 16, Geo.xf_at(Vector3(0, 1.62, 0)), p.helmet, HEAD)
		cg.box(Vector3(0.02, 0.014, 0.025), Geo.xf_at(Vector3(0, 1.738, -0.12)), p.mark, HEAD)
		cg.box(Vector3(0.012, 0.09, 0.006), Geo.xf_at(Vector3(0.1, 1.58, -0.04)), LEATHER, HEAD)
		cg.box(Vector3(0.012, 0.09, 0.006), Geo.xf_at(Vector3(-0.1, 1.58, -0.04)), LEATHER, HEAD)
	else:
		# 챙 있는 군모
		cg.cone(0.118, 0.122, 0.07, Geo.xf_at(Vector3(0, 1.655, 0)), p.helmet, HEAD, 16, false)
		var prof2 := [Vector2(0.0, 0.14), Vector2(0.07, 0.138), Vector2(0.13, 0.12), Vector2(0.135, 0.07), Vector2(0.12, 0.0)]
		prof2.reverse()
		cg.lathe(prof2, 16, Geo.xf_at(Vector3(0, 1.655, 0)), p.helmet * 1.05, HEAD)
		cg.prism(Vector2(0.17, 0.09), Vector2(0.15, 0.08), 0.014, Geo.xf_at(Vector3(0, 1.648, -0.13)), LEATHER, HEAD)
		cg.box(Vector3(0.126, 0.02, 0.012), Geo.xf_at(Vector3(0, 1.712, -0.12)), p.mark, HEAD)
	# --- 팔과 총 (총을 든 자세로 모델링)
	var rifle_xf := Transform3D(Basis(Vector3.UP, deg_to_rad(-2)), Vector3(0.10, 1.335, -0.20))
	var s_r := Vector3(0.21, 1.43, 0.0)
	var e_r := GLOBAL[LAR] as Vector3
	var h_r := rifle_xf * Vector3(0.0, -0.05, 0.03)
	var s_l := Vector3(-0.21, 1.43, 0.0)
	var e_l := GLOBAL[LAL] as Vector3
	var h_l := rifle_xf * Vector3(0.0, -0.045, -0.47)
	cg.sphere(0.062, Geo.xf_at(s_r), coat, UAR)
	cg.limb(s_r, e_r, 0.056, 0.048, coat, UAR)
	cg.limb(e_r, h_r, 0.047, 0.04, coat, LAR)
	cg.sphere(0.04, Geo.xf_at(h_r), SKIN, LAR)
	cg.sphere(0.062, Geo.xf_at(s_l), coat, UAL)
	cg.limb(s_l, e_l, 0.056, 0.048, coat, UAL)
	cg.limb(e_l, h_l, 0.047, 0.04, coat, LAL)
	cg.sphere(0.04, Geo.xf_at(h_l), SKIN, LAL)
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
