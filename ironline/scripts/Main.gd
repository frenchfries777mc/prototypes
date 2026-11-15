extends Node
## 진입점: 시뮬레이션 + 뷰 + HUD 를 조립하고 입력을 모은다.
## 3D 는 640x360 SubViewport 에 그린 뒤 정수배에 가깝게 확대(NEAREST)해서 도트 느낌을 낸다.

const RES := Vector2i(640, 360)
const SENS := 0.0022

var sim: Sim
var view: View
var hud: Hud
var sub: SubViewport
var local_id := 0
var look_yaw := 0.0
var look_pitch := 0.0
var acc := 0.0
var was_alive := false
var reload_edge := false
var cfg := {"bots": 30, "seed": 20260101, "team": 0, "auto": false, "tp": false, "perf": false, "mm": false, "nomouse": false}
var perf_acc := 0.0
var perf_steps := 0
var perf_t := 0.0


func _ready() -> void:
	_read_config()
	sim = Sim.new()
	sim.setup(cfg.seed, cfg.bots)
	local_id = 0 if cfg.team == 0 else Sim.HUMANS_PER_TEAM
	sim.claim_slot(local_id, 0)
	sub = SubViewport.new()
	sub.size = RES
	sub.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	sub.msaa_3d = Viewport.MSAA_DISABLED
	add_child(sub)
	view = View.new()
	sub.add_child(view)
	view.debug_3p = cfg.tp
	view.use_mm = cfg.mm
	view.setup(sim)
	hud = Hud.new()
	sub.add_child(hud)
	hud.setup(sim, local_id)
	var tr := TextureRect.new()
	tr.texture = sub.get_texture()
	tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	tr.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	tr.set_anchors_preset(Control.PRESET_FULL_RECT)
	tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(tr)
	if cfg.auto:
		_capture(true)


func _read_config() -> void:
	var raw := ""
	if OS.has_feature("web"):
		raw = str(JavaScriptBridge.eval("location.search.substring(1)"))
	else:
		raw = "&".join(OS.get_cmdline_user_args())
	for pair in raw.split("&", false):
		var kv := pair.split("=")
		if kv.size() != 2:
			continue
		match kv[0]:
			"bots": cfg.bots = clampi(int(kv[1]), 3, 50)
			"seed": cfg.seed = int(kv[1])
			"team": cfg.team = 1 if kv[1] == "b" else 0
			"auto": cfg.auto = kv[1] == "1"
			"tp": cfg.tp = kv[1] == "1"
			"perf": cfg.perf = kv[1] == "1"
			"mm": cfg.mm = kv[1] == "1"
			"nomouse": cfg.nomouse = kv[1] == "1"


func _capture(on: bool) -> void:
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if on else Input.MOUSE_MODE_VISIBLE
	hud.captured = on


func _input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
			_capture(true)
	elif event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED and not cfg.nomouse:
		look_yaw -= event.relative.x * SENS
		look_pitch = clampf(look_pitch - event.relative.y * SENS, -1.45, 1.45)
	elif event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_ESCAPE:
				_capture(false)
			KEY_R:
				reload_edge = true
			KEY_1, KEY_2, KEY_3:
				sim.units[local_id].loadout = event.keycode - KEY_1
				hud._say("다음 재투입부터 " + Sim.WEAPONS[event.keycode - KEY_1].name, 2.5)
			KEY_ENTER, KEY_KP_ENTER:
				if sim.winner >= 0:
					get_tree().reload_current_scene()


func _process(dt: float) -> void:
	var me: Sim.Unit = sim.units[local_id]
	if me.alive and not was_alive:
		look_yaw = me.yaw
		look_pitch = 0.0
	was_alive = me.alive
	hud.show_score = Input.is_key_pressed(KEY_TAB)
	var captured := Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
	hud.captured = captured
	acc += dt
	var steps := 0
	while acc >= Sim.TICK and steps < 4:
		var mv := Vector2.ZERO
		var fire := false
		var jump := false
		var sprint := false
		if captured:
			mv.x = float(Input.is_key_pressed(KEY_D)) - float(Input.is_key_pressed(KEY_A))
			mv.y = float(Input.is_key_pressed(KEY_W)) - float(Input.is_key_pressed(KEY_S))
			fire = Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)
			jump = Input.is_key_pressed(KEY_SPACE)
			sprint = Input.is_key_pressed(KEY_SHIFT)
		sim.set_input(local_id, mv, look_yaw, look_pitch, fire, jump, sprint, reload_edge)
		reload_edge = false
		var t0 := Time.get_ticks_usec()
		sim.step(Sim.TICK)
		perf_acc += (Time.get_ticks_usec() - t0) / 1000.0
		perf_steps += 1
		acc -= Sim.TICK
		steps += 1
	if steps >= 4:
		acc = 0.0
	view.consume(sim.events, local_id)
	hud.consume(sim.events)
	sim.events.clear()
	view.update(acc / Sim.TICK, local_id, look_yaw, look_pitch, dt)
	perf_t += dt
	if cfg.perf and perf_t >= 3.0:
		print("PERF sim_avg_ms=%.2f steps=%d units=%d alive=%d fps=%d" % [perf_acc / maxf(1.0, perf_steps), perf_steps, sim.units.size(), sim.team_alive(0) + sim.team_alive(1), Engine.get_frames_per_second()])
		perf_acc = 0.0
		perf_steps = 0
		perf_t = 0.0
