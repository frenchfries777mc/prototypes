class_name View
extends Node3D
## 시뮬레이션 상태를 3D 장면으로 그린다. 시뮬레이션은 읽기만 한다.
## 병사 100명은 팀별 MultiMesh 하나로 그려 드로콜을 최소화한다.

const FOG_COLOR := Color(0.70, 0.71, 0.68)

var sim: Sim
var cam: Camera3D
var mmesh := []
var slot := {}
var walk_t := PackedFloat32Array()
var flag_mesh_n: ArrayMesh
var flag_mesh_a: ArrayMesh
var flag_mesh_b: ArrayMesh
var flag_nodes: Array = []
var ring_nodes: Array = []
var fill_nodes: Array = []
var tracer_im := ImmediateMesh.new()
var tracers: Array = []
var vm: MeshInstance3D
var vm_weapon := -1
var flash: MeshInstance3D
var flash_t := 0.0
var kick := 0.0
var bob := 0.0
var cam_pos := Vector3.ZERO
var debug_3p := false
var use_mm := true
var unit_nodes: Array = []


func setup(s: Sim) -> void:
	sim = s
	_build_env()
	_build_terrain()
	_build_props()
	_build_points()
	_build_units()
	_build_camera()
	_build_tracers()


func _build_env() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = FOG_COLOR
	env.fog_enabled = true
	env.fog_light_color = FOG_COLOR
	env.fog_density = 0.0075
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)


func _terrain_color(x: float, z: float, n: Vector3, h: float, salt: int) -> Color:
	var grass := Color(0.38, 0.43, 0.22)
	var dry := Color(0.55, 0.50, 0.30)
	var mud := Color(0.34, 0.27, 0.19)
	var k := VoxelModel.hash3(int(x * 0.5), int(z * 0.5), salt)
	var col := grass.lerp(dry, clampf(0.15 + k * 0.55 + h * 0.03, 0.0, 1.0))
	if h < -0.9:
		col = col.lerp(mud, clampf((-0.9 - h) * 0.9 + 0.35, 0.0, 1.0))
	for i in 5:
		var d := Vector2(x - World.POINT_X[i], z - World.POINT_Z[i]).length()
		if d < World.POINT_R + 3.0:
			col = col.lerp(Color(0.50, 0.42, 0.29), 0.55 * (1.0 - smoothstep(World.POINT_R - 4.0, World.POINT_R + 3.0, d)))
	var light := Vector3(0.45, 0.8, 0.3).normalized()
	var shade := 0.72 + 0.42 * maxf(0.0, n.dot(light))
	var jit := 1.0 + (VoxelModel.hash3(int(x), int(z), salt + 9) - 0.5) * 0.14
	return VoxelModel.tint(col, shade * jit)


func _build_terrain() -> void:
	var w := sim.world
	var verts := PackedVector3Array()
	var cols := PackedColorArray()
	for j in w.gh - 1:
		for i in w.gw - 1:
			var x0 := w.gx0 + i * World.GRID
			var z0 := w.gz0 + j * World.GRID
			var x1 := x0 + World.GRID
			var z1 := z0 + World.GRID
			var h00: float = w.hmap[j * w.gw + i]
			var h10: float = w.hmap[j * w.gw + i + 1]
			var h01: float = w.hmap[(j + 1) * w.gw + i]
			var h11: float = w.hmap[(j + 1) * w.gw + i + 1]
			var p00 := Vector3(x0, h00, z0)
			var p10 := Vector3(x1, h10, z0)
			var p01 := Vector3(x0, h01, z1)
			var p11 := Vector3(x1, h11, z1)
			var n1 := (p01 - p00).cross(p11 - p00).normalized()
			var n2 := (p11 - p00).cross(p10 - p00).normalized()
			var hm := (h00 + h10 + h01 + h11) * 0.25
			var c1 := _terrain_color(x0, z0, n1.abs() if n1.y < 0.0 else n1, hm, 1)
			var c2 := _terrain_color(x1, z1, n2.abs() if n2.y < 0.0 else n2, hm, 2)
			verts.append_array([p00, p01, p11, p00, p11, p10])
			for k in 3:
				cols.append(c1)
			for k in 3:
				cols.append(c2)
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_COLOR] = cols
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	m.surface_set_material(0, VoxelModel.material())
	var mi := MeshInstance3D.new()
	mi.mesh = m
	mi.name = "Terrain"
	add_child(mi)


func _build_props() -> void:
	var v := VoxelModel.new()
	var colors := [Color(0.60, 0.58, 0.53), Color(0.64, 0.56, 0.38), Color(0.52, 0.38, 0.22), Color(0.43, 0.31, 0.21)]
	var n := 0
	for b in sim.world.boxes:
		var kind: int = b.kind
		v.box_faces(b.mn, b.mx, colors[kind], 0.3, 0.12, true, n)
		n += 1
	var mi := MeshInstance3D.new()
	mi.mesh = v.commit()
	mi.name = "Props"
	add_child(mi)


