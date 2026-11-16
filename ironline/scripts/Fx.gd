class_name Fx
extends Node3D
## 이펙트: 예광탄, 총구 섬광, 피탄 먼지/피, 전장 연기.

var tracer_im := ImmediateMesh.new()
var tracers: Array = []
var _soft: Texture2D
var _pools := {}
var _next := {}
var flash_light: OmniLight3D
var blast_light: OmniLight3D
var fires: Array = []
var motes: CPUParticles3D
var fire_lights := true
var clock := 0.0


func _ready() -> void:
	var gt := GradientTexture2D.new()
	var gr := Gradient.new()
	gr.colors = PackedColorArray([Color(1, 1, 1, 1), Color(1, 1, 1, 0.0)])
	gr.offsets = PackedFloat32Array([0.0, 1.0])
	gt.gradient = gr
	gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.5, 0.5)
	gt.fill_to = Vector2(1.0, 0.5)
	gt.width = 64
	gt.height = 64
	_soft = gt
	_make_pool("dust", 18, 12, Color(0.55, 0.47, 0.34, 0.75), 0.9, 2.0, 4.5, 1.1, Vector3(0, -1.5, 0), 0.9)
	_make_pool("wall", 14, 10, Color(0.62, 0.6, 0.56, 0.7), 0.7, 1.5, 3.5, 0.8, Vector3(0, -2.0, 0), 0.8)
	_make_pool("blood", 10, 8, Color(0.55, 0.04, 0.03, 0.95), 0.5, 1.0, 3.2, 0.34, Vector3(0, -9.0, 0), 0.6)
	_make_pool("flash", 6, 5, Color(1.0, 0.85, 0.5, 0.95), 0.1, 0.5, 1.5, 0.7, Vector3.ZERO, 0.8)
	_make_pool("spark", 8, 7, Color(1.0, 0.82, 0.4, 1.0), 0.35, 3.0, 7.0, 0.05, Vector3(0, -12.0, 0), 0.3, true)
	_make_pool("casing", 8, 1, Color(0.8, 0.6, 0.2, 1.0), 1.1, 2.2, 3.6, 0.045, Vector3(0, -9.8, 0), 0.0)
	_make_pool("blast", 4, 30, Color(0.26, 0.20, 0.14, 0.9), 2.4, 7.0, 13.0, 2.2, Vector3(0, -7.0, 0), 0.7)
	_make_pool("blastsmoke", 4, 18, Color(0.2, 0.19, 0.18, 0.7), 5.0, 1.5, 3.5, 4.0, Vector3(0.3, 0.6, 0), 0.4)
	var mi := MeshInstance3D.new()
	mi.mesh = tracer_im
	mi.custom_aabb = AABB(Vector3(-400, -40, -300), Vector3(800, 160, 600))
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.vertex_color_use_as_albedo = true
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.no_depth_test = false
	mi.material_override = mat
	add_child(mi)
	flash_light = OmniLight3D.new()
	flash_light.light_color = Color(1.0, 0.8, 0.5)
	flash_light.omni_range = 14.0
	flash_light.light_energy = 0.0
	flash_light.shadow_enabled = false
	add_child(flash_light)
	blast_light = OmniLight3D.new()
	blast_light.light_color = Color(1.0, 0.7, 0.4)
	blast_light.omni_range = 60.0
	blast_light.light_energy = 0.0
	blast_light.shadow_enabled = false
	add_child(blast_light)


func _make_pool(key: String, count: int, amount: int, col: Color, life: float, v0: float, v1: float,
		size: float, grav: Vector3, damp: float, additive: bool = false) -> void:
	var arr: Array = []
	for i in count:
		var p := CPUParticles3D.new()
		p.emitting = false
		p.one_shot = true
		p.amount = amount
		p.lifetime = life
		p.explosiveness = 1.0
		p.direction = Vector3.UP
		p.spread = 70.0
		p.initial_velocity_min = v0
		p.initial_velocity_max = v1
		p.gravity = grav
		p.damping_min = damp
		p.damping_max = damp * 1.8
		p.scale_amount_min = size * 0.6
		p.scale_amount_max = size * 1.3
		var sc := Curve.new()
		sc.add_point(Vector2(0, 0.5))
		sc.add_point(Vector2(1, 1.8))
		p.scale_amount_curve = sc
		var g := Gradient.new()
		g.colors = PackedColorArray([Color(col.r, col.g, col.b, col.a), Color(col.r, col.g, col.b, 0.0)])
		g.offsets = PackedFloat32Array([0.0, 1.0])
		p.color_ramp = g
		var qm := QuadMesh.new()
		qm.size = Vector2(1, 1)
		var mat := StandardMaterial3D.new()
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
		mat.vertex_color_use_as_albedo = true
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.albedo_texture = _soft
		mat.particles_anim_h_frames = 1
		mat.particles_anim_v_frames = 1
		if key == "flash" or additive:
			mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		qm.material = mat
		p.mesh = qm
		p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(p)
		arr.append(p)
	_pools[key] = arr
	_next[key] = 0


