class_name ModelLib
extends RefCounted
## CC0 모델(Poly Haven) 로더. glTF 를 한 번만 읽어 캐시하고, 박스 크기에 맞춰 배치한다.

static var _scenes := {}
static var _bounds := {}


## CC0 모델이 프로젝트에 들어 있는지.
static func available() -> bool:
	return ResourceLoader.exists("res://assets/models/barrel_03/barrel_03.gltf")


static func scene(name: String) -> PackedScene:
	if not _scenes.has(name):
		var path := "res://assets/models/%s/%s.gltf" % [name, name]
		if name.contains("/"):
			# 한 폴더에 .glb 여러 개를 모아 둔 팩(예: "kenney/tree_oak")
			path = "res://assets/models/%s.glb" % name
		elif not ResourceLoader.exists(path):
			path = "res://assets/models/%s/%s.glb" % [name, name]
		_scenes[name] = load(path) if ResourceLoader.exists(path) else null
	return _scenes[name]


static func _collect(n: Node, xf: Transform3D, out: Array) -> void:
	var t := xf
	if n is Node3D:
		t = xf * (n as Node3D).transform
	if n is MeshInstance3D and (n as MeshInstance3D).mesh != null:
		out.append(t * (n as MeshInstance3D).get_aabb())
	for c in n.get_children():
		_collect(c, t, out)


## 모델 로컬 좌표계의 전체 경계 상자.
static func bounds(name: String) -> AABB:
	if _bounds.has(name):
		return _bounds[name]
	var ps := scene(name)
	var bb := AABB()
	if ps != null:
		var inst := ps.instantiate()
		var boxes: Array = []
		_collect(inst, Transform3D.IDENTITY, boxes)
		inst.free()
		var first := true
		for b in boxes:
			bb = b if first else bb.merge(b)
			first = false
	_bounds[name] = bb
	return bb


## 모델을 만들어 base(바닥 중심)에 놓는다. height>0 이면 그 높이로, 아니면 scale 로 균일 배율.
static func make(name: String, base: Vector3, yaw: float, height: float = 0.0, scale: float = 1.0, far: float = 220.0) -> Node3D:
	var ps := scene(name)
	if ps == null:
		return null
	var bb := bounds(name)
	var s := scale
	if height > 0.0 and bb.size.y > 0.001:
		s = height / bb.size.y
	var root := Node3D.new()
	var inst := ps.instantiate() as Node3D
	# 경계 상자의 바닥 중심이 원점이 되도록 보정
	var c := bb.position + Vector3(bb.size.x * 0.5, 0.0, bb.size.z * 0.5)
	inst.position = -c
	root.add_child(inst)
	root.scale = Vector3.ONE * s
	root.position = base
	root.rotation.y = yaw
	_apply_range(root, far)
	return root


## 모델의 메시를 (변환 포함) 모아 돌려준다: [{"mesh": Mesh, "xf": Transform3D}]
static func mesh_parts(name: String) -> Array:
	var out: Array = []
	var ps := scene(name)
	if ps == null:
		return out
	var inst := ps.instantiate()
	_collect_meshes(inst, Transform3D.IDENTITY, out)
	inst.free()
	return out


static func _collect_meshes(n: Node, xf: Transform3D, out: Array) -> void:
	var t := xf
	if n is Node3D:
		t = xf * (n as Node3D).transform
	if n is MeshInstance3D and (n as MeshInstance3D).mesh != null:
		out.append({"mesh": (n as MeshInstance3D).mesh, "xf": t})
	for c in n.get_children():
		_collect_meshes(c, t, out)


static func _apply_range(n: Node, far: float) -> void:
	if n is GeometryInstance3D:
		(n as GeometryInstance3D).visibility_range_end = far
		(n as GeometryInstance3D).visibility_range_end_margin = 20.0
	for c in n.get_children():
		_apply_range(c, far)


## 모델의 모든 표면 재질에 색을 곱한다(원본 재질은 건드리지 않고 복제본에만 적용).
static func tint(n: Node, col: Color) -> void:
	if n is MeshInstance3D:
		var mi := n as MeshInstance3D
		for i in mi.get_surface_override_material_count():
			var m := mi.get_active_material(i)
			if m is StandardMaterial3D:
				var d := (m as StandardMaterial3D).duplicate() as StandardMaterial3D
				d.albedo_color = d.albedo_color * col
				mi.set_surface_override_material(i, d)
	for c in n.get_children():
		tint(c, col)