func _circle_mesh(radius: float, follow_ground: bool, y_off: float) -> ArrayMesh:
	var verts := PackedVector3Array()
	var cols := PackedColorArray()
	var segs := 72
	for i in segs + 1:
		var a := TAU * float(i) / segs
		var x := cos(a) * radius
		var z := sin(a) * radius
		var y := y_off
		verts.append(Vector3(x, y, z))
		cols.append(Color.WHITE)
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_COLOR] = cols
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_LINE_STRIP, arr)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.vertex_color_use_as_albedo = true
	m.surface_set_material(0, mat)
	return m


func _build_points() -> void:
	flag_mesh_n = Models.flag(Color("#9a9a9a"))
	flag_mesh_a = Models.flag(Models.PALETTE[0].flag)
	flag_mesh_b = Models.flag(Models.PALETTE[1].flag)
	for i in Sim.NPOINTS:
		var p: Sim.Pt = sim.pts[i]
		var f := MeshInstance3D.new()
		f.mesh = flag_mesh_n
		f.position = p.pos
		add_child(f)
		flag_nodes.append(f)
		var ring := MeshInstance3D.new()
		ring.mesh = _circle_mesh(World.POINT_R, false, 0.0)
		ring.position = p.pos + Vector3(0, 0.35, 0)
		add_child(ring)
		ring_nodes.append(ring)
		var fill := MeshInstance3D.new()
		fill.mesh = _circle_mesh(1.0, false, 0.0)
		fill.position = p.pos + Vector3(0, 0.4, 0)
		add_child(fill)
		fill_nodes.append(fill)


func _build_units() -> void:
	var counts := [0, 0]
	for u in sim.units:
		slot[u.id] = counts[u.team]
		counts[u.team] += 1
	walk_t.resize(sim.units.size())
	if not use_mm:
		var meshes := [Models.soldier(0), Models.soldier(1)]
		for u in sim.units:
			var mi := MeshInstance3D.new()
			mi.mesh = meshes[u.team]
			mi.visible = false
			add_child(mi)
			unit_nodes.append(mi)
		return
	for t in 2:
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = Models.soldier(t)
		mm.instance_count = counts[t]
		mm.custom_aabb = AABB(Vector3(-300, -10, -200), Vector3(600, 40, 400))
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		mmi.name = "Soldiers%d" % t
		add_child(mmi)
		mmesh.append(mm)
		for i in counts[t]:
			mm.set_instance_transform(i, Transform3D(Basis.from_scale(Vector3.ZERO), Vector3.ZERO))


func _build_camera() -> void:
	cam = Camera3D.new()
	cam.fov = 72.0
	cam.near = 0.05
	cam.far = 420.0
	cam.current = true
	add_child(cam)
	vm = MeshInstance3D.new()
	cam.add_child(vm)
	var fm := BoxMesh.new()
	fm.size = Vector3(0.16, 0.16, 0.05)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(1.0, 0.86, 0.45)
	fm.material = mat
	flash = MeshInstance3D.new()
	flash.mesh = fm
	flash.visible = false
	cam.add_child(flash)


func _build_tracers() -> void:
	var mi := MeshInstance3D.new()
	mi.mesh = tracer_im
	mi.custom_aabb = AABB(Vector3(-300, -20, -200), Vector3(600, 80, 400))
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.vertex_color_use_as_albedo = true
	mi.material_override = mat
	add_child(mi)


func _set_viewmodel(weapon: int) -> void:
	if weapon == vm_weapon:
		return
	vm_weapon = weapon
	vm.mesh = Models.viewmodel(weapon)