func burst(key: String, pos: Vector3, normal: Vector3 = Vector3.UP) -> void:
	var arr: Array = _pools[key]
	var i: int = _next[key]
	_next[key] = (i + 1) % arr.size()
	var p: CPUParticles3D = arr[i]
	p.position = pos
	p.direction = normal
	p.restart()
	p.emitting = true


func smoke_column(pos: Vector3, strength: float = 1.0) -> void:
	var p := CPUParticles3D.new()
	p.amount = 36
	p.lifetime = 9.0
	p.preprocess = 9.0
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 1.2 * strength
	p.direction = Vector3.UP
	p.spread = 12.0
	p.initial_velocity_min = 1.2
	p.initial_velocity_max = 2.2
	p.gravity = Vector3(0.5, 0.25, 0.2)
	p.damping_min = 0.1
	p.damping_max = 0.2
	p.scale_amount_min = 3.0 * strength
	p.scale_amount_max = 5.0 * strength
	var sc := Curve.new()
	sc.add_point(Vector2(0, 0.35))
	sc.add_point(Vector2(1, 2.6))
	p.scale_amount_curve = sc
	var g := Gradient.new()
	g.colors = PackedColorArray([Color(0.1, 0.09, 0.08, 0.0), Color(0.16, 0.14, 0.12, 0.55), Color(0.4, 0.38, 0.35, 0.0)])
	g.offsets = PackedFloat32Array([0.0, 0.18, 1.0])
	p.color_ramp = g
	var qm := QuadMesh.new()
	qm.size = Vector2(1, 1)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	mat.vertex_color_use_as_albedo = true
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_texture = _soft
	qm.material = mat
	p.mesh = qm
	p.position = pos
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(p)


func add_tracer(a: Vector3, b: Vector3, team: int) -> void:
	var col := Color(1.0, 0.86, 0.5, 1.0) if team == 0 else Color(1.0, 0.7, 0.4, 1.0)
	tracers.append({"a": a, "b": b, "age": 0.0, "col": col})
	if tracers.size() > 160:
		tracers.pop_front()


func blast(pos: Vector3) -> void:
	burst("blast", pos + Vector3(0, 0.3, 0), Vector3.UP)
	burst("blastsmoke", pos + Vector3(0, 0.6, 0), Vector3.UP)
	burst("dust", pos + Vector3(0, 0.3, 0), Vector3.UP)
	burst("wall", pos + Vector3(0, 0.3, 0), Vector3.UP)
	blast_light.position = pos + Vector3(0, 3.0, 0)
	blast_light.light_energy = 9.0


func muzzle_light(pos: Vector3) -> void:
	flash_light.position = pos
	flash_light.light_energy = 3.5


func update(dt: float) -> void:
	flash_light.light_energy = maxf(0.0, flash_light.light_energy - dt * 70.0)
	blast_light.light_energy = maxf(0.0, blast_light.light_energy - dt * 18.0)
	tracer_im.clear_surfaces()
	var i := tracers.size() - 1
	while i >= 0:
		var t: Dictionary = tracers[i]
		t.age += dt
		if t.age > 0.4:
			tracers.remove_at(i)
		i -= 1
	if tracers.is_empty():
		return
	tracer_im.surface_begin(Mesh.PRIMITIVE_LINES)
	for t in tracers:
		var a: Vector3 = t.a
		var b: Vector3 = t.b
		var len := a.distance_to(b)
		if len < 0.5:
			continue
		var head := minf(len, t.age * 300.0)
		var tail := maxf(0.0, head - 14.0)
		if head <= tail:
			continue
		var dir := (b - a) / len
		var c: Color = t.col
		tracer_im.surface_set_color(Color(c.r, c.g, c.b, 0.0))
		tracer_im.surface_add_vertex(a + dir * tail)
		tracer_im.surface_set_color(c)
		tracer_im.surface_add_vertex(a + dir * head)
	tracer_im.surface_end()


func casing(pos: Vector3, right: Vector3) -> void:
	burst("casing", pos, (right + Vector3(0.1, 0.7, 0.0)).normalized())


