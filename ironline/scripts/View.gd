class_name View
extends Node3D
## 시뮬레이션 상태를 3D 장면으로 그린다(읽기 전용). 조명·그림자·스키닝 캐릭터·이펙트·사운드를 담당한다.

const HAZE := Color(0.80, 0.69, 0.56)
const COL_A := Color(0.36, 0.58, 1.0)
const COL_B := Color(1.0, 0.78, 0.3)
const COL_N := Color(0.82, 0.82, 0.82)
const FAR_CULL := 150.0
const ANIM_DIST := 70.0
const SHADOW_DIST := 45.0
const LOD_DIST := 48.0


class UG:
	var root: Node3D
	var sk: Skeleton3D
	var mi: MeshInstance3D
	var flash: MeshInstance3D
	var blob: MeshInstance3D
	var st := {}
	var weapon := -1
	var flash_t := 0.0
	var shadow := true
	var low := false
	var shown := false
	var dead := false


var sim: Sim
var cam: Camera3D
var sun: DirectionalLight3D
var env: Environment
var ugs: Array = []
var fx: Fx
var sfx: Sfx
var flag_meshes: Array = []
var flag_nodes: Array = []
var zone_nodes: Array = []
var beam_nodes: Array = []
var vm: MeshInstance3D
var vm_weapon := -1
var kick := 0.0
var shake := 0.0
var shake_amt := 0.5
var bob := 0.0
var debug_3p := false
var tp_dist := 3.2
var quality := 2
var flash_mat: StandardMaterial3D
var flash_quad: QuadMesh
var cam_pos := Vector3.ZERO
var frame_budget_shots := 0
var grass_root: Node3D
var blob_mesh: PlaneMesh
var idle_t := 0.0
var shell_t := 4.0
var ads_t := 0.0
var sun_uv := Vector2(0.5, 0.2)
var vm_flash: MeshInstance3D
var vm_flash_t := 0.0
var bolt_t := 0.0
var step_acc := 0.0
var spec_id := -1
var spec_cam := Vector3.ZERO
var spec_init := false
var sun_vis := 0.0


func setup(s: Sim) -> void:
	sim = s
	_build_env()
	var t := WorldGfx.terrain(sim.world)
	add_child(t)
	add_child(WorldGfx.props(sim.world))
	grass_root = WorldGfx.grass(sim.world)
	add_child(grass_root)
	fx = Fx.new()
	add_child(fx)
	sfx = Sfx.new()
	add_child(sfx)
	_build_points()
	_build_smoke()
	_build_units()
	_build_camera()


func _build_env() -> void:
	# 해가 낮게 걸린 늦은 오후: 따뜻한 직사광 + 차가운 그늘, 짙은 연무
	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var sm := ShaderMaterial.new()
	sm.shader = load("res://shaders/sky.gdshader")
	sm.set_shader_parameter("top_col", Color(0.13, 0.26, 0.52))
	sm.set_shader_parameter("mid_col", Color(0.46, 0.57, 0.72))
	sm.set_shader_parameter("horizon_col", Color(0.93, 0.74, 0.54))
	sm.set_shader_parameter("ground_col", Color(0.36, 0.31, 0.26))
	sm.set_shader_parameter("cloud_cover", 0.52)
	sky.sky_material = sm
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.50, 0.54, 0.66)
	env.ambient_light_energy = 1.05
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.0
	env.tonemap_white = 5.5
	env.fog_enabled = true
	env.fog_light_color = HAZE
	env.fog_density = 0.0036
	env.fog_sun_scatter = 0.45
	env.fog_sky_affect = 0.0
	env.adjustment_enabled = true
	env.adjustment_contrast = 1.08
	env.adjustment_saturation = 1.0
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	sun = DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-23.0, 150.0, 0.0)
	sun.light_color = Color(1.0, 0.79, 0.56)
	sun.light_energy = 2.1
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.directional_shadow_max_distance = 120.0
	sun.directional_shadow_split_1 = 0.22
	sun.shadow_bias = 0.05
	sun.shadow_normal_bias = 1.4
	sun.shadow_blur = 1.2
	add_child(sun)