## 프레임마다 호출. alpha = 틱 사이 보간 비율.
func update(alpha: float, local_id: int, look_yaw: float, look_pitch: float, dt: float) -> void:
	var me: Sim.Unit = sim.units[local_id]
	# 병사 변환
	for u in sim.units:
		var hidden: bool = (u.id == local_id and u.alive and not debug_3p) or (not u.alive and u.death_age > 8.0)
		if hidden:
			if use_mm:
				mmesh[u.team].set_instance_transform(slot[u.id], Transform3D(Basis.from_scale(Vector3.ZERO), Vector3.ZERO))
			else:
				unit_nodes[u.id].visible = false
			continue
		var p: Vector3 = u.prev_pos.lerp(u.pos, alpha)
		var yaw := lerp_angle(u.prev_yaw, u.yaw, alpha)
		var b := Basis(Vector3.UP, yaw)
		if u.alive:
			walk_t[u.id] += u.speed_now * dt * 2.4
			var s := sin(walk_t[u.id])
			p.y += absf(s) * 0.045 * minf(1.0, u.speed_now * 0.3)
			b = b * Basis(Vector3(0, 0, 1), s * 0.05 * minf(1.0, u.speed_now * 0.3))
		else:
			var fall := clampf(u.death_age * 4.5, 0.0, 1.0) * (PI * 0.5)
			b = b * Basis(Vector3(1, 0, 0), fall)
			p.y += 0.1
		if use_mm:
			mmesh[u.team].set_instance_transform(slot[u.id], Transform3D(b, p))
		else:
			var nd: MeshInstance3D = unit_nodes[u.id]
			nd.visible = true
			nd.transform = Transform3D(b, p)
	# 점령 지점 표시
	for i in Sim.NPOINTS:
		var pt: Sim.Pt = sim.pts[i]
		var fm: ArrayMesh = flag_mesh_n if pt.owner < 0 else (flag_mesh_a if pt.owner == 0 else flag_mesh_b)
		if flag_nodes[i].mesh != fm:
			flag_nodes[i].mesh = fm
		var oc := Color(0.75, 0.75, 0.75)
		if pt.owner == 0:
			oc = Models.PALETTE[0].flag
		elif pt.owner == 1:
			oc = Models.PALETTE[1].flag
		ring_nodes[i].material_override = _ring_mat(oc)
		var lead := 0 if pt.cap > 0.0 else 1
		var fc: Color = Models.PALETTE[lead].flag
		var r := World.POINT_R * absf(pt.cap)
		fill_nodes[i].visible = r > 0.5 and pt.owner != lead
		fill_nodes[i].scale = Vector3(r, 1.0, r)
		fill_nodes[i].material_override = _ring_mat(fc)
	# 카메라
	var cp: Vector3 = me.prev_pos.lerp(me.pos, alpha) + Vector3(0.0, Sim.EYE, 0.0)
	if not me.alive:
		cp.y = maxf(cp.y - minf(me.death_age * 2.0, 1.2), me.pos.y + 0.35)
	cam_pos = cp
	cam.basis = Basis.from_euler(Vector3(look_pitch, look_yaw, 0.0))
	if debug_3p:
		cp += cam.basis * Vector3(0.9, 0.5, 3.2)
	cam.position = cp
	# 총
	_set_viewmodel(me.weapon)
	vm.visible = me.alive and not debug_3p
	kick = move_toward(kick, 0.0, dt * 6.0)
	bob += me.speed_now * dt * 2.2
	var sway := sin(bob) * 0.006 * minf(1.0, me.speed_now * 0.3)
	vm.position = Vector3(0.15 + sway, -0.17 + absf(sway), -0.40 + kick * 0.05)
	vm.rotation = Vector3(kick * 0.06, 0.04, 0.0)
	if me.reload_t > 0.0:
		vm.rotation.x = -0.5
		vm.position.y -= 0.08
	flash_t = maxf(0.0, flash_t - dt)
	flash.visible = flash_t > 0.0 and me.alive
	flash.position = Vector3(0.2, -0.13, -0.95 - (0.4 if me.weapon != 1 else 0.0))
	# 예광탄
	tracer_im.clear_surfaces()
	var i := tracers.size() - 1
	var any := false
	while i >= 0:
		var t: Dictionary = tracers[i]
		t.age += dt
		if t.age > 0.35:
			tracers.remove_at(i)
		i -= 1
	if tracers.size() > 0:
		tracer_im.surface_begin(Mesh.PRIMITIVE_LINES)
		for t in tracers:
			var a: Vector3 = t.a
			var bb: Vector3 = t.b
			var len := a.distance_to(bb)
			var head := minf(len, t.age * 260.0)
			var tail := maxf(0.0, head - 9.0)
			if head <= tail:
				continue
			var dir := (bb - a) / maxf(len, 0.001)
			var c: Color = t.col
			tracer_im.surface_set_color(c)
			tracer_im.surface_add_vertex(a + dir * tail)
			tracer_im.surface_set_color(c)
			tracer_im.surface_add_vertex(a + dir * head)
		tracer_im.surface_end()


var _ring_cache := {}

func _ring_mat(c: Color) -> StandardMaterial3D:
	var key := c.to_html()
	if not _ring_cache.has(key):
		var m := StandardMaterial3D.new()
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		m.albedo_color = c
		_ring_cache[key] = m
	return _ring_cache[key]


## 시뮬레이션 이벤트 중 화면 효과가 필요한 것만 소비한다.
func consume(events: Array, local_id: int) -> void:
	for e in events:
		if e.t == "shot":
			var col := Color(1.0, 0.92, 0.65) if e.team == 0 else Color(1.0, 0.8, 0.5)
			tracers.append({"a": e.a, "b": e.b, "age": 0.0, "col": col})
			if e.id == local_id:
				kick = 1.0
				flash_t = 0.05