## 지속되는 불: 불꽃 + 불씨 + 깜빡이는 조명 + 연기.
func fire(pos: Vector3, size: float = 1.0) -> void:
	var flame := _emitter(Color(1.0, 0.55, 0.12, 0.85), 16, 0.9, 0.7, 1.7, 1.1 * size, Vector3(0, 1.3, 0), true)
	flame.position = pos
	flame.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	flame.emission_sphere_radius = 0.35 * size
	flame.spread = 14.0
	add_child(flame)
	var embers := _emitter(Color(1.0, 0.7, 0.2, 1.0), 8, 2.2, 1.0, 2.6, 0.07, Vector3(0.4, 0.9, 0), true)
	embers.position = pos
	embers.spread = 35.0
	add_child(embers)
	smoke_column(pos + Vector3(0, 0.8, 0), 0.7 * size)
	var l := OmniLight3D.new()
	l.light_color = Color(1.0, 0.55, 0.2)
	l.omni_range = 11.0 * size
	l.light_energy = 1.6
	l.shadow_enabled = false
	l.position = pos + Vector3(0, 1.0, 0)
	add_child(l)
	fires.append({"light": l, "phase": randf() * TAU})


func _emitter(col: Color, amount: int, life: float, v0: float, v1: float, size: float, grav: Vector3, additive: bool) -> CPUParticles3D:
	var p := CPUParticles3D.new()
	p.amount = amount
	p.lifetime = life
	p.preprocess = life
	p.direction = Vector3.UP
	p.initial_velocity_min = v0
	p.initial_velocity_max = v1
	p.gravity = grav
	p.scale_amount_min = size * 0.7
	p.scale_amount_max = size * 1.2
	var sc := Curve.new()
	sc.add_point(Vector2(0, 1.0))
	sc.add_point(Vector2(1, 0.15))
	p.scale_amount_curve = sc
	var g := Gradient.new()
	g.colors = PackedColorArray([Color(col.r, col.g, col.b, 0.0), col, Color(col.r * 0.6, col.g * 0.25, col.b * 0.1, 0.0)])
	g.offsets = PackedFloat32Array([0.0, 0.2, 1.0])
	p.color_ramp = g
	var qm := QuadMesh.new()
	qm.size = Vector2(1, 1)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	mat.vertex_color_use_as_albedo = true
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	if additive:
		mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.albedo_texture = _soft
	qm.material = mat
	p.mesh = qm
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return p


## 카메라 주변에 떠다니는 먼지 입자(분위기용).
func ensure_motes() -> void:
	if motes != null:
		return
	motes = _emitter(Color(1.0, 0.95, 0.85, 0.35), 70, 7.0, 0.1, 0.5, 0.045, Vector3(0.35, 0.02, 0.12), false)
	motes.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	motes.emission_box_extents = Vector3(16.0, 5.0, 16.0)
	motes.direction = Vector3(1, 0.1, 0.3)
	motes.spread = 180.0
	var sc := Curve.new()
	sc.add_point(Vector2(0, 1.0))
	sc.add_point(Vector2(1, 1.0))
	motes.scale_amount_curve = sc
	add_child(motes)


func follow(cam_pos: Vector3) -> void:
	if motes != null:
		motes.global_position = cam_pos + Vector3(0, 1.5, 0)
	clock += get_process_delta_time()
	for f in fires:
		var l: OmniLight3D = f.light
		l.visible = fire_lights
		l.light_energy = 1.5 + 0.55 * sin(clock * 13.0 + f.phase) + 0.3 * sin(clock * 29.0 + f.phase * 2.0)


var mist_nodes: Array = []

## 참호 위에 낮게 깔린 옅은 안개. 채우기 비용이 커서 '높음' 품질에서만 보인다.
func mist(pos: Vector3) -> void:
	var m := _emitter(Color(0.92, 0.82, 0.68, 0.11), 6, 14.0, 0.1, 0.35, 9.0, Vector3(0.25, 0.0, 0.05), false)
	m.position = pos
	m.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	m.emission_box_extents = Vector3(3.0, 0.3, 14.0)
	m.direction = Vector3(1, 0, 0)
	m.spread = 90.0
	var sc := Curve.new()
	sc.add_point(Vector2(0, 0.6))
	sc.add_point(Vector2(1, 1.1))
	m.scale_amount_curve = sc
	add_child(m)
	mist_nodes.append(m)


func set_mist_visible(v: bool) -> void:
	for m in mist_nodes:
		m.visible = v