func apply_quality(q: int) -> void:
	quality = q
	sun.shadow_enabled = q >= 1
	grass_root.visible = q >= 1
	fx.fire_lights = q >= 1
	if fx.motes != null:
		fx.motes.visible = q >= 1
	sun.directional_shadow_max_distance = 150.0 if q >= 2 else 90.0
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS if q >= 2 else DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	RenderingServer.directional_shadow_atlas_set_size(4096 if q >= 2 else 2048, true)
	var vp := get_viewport()
	vp.msaa_3d = [Viewport.MSAA_DISABLED, Viewport.MSAA_2X, Viewport.MSAA_4X][clampi(q, 0, 2)]
	if q == 0:
		for ug in ugs:
			ug.mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func _build_points() -> void:
	flag_meshes = [WorldGfx.flag(Color(0.72, 0.72, 0.72)), WorldGfx.flag(COL_A * 0.8), WorldGfx.flag(COL_B * 0.85)]
	for i in Sim.NPOINTS:
		var p: Sim.Pt = sim.pts[i]
		var f := MeshInstance3D.new()
		f.mesh = flag_meshes[0]
		f.position = p.pos
		add_child(f)
		flag_nodes.append(f)
		var z := WorldGfx.zone_disc(World.POINT_R)
		z.position = p.pos + Vector3(0, 0.12, 0)
		add_child(z)
		zone_nodes.append(z)
		var b := WorldGfx.beam(70.0)
		b.position = p.pos + Vector3(0, 35.0, 0)
		add_child(b)
		beam_nodes.append(b)


func _build_smoke() -> void:
	var w := sim.world
	var n := 0
	for c in w.craters:
		if n >= 7:
			break
		var x: float = c[0]
		var z: float = c[1]
		if absf(x) > World.HALF_X - 10.0:
			continue
		var pos := Vector3(x, w.height_at(x, z) + 0.3, z)
		if n % 2 == 0:
			fx.fire(pos, 0.9 + 0.3 * (n % 3))
		else:
			fx.smoke_column(pos, 0.8 + 0.4 * (n % 3))
		n += 1
	for hs in w.houses:
		fx.fire(Vector3(hs.cx, w.height_at(hs.cx, hs.cz) + 0.5, hs.cz), 1.2)
	fx.ensure_motes()


func _build_units() -> void:
	var mats := {}
	flash_quad = QuadMesh.new()
	flash_quad.size = Vector2(0.9, 0.9)
	flash_mat = StandardMaterial3D.new()
	flash_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	flash_mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	flash_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	flash_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	flash_mat.albedo_color = Color(1.0, 0.82, 0.45, 1.0)
	flash_mat.albedo_texture = fx._soft
	flash_quad.material = flash_mat
	blob_mesh = PlaneMesh.new()
	blob_mesh.size = Vector2(1.5, 1.5)
	var bmat := StandardMaterial3D.new()
	bmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	bmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	bmat.albedo_color = Color(0.0, 0.0, 0.0, 0.5)
	bmat.albedo_texture = fx._soft
	bmat.disable_fog = true
	blob_mesh.material = bmat
	var skin := Rig.skin()
	for u in sim.units:
		var ug := UG.new()
		ug.root = Node3D.new()
		ug.sk = Rig.make_skeleton()
		ug.root.add_child(ug.sk)
		ug.mi = MeshInstance3D.new()
		ug.mi.mesh = Rig.soldier_mesh(u.team, u.weapon)
		ug.weapon = u.weapon
		ug.sk.add_child(ug.mi)
		ug.mi.skeleton = NodePath("..")
		ug.mi.skin = skin
		ug.mi.custom_aabb = AABB(Vector3(-1.5, -0.2, -1.5), Vector3(3, 2.6, 3))
		var ba := BoneAttachment3D.new()
		ba.bone_name = "chest"
		ug.sk.add_child(ba)
		ug.flash = MeshInstance3D.new()
		ug.flash.mesh = flash_quad
		ug.flash.position = Vector3(0.10, 0.12, -1.25)
		ug.flash.visible = false
		ug.flash.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		ba.add_child(ug.flash)
		ug.blob = MeshInstance3D.new()
		ug.blob.mesh = blob_mesh
		ug.blob.position = Vector3(0, 0.05, 0)
		ug.blob.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		ug.root.add_child(ug.blob)
		ug.st = Rig.new_state()
		ug.root.visible = false
		add_child(ug.root)
		ugs.append(ug)


