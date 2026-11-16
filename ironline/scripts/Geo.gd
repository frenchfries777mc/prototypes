class_name Geo
extends RefCounted
## 절차적 메시 조립기. 상자·선반(lathe) 곡면·캡슐 팔다리를 부위별 색/뼈 번호와 함께 한 메시로 합친다.
## 삼각형 감김 방향은 정점 법선과 비교해 자동으로 맞춘다(Godot 은 시계 방향이 앞면).

var v := PackedVector3Array()
var n := PackedVector3Array()
var c := PackedColorArray()
var idx := PackedInt32Array()
var bones := PackedInt32Array()
var weights := PackedFloat32Array()
var skinned := false
static var lod := 1.0


func _add(p: Vector3, nr: Vector3, col: Color, bone: int) -> int:
	v.append(p)
	n.append(nr.normalized())
	c.append(col)
	if skinned:
		bones.append(bone)
		bones.append(0)
		bones.append(0)
		bones.append(0)
		weights.append(1.0)
		weights.append(0.0)
		weights.append(0.0)
		weights.append(0.0)
	return v.size() - 1


func _tri(a: int, b: int, d: int) -> void:
	var g := (v[b] - v[a]).cross(v[d] - v[a])
	var avg := n[a] + n[b] + n[d]
	if g.dot(avg) > 0.0:
		idx.append(a)
		idx.append(d)
		idx.append(b)
	else:
		idx.append(a)
		idx.append(b)
		idx.append(d)


func _face(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, center: Vector3, xf: Transform3D,
		col: Color, bone: int) -> void:
	var nr := (p1 - p0).cross(p3 - p0)
	if nr.length_squared() < 1e-12:
		nr = (p2 - p1).cross(p0 - p1)
	nr = nr.normalized()
	var fc := (p0 + p1 + p2 + p3) * 0.25
	if nr.dot(fc - center) < 0.0:
		nr = -nr
	var wn := xf.basis * nr
	var i0 := _add(xf * p0, wn, col, bone)
	var i1 := _add(xf * p1, wn, col, bone)
	var i2 := _add(xf * p2, wn, col, bone)
	var i3 := _add(xf * p3, wn, col, bone)
	_tri(i0, i1, i2)
	_tri(i0, i2, i3)


## 아래(y0)와 위(y1) 가로·세로가 다른 각기둥. center=true 면 y 가 -h/2 ~ h/2.
func prism(bsz: Vector2, tsz: Vector2, h: float, xf: Transform3D, col: Color, bone: int = 0,
		center: bool = false, top_off: Vector2 = Vector2.ZERO) -> void:
	var y0 := -h * 0.5 if center else 0.0
	var y1 := y0 + h
	var b0 := Vector3(-bsz.x * 0.5, y0, -bsz.y * 0.5)
	var b1 := Vector3(bsz.x * 0.5, y0, -bsz.y * 0.5)
	var b2 := Vector3(bsz.x * 0.5, y0, bsz.y * 0.5)
	var b3 := Vector3(-bsz.x * 0.5, y0, bsz.y * 0.5)
	var t0 := Vector3(-tsz.x * 0.5 + top_off.x, y1, -tsz.y * 0.5 + top_off.y)
	var t1 := Vector3(tsz.x * 0.5 + top_off.x, y1, -tsz.y * 0.5 + top_off.y)
	var t2 := Vector3(tsz.x * 0.5 + top_off.x, y1, tsz.y * 0.5 + top_off.y)
	var t3 := Vector3(-tsz.x * 0.5 + top_off.x, y1, tsz.y * 0.5 + top_off.y)
	var ctr := Vector3(top_off.x * 0.5, (y0 + y1) * 0.5, top_off.y * 0.5)
	_face(b0, b1, t1, t0, ctr, xf, col, bone)
	_face(b1, b2, t2, t1, ctr, xf, col, bone)
	_face(b2, b3, t3, t2, ctr, xf, col, bone)
	_face(b3, b0, t0, t3, ctr, xf, col, bone)
	_face(t0, t1, t2, t3, ctr, xf, col, bone)
	_face(b0, b1, b2, b3, ctr, xf, col, bone)


func box(size: Vector3, xf: Transform3D, col: Color, bone: int = 0) -> void:
	prism(Vector2(size.x, size.z), Vector2(size.x, size.z), size.y, xf, col, bone, true)


## 프로파일(반지름, y)을 Y 축으로 회전시킨 곡면. 법선은 프로파일 접선에서 구한다.
func lathe(profile: Array, segs: int, xf: Transform3D, col: Color, bone: int = 0) -> void:
	segs = maxi(5, int(round(segs * lod)))
	var nb := xf.basis.inverse().transposed()
	var rings: Array = []
	var m := profile.size()
	for i in m:
		var p: Vector2 = profile[i]
		var a: Vector2 = profile[maxi(i - 1, 0)]
		var b: Vector2 = profile[mini(i + 1, m - 1)]
		var tg := b - a
		var nr2 := Vector2(tg.y, -tg.x)
		if nr2.length_squared() < 1e-12:
			nr2 = Vector2(0, 1)
		nr2 = nr2.normalized()
		var ring: Array = []
		for s in segs + 1:
			var ang := TAU * float(s) / segs
			var ca := cos(ang)
			var sa := sin(ang)
			var pos := Vector3(p.x * ca, p.y, p.x * sa)
			var nrm := Vector3(nr2.x * ca, nr2.y, nr2.x * sa)
			ring.append(_add(xf * pos, nb * nrm, col, bone))
		rings.append(ring)
	for i in m - 1:
		var r0: Array = rings[i]
		var r1: Array = rings[i + 1]
		for s in segs:
			var pa: Vector2 = profile[i]
			var pb: Vector2 = profile[i + 1]
			if pa.x < 1e-5 and pb.x < 1e-5:
				continue
			if pa.x < 1e-5:
				_tri(r0[s], r1[s], r1[s + 1])
			elif pb.x < 1e-5:
				_tri(r0[s], r1[s], r0[s + 1])
			else:
				_tri(r0[s], r1[s], r1[s + 1])
				_tri(r0[s], r1[s + 1], r0[s + 1])