func _build_camera() -> void:
	cam = Camera3D.new()
	cam.fov = 75.0
	cam.near = 0.05
	cam.far = 700.0
	cam.current = true
	add_child(cam)
	vm = MeshInstance3D.new()
	vm.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	cam.add_child(vm)
	vm_flash = MeshInstance3D.new()
	vm_flash.mesh = flash_quad
	vm_flash.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	vm_flash.visible = false
	vm.add_child(vm_flash)


func _set_viewmodel(weapon: int) -> void:
	if weapon == vm_weapon:
		return
	vm_weapon = weapon
	vm.mesh = Rig.viewmodel_mesh(weapon)


## 프레임마다 호출. alpha = 틱 사이 보간 비율.
## 사망 후: 처음 몇 초는 나를 쓰러뜨린 사람(킬캠), 이후엔 가까운 아군을 따라간다. 대상이 없으면 false.
func _pick_spectate(me: Sim.Unit) -> bool:
	var valid := false
	if spec_id >= 0 and spec_id < sim.units.size():
		var cur: Sim.Unit = sim.units[spec_id]
		valid = cur.alive and cur.id != me.id
		if valid and me.death_age > 3.2 and cur.team != me.team:
			valid = false
	if not valid:
		var pick := -1
		if me.killer >= 0 and me.death_age < 3.2 and sim.units[me.killer].alive:
			pick = me.killer
		else:
			var best := 1e12
			for u in sim.units:
				if u.alive and u.team == me.team and u.id != me.id:
					var d: float = u.pos.distance_squared_to(me.pos)
					if d < best:
						best = d
						pick = u.id
		spec_id = pick
		spec_init = false
	return spec_id >= 0


func _update_sun() -> void:
	var to_sun := sun.global_transform.basis.z
	var far_p := cam.global_position + to_sun * 500.0
	if cam.is_position_behind(far_p):
		sun_vis = 0.0
		return
	var vs := get_viewport().get_visible_rect().size
	sun_uv = cam.unproject_position(far_p) / vs
	sun_vis = smoothstep(1.25, 0.45, (sun_uv - Vector2(0.5, 0.5)).length())


func _shells(dt: float, shake_scale: float) -> void:
	shell_t -= dt
	if shell_t > 0.0:
		return
	shell_t = randf_range(5.0, 12.0)
	var p := Vector3(randf_range(-120.0, 120.0), 0.0, randf_range(-85.0, 85.0))
	p.y = sim.world.height_at(p.x, p.z)
	var d := p.distance_to(cam_pos)
	if d < 18.0:
		return
	fx.blast(p)
	get_tree().create_timer(minf(d / 340.0, 1.6)).timeout.connect(func(): sfx.boom_at(p))
	if shake_scale > 0.0 and d < 100.0:
		shake = maxf(shake, (1.0 - d / 100.0) * 0.8 * shake_scale)


func update(alpha: float, local_id: int, look_yaw: float, look_pitch: float, dt: float) -> void:
	var me: Sim.Unit = sim.units[local_id]
	var cp: Vector3 = me.prev_pos.lerp(me.pos, alpha) + Vector3(0.0, Sim.EYE, 0.0)
	var spectating := false
	if not me.alive:
		cp.y = maxf(cp.y - minf(me.death_age * 2.0, 1.2), me.pos.y + 0.35)
		if me.death_age > 0.9:
			spectating = _pick_spectate(me)
	else:
		spec_id = -1
		spec_init = false
	cam_pos = cp
	# 병사
	for u in sim.units:
		_update_unit(u, ugs[u.id], alpha, dt, local_id)
	_update_points()
	# 카메라
	var sh := Vector3.ZERO
	if shake > 0.0:
		sh = Vector3(randf() - 0.5, randf() - 0.5, 0.0) * minf(shake, 1.0) * shake_amt * 0.02
	shake = maxf(0.0, shake - dt * 5.0)
	cam.basis = Basis.from_euler(Vector3(look_pitch + sh.y, look_yaw + sh.x, 0.0))
	if spectating:
		var tu: Sim.Unit = sim.units[spec_id]
		var ty := lerp_angle(tu.prev_yaw, tu.yaw, alpha)
		var tp: Vector3 = tu.prev_pos.lerp(tu.pos, alpha)
		var want := tp + Basis(Vector3.UP, ty) * Vector3(0.7, 1.9, 3.6)
		want.y = maxf(want.y, sim.world.height_at(want.x, want.z) + 0.8)
		if not spec_init:
			spec_cam = cp
			spec_init = true
		spec_cam = spec_cam.lerp(want, minf(1.0, dt * 4.0))
		cp = spec_cam
		cam.position = cp
		cam.look_at(tp + Vector3(0, 1.35, 0), Vector3.UP)
		cam_pos = cp
	if debug_3p and not spectating:
		cp += cam.basis * Vector3(0.9 * tp_dist / 3.2, 0.5 * tp_dist / 3.2, tp_dist)
	cam.position = cp
	ads_t = move_toward(ads_t, 1.0 if (me.alive and me.in_ads) else 0.0, dt * 7.0)
	cam.fov = lerpf(75.0 + (6.0 if (me.alive and me.speed_now > 6.0) else 0.0), 52.0, ads_t)
	# 1인칭 총
	_set_viewmodel(me.weapon)
	vm.visible = me.alive and not debug_3p
	kick = move_toward(kick, 0.0, dt * 7.0)
	bob += me.speed_now * dt * 1.9
	var amp := minf(1.0, me.speed_now * 0.25)
	var sway := sin(bob) * 0.008 * amp
	var lift := absf(cos(bob)) * 0.006 * amp
	idle_t += dt
	var breath := sin(idle_t * 1.3) * 0.0022
	var sight_y: float = [0.054, 0.05, 0.082][clampi(me.weapon, 0, 2)]
	vm.scale = Vector3.ONE * 0.9
	var hip := Vector3(0.165 + sway, -0.185 - lift + breath, -0.33 + kick * 0.07)
	var aim := Vector3(0.0, -sight_y * 0.9 - 0.002 + breath * 0.3, -0.24 + kick * 0.05)
	vm.position = hip.lerp(aim, ads_t)
	vm.rotation = Vector3(kick * 0.08 * (1.0 - ads_t * 0.6) + (0.05 if me.speed_now > 6.0 else 0.0), lerpf(0.035, 0.0, ads_t), sway * 1.2 * (1.0 - ads_t))
	if me.reload_t > 0.0:
		vm.rotation.x = -0.55
		vm.position.y -= 0.1
		vm.rotation.z = 0.2
	_shells(dt, 1.0)
	# 노리쇠 동작 / 총구 섬광 / 발소리
	bolt_t = maxf(0.0, bolt_t - dt)
	if bolt_t > 0.0 and me.weapon == 0 and me.alive:
		var ph := 1.0 - bolt_t / 0.8
		var bm := sin(clampf((ph - 0.2) / 0.6, 0.0, 1.0) * PI)
		vm.position.z += bm * 0.045
		vm.position.y -= bm * 0.02
		vm.rotation.z += bm * 0.35
		vm.rotation.x -= bm * 0.06
	vm_flash_t = maxf(0.0, vm_flash_t - dt)
	vm_flash.visible = vm_flash_t > 0.0 and me.alive
	vm_flash.position = Vector3(0.0, 0.02, [-1.1, -0.56, -1.02][clampi(me.weapon, 0, 2)])
	vm_flash.rotation.z = randf() * TAU
	vm_flash.scale = Vector3.ONE * randf_range(0.8, 1.3)
	if me.alive and me.on_ground and me.speed_now > 0.8:
		step_acc += me.speed_now * dt
		var stride := 2.1 if me.speed_now < 5.5 else 2.9
		if step_acc >= stride:
			step_acc = 0.0
			sfx.step_sound(me.speed_now)
	fx.update(dt)
	fx.follow(cp)
	sfx.update(dt, cp)
	_update_sun()