func sphere(r: float, xf: Transform3D, col: Color, bone: int = 0, scale: Vector3 = Vector3.ONE,
		rings: int = 8, segs: int = 14) -> void:
	rings = maxi(3, int(round(rings * lod)))
	var prof: Array = []
	for i in rings + 1:
		var a := -PI * 0.5 + PI * float(i) / rings
		prof.append(Vector2(cos(a) * r, sin(a) * r))
	var x2 := Transform3D(xf.basis * Basis.from_scale(scale), xf.origin)
	lathe(prof, segs, x2, col, bone)


## Y 축 방향 원뿔대(양 끝 평평). r0=아래, r1=위.
func cone(r0: float, r1: float, h: float, xf: Transform3D, col: Color, bone: int = 0, segs: int = 12,
		capped: bool = true) -> void:
	var prof: Array = []
	if capped:
		prof.append(Vector2(0.0, 0.0))
	prof.append(Vector2(r0, 0.0))
	prof.append(Vector2(r1, h))
	if capped:
		prof.append(Vector2(0.0, h))
	lathe(prof, segs, xf, col, bone)


func _basis_y(dir: Vector3) -> Basis:
	var y := dir.normalized()
	var ref := Vector3.RIGHT if absf(y.x) < 0.9 else Vector3.FORWARD
	var x := y.cross(ref).normalized()
	var z := x.cross(y).normalized()
	return Basis(x, y, z)


## 두 점을 잇는 둥근 팔다리(캡슐). r0 는 p0 쪽, r1 은 p1 쪽 반지름.
func limb(p0: Vector3, p1: Vector3, r0: float, r1: float, col: Color, bone: int = 0, segs: int = 10) -> void:
	var d := p1 - p0
	var len := d.length()
	if len < 1e-4:
		return
	var prof: Array = []
	var cap := 4 if lod >= 1.0 else 2
	for i in cap + 1:
		var a := -PI * 0.5 + (PI * 0.5) * float(i) / cap
		prof.append(Vector2(cos(a) * r0, sin(a) * r0))
	for i in cap + 1:
		var a := (PI * 0.5) * float(i) / cap
		prof.append(Vector2(cos(a) * r1, len + sin(a) * r1))
	lathe(prof, segs, Transform3D(_basis_y(d), p0), col, bone)


## 두 점 사이 원통(끝 평평).
func rod(p0: Vector3, p1: Vector3, r0: float, r1: float, col: Color, bone: int = 0, segs: int = 8) -> void:
	var d := p1 - p0
	if d.length() < 1e-4:
		return
	cone(r0, r1, d.length(), Transform3D(_basis_y(d), p0), col, bone, segs, true)


func commit_to(mesh: ArrayMesh, mat: Material) -> void:
	if v.size() == 0:
		return
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = v
	arr[Mesh.ARRAY_NORMAL] = n
	arr[Mesh.ARRAY_COLOR] = c
	arr[Mesh.ARRAY_INDEX] = idx
	if skinned:
		arr[Mesh.ARRAY_BONES] = bones
		arr[Mesh.ARRAY_WEIGHTS] = weights
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	mesh.surface_set_material(mesh.get_surface_count() - 1, mat)


static func xf_at(pos: Vector3) -> Transform3D:
	return Transform3D(Basis.IDENTITY, pos)


static func mat_cloth() -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.roughness = 0.92
	m.metallic = 0.0
	m.metallic_specular = 0.25
	return m


static func mat_gear() -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.roughness = 0.42
	m.metallic = 0.55
	return m


static var _cloth_sm: ShaderMaterial = null

static func mat_cloth_shader() -> ShaderMaterial:
	if _cloth_sm == null:
		_cloth_sm = ShaderMaterial.new()
		_cloth_sm.shader = load("res://shaders/cloth.gdshader")
	return _cloth_sm


static var _cloth_clean: ShaderMaterial = null
static var _wood_sm: ShaderMaterial = null
static var _steel: StandardMaterial3D = null

static func mat_cloth_clean() -> ShaderMaterial:
	if _cloth_clean == null:
		_cloth_clean = ShaderMaterial.new()
		_cloth_clean.shader = load("res://shaders/cloth.gdshader")
		_cloth_clean.set_shader_parameter("dirt_amount", 0.0)
	return _cloth_clean


static func mat_wood() -> ShaderMaterial:
	if _wood_sm == null:
		_wood_sm = ShaderMaterial.new()
		_wood_sm.shader = load("res://shaders/wood.gdshader")
	return _wood_sm


static func mat_steel() -> StandardMaterial3D:
	if _steel == null:
		_steel = StandardMaterial3D.new()
		_steel.vertex_color_use_as_albedo = true
		_steel.roughness = 0.33
		_steel.metallic = 0.72
		_steel.metallic_specular = 0.6
	return _steel