func _update_points() -> void:
	for i in Sim.NPOINTS:
		var pt: Sim.Pt = sim.pts[i]
		var fi := 0 if pt.owner < 0 else (1 if pt.owner == 0 else 2)
		if flag_nodes[i].mesh != flag_meshes[fi]:
			flag_nodes[i].mesh = flag_meshes[fi]
		var oc := COL_N
		if pt.owner == 0:
			oc = COL_A
		elif pt.owner == 1:
			oc = COL_B
		var lead := 0 if pt.cap > 0.0 else 1
		var fc := COL_A if lead == 0 else COL_B
		var fill := absf(pt.cap) if pt.owner != lead else 0.0
		var zm: ShaderMaterial = zone_nodes[i].material_override
		zm.set_shader_parameter("col", oc)
		zm.set_shader_parameter("col_fill", fc)
		zm.set_shader_parameter("fill", fill)
		zm.set_shader_parameter("contested", 1.0 if (pt.n_a > 0 and pt.n_b > 0) else 0.0)
		var bm: ShaderMaterial = beam_nodes[i].material_override
		bm.set_shader_parameter("col", oc)


## 메뉴 배경: 전장 위를 천천히 도는 카메라.
func update_attract(alpha: float, dt: float, t: float) -> void:
	var ang := t * 0.045
	var c := Vector3(sin(ang * 0.7) * 30.0, 0.0, cos(ang * 0.5) * 12.0)
	var pos := c + Vector3(sin(ang) * 58.0, 22.0 + sin(t * 0.13) * 5.0, cos(ang) * 58.0)
	pos.y = maxf(pos.y, sim.world.height_at(pos.x, pos.z) + 9.0)
	cam_pos = pos
	cam.position = pos
	cam.look_at(c + Vector3(0, 2.0, 0), Vector3.UP)
	cam.fov = 62.0
	vm.visible = false
	for u in sim.units:
		_update_unit(u, ugs[u.id], alpha, dt, -1)
	_update_points()
	_shells(dt, 0.0)
	fx.update(dt)
	fx.follow(pos)
	sfx.update(dt, pos)
	_update_sun()


func _update_unit(u: Sim.Unit, ug: UG, alpha: float, dt: float, local_id: int) -> void:
	var hide: bool = (u.id == local_id and u.alive and not debug_3p) or (not u.alive and u.death_age > 8.0)
	var p: Vector3 = u.prev_pos.lerp(u.pos, alpha)
	var dist := p.distance_to(cam_pos)
	if hide or dist > FAR_CULL:
		if ug.shown:
			ug.root.visible = false
			ug.shown = false
		return
	if not ug.shown:
		ug.root.visible = true
		ug.shown = true
	var want_low: bool = dist > LOD_DIST - (6.0 if ug.low else 0.0)
	if ug.weapon != u.weapon or ug.low != want_low:
		ug.weapon = u.weapon
		ug.low = want_low
		ug.mi.mesh = Rig.soldier_mesh(u.team, u.weapon, want_low)
	var yaw := lerp_angle(u.prev_yaw, u.yaw, alpha)
	var b := Basis(Vector3.UP, yaw)
	if u.alive:
		ug.dead = false
		if dist < ANIM_DIST:
			var right := Vector3(cos(yaw), 0.0, -sin(yaw))
			var strafe := clampf(u.vel.dot(right) / 4.5, -1.0, 1.0)
			Rig.animate(ug.sk, ug.st, u.speed_now, dt, u.pitch, not u.on_ground, strafe)
	else:
		if not ug.dead:
			ug.dead = true
			Rig.death_pose(ug.sk)
		var fall := clampf(u.death_age * 3.2, 0.0, 1.0)
		fall = 1.0 - (1.0 - fall) * (1.0 - fall)
		b = b * Basis(Vector3.RIGHT, fall * (PI * 0.5 - 0.1))
		p.y += fall * 0.12
	ug.root.transform = Transform3D(b, p)
	ug.blob.visible = dist < 70.0
	var want_shadow := dist < SHADOW_DIST and quality >= 1
	if want_shadow != ug.shadow:
		ug.shadow = want_shadow
		ug.mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if want_shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if ug.flash_t > 0.0:
		ug.flash_t -= dt
		ug.flash.visible = ug.flash_t > 0.0 and u.alive
		ug.flash.rotation.z = randf() * TAU
	elif ug.flash.visible:
		ug.flash.visible = false


## 시뮬레이션 이벤트 중 화면/소리 효과가 필요한 것만 소비한다.
func consume(events: Array, local_id: int) -> void:
	sfx.begin_frame()
	var w := sim.world
	for e in events:
		match e.t:
			"shot":
				var shooter: Sim.Unit = sim.units[e.id]
				fx.add_tracer(e.a, e.b, e.team)
				var b: Vector3 = e.b
				if e.hit:
					fx.burst("blood", b, Vector3.UP)
				else:
					var gy := w.height_at(b.x, b.z)
					if w.inside_box(b + Vector3(0, -0.05, 0)) or b.y > gy + 1.2:
						fx.burst("wall", b, Vector3.UP)
					else:
						fx.burst("dust", b, Vector3.UP)
				if e.id == local_id:
					kick = 1.0
					shake += 0.12
					vm_flash_t = 0.045
					if shooter.weapon == 0:
						bolt_t = 0.8
					fx.casing(cam_pos + cam.basis * Vector3(0.12, -0.1, -0.4), cam.basis.x)
					sfx.own_shot(shooter.weapon)
					fx.muzzle_light(cam_pos + cam.basis * Vector3(0.2, -0.1, -1.2))
				else:
					ugs[e.id].flash_t = 0.06
					sfx.shot_at(shooter.weapon, e.a, e.a.distance_to(cam_pos))
					# 총알이 머리 옆을 스치면 휙 소리
					if e.team != sim.units[local_id].team and local_id >= 0:
						var seg: Vector3 = e.b - e.a
						var ln := seg.length()
						if ln > 1.0:
							var tt := clampf((cam_pos - e.a).dot(seg) / (ln * ln), 0.0, 1.0)
							var cp2: Vector3 = e.a + seg * tt
							var dd := cp2.distance_to(cam_pos)
							if dd < 3.5 and e.a.distance_to(cam_pos) > 6.0:
								sfx.whiz_at(cp2)
								shake += 0.04
			"hit":
				if e.a == local_id:
					sfx.play2d(sfx.tick, -4.0, 1.4 if e.head else 1.0)
				if e.v == local_id:
					shake += 0.6
					sfx.play2d(sfx.thump, -2.0)
			"kill":
				if e.k == local_id:
					sfx.play2d(sfx.chime, -6.0)
			"cap":
				sfx.play2d(sfx.chime, -8.0, 0.8 if e.o != sim.units[local_id].team else 1.2)
