extends Node
## 진입점: 메뉴 → (대기실) → 플레이 상태 머신. 모드는 solo / host / client.
## URL 인자: bots seed team q scale perf tp nomouse join auto(solo|host|join) code name autostart peerhost peerport peersecure

enum St { MENU, LOBBY, PLAYING }

const SENS := 0.0022

var st := St.MENU
var mode := "solo"
var sim: Sim
var view: View
var hud: Hud
var post: ColorRect
var menu: Menu
var net: Net
var local_id := 0
var look_yaw := 0.0
var look_pitch := 0.0
var acc := 0.0
var was_alive := false
var reload_edge := false
var attract_t := 0.0
var built_seed := -1
var built_bots := -1
var building := false
var adaptive := false
var fx_level := 2
var fps_t := 0.0
var render_scale := 1.0
var cfg := {"bots": -1, "seed": 20260101, "team": -2, "tp": false, "tpd": 3.2, "perf": false, "nomouse": false,
	"q": -1, "scale": 1.0, "join": "", "auto": "", "code": "", "name": "", "autostart": false,
	"peerhost": "", "peerport": 443, "peersecure": true, "warp": "", "die": false}
var perf_acc := 0.0
var perf_steps := 0
var perf_t := 0.0
var net_log_t := 0.0
var quick_state := ""
var quick_idx := 0
var quick_t := 0.0
var recorded := false
var caps_mine := 0
const PUB_ROOMS := 4


func _ready() -> void:
	_read_config()
	var pl := CanvasLayer.new()
	pl.layer = 1
	add_child(pl)
	post = ColorRect.new()
	post.mouse_filter = Control.MOUSE_FILTER_IGNORE
	post.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var pm := ShaderMaterial.new()
	pm.shader = load("res://shaders/post.gdshader")
	post.material = pm
	pl.add_child(post)
	var hl := CanvasLayer.new()
	hl.layer = 2
	add_child(hl)
	hud = Hud.new()
	hud.visible = false
	hl.add_child(hud)
	var ml := CanvasLayer.new()
	ml.layer = 3
	add_child(ml)
	menu = Menu.new()
	ml.add_child(menu)
	net = Net.new()
	add_child(net)
	net.lobby_changed.connect(_on_lobby_changed)
	net.match_start.connect(_on_match_start)
	net.failed.connect(_on_net_failed)
	net.peer_left.connect(_on_peer_left)
	menu.play_solo.connect(_on_play_solo)
	menu.quick_match.connect(_on_quick_match)
	menu.host_room.connect(_on_host_room)
	menu.join_room.connect(_on_join_room)
	menu.start_match.connect(func(): net.start_match())
	menu.leave_room.connect(_to_menu)
	menu.team_chosen.connect(_on_team_chosen)
	menu.settings_changed.connect(_apply_quality)
	if cfg.name != "":
		menu.player_name = cfg.name
		menu.name_edit.text = cfg.name
	if cfg.team != -2:
		menu.pref_team = cfg.team
	if cfg.bots > 0:
		menu.bots = cfg.bots
	if cfg.q >= 0:
		menu.quality = cfg.q
	menu.set_multi_available(Net.available())
	await _ensure_world(cfg.seed, menu.bots)
	_apply_quality()
	if cfg.auto == "solo":
		_on_play_solo()
	elif cfg.auto == "quick":
		_on_quick_match()
	elif cfg.auto == "host":
		_on_host_room(cfg.code)
	elif cfg.auto == "join":
		_on_join_room(cfg.code)
	elif cfg.join != "":
		menu.code_edit.text = cfg.join
		_on_join_room(cfg.join)


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
		var v: String = kv[1].uri_decode()
		match kv[0]:
			"bots": cfg.bots = clampi(int(v), 3, 50)
			"seed": cfg.seed = int(v)
			"team": cfg.team = 1 if v == "b" else (0 if v == "a" else -1)
			"tp": cfg.tp = (v == "1" or v == "2")
			"tpd": cfg.tpd = float(v)
			"perf": cfg.perf = v == "1"
			"safe": WorldGfx.safe_gfx = v == "1"
			"nomouse": cfg.nomouse = v == "1"
			"q": cfg.q = clampi(int(v), 0, 3)
			"scale": cfg.scale = float(v)
			"join": cfg.join = v.to_upper()
			"auto": cfg.auto = v
			"code": cfg.code = v.to_upper()
			"name": cfg.name = v
			"autostart": cfg.autostart = v == "1"
			"die": cfg.die = v == "1"
			"warp": cfg.warp = v
			"peerhost": cfg.peerhost = v
			"peerport": cfg.peerport = int(v)
			"peersecure": cfg.peersecure = v != "0"


func _peer_cfg() -> Dictionary:
	if cfg.peerhost == "":
		return {}
	return {"host": cfg.peerhost, "port": cfg.peerport, "secure": cfg.peersecure}


# ---------------------------------------------------------------- 월드/품질

func _ensure_world(seed_v: int, bots: int) -> void:
	if sim != null and built_seed == seed_v and built_bots == bots:
		return
	building = true
	menu.set_loading(true, "전장 준비 중…")
	await get_tree().process_frame
	await get_tree().process_frame
	if view != null:
		view.queue_free()
	sim = Sim.new()
	sim.setup(seed_v, bots)
	view = View.new()
	view.debug_3p = cfg.tp
	view.tp_dist = cfg.tpd
	add_child(view)
	move_child(view, 0)
	view.setup(sim)
	hud.setup(sim, 0)
	menu.set_map(hud._mini)
	built_seed = seed_v
	built_bots = bots
	_apply_quality()
	menu.set_loading(false)
	building = false


func _apply_quality() -> void:
	if view == null:
		return
	var q: int = menu.quality
	adaptive = q >= 3
	var eff := 1 if adaptive else q
	fx_level = 2 if (adaptive or q >= 2) else q
	view.apply_quality(eff)
	render_scale = clampf(cfg.scale, 0.4, 1.0)
	get_viewport().scaling_3d_scale = render_scale


func _adapt(dt: float) -> void:
	fps_t += dt
	if fps_t < 1.5:
		return
	fps_t = 0.0
	var fps := Engine.get_frames_per_second()
	if fps < 42:
		render_scale = maxf(0.5, render_scale - 0.07)
	elif fps > 58 and render_scale < 1.0:
		render_scale = minf(1.0, render_scale + 0.04)
	get_viewport().scaling_3d_scale = render_scale


# ---------------------------------------------------------------- 메뉴 동작

func _on_play_solo() -> void:
	if building:
		return
	mode = "solo"
	await _ensure_world(cfg.seed, menu.bots)
	var team := menu.pref_team if menu.pref_team >= 0 else (randi() % 2)
	_begin_match(team * Sim.HUMANS_PER_TEAM)


## 빠른 대전: 공개 방 PUB1~4 에 차례로 접속해 보고, 없으면 내가 PUB 방의 방장이 된다(20초 뒤 봇으로 채워 시작).
func _on_quick_match() -> void:
	if building:
		return
	quick_state = "joining"
	quick_idx = 0
	_quick_try()


func _quick_try() -> void:
	if quick_idx < PUB_ROOMS:
		if net.join_room("PUB%d" % (quick_idx + 1), menu.player_name, menu.pref_team, _peer_cfg()):
			mode = "client"
			st = St.LOBBY
			menu.show_lobby()
			menu.refresh_lobby(net)
		else:
			quick_state = ""
	else:
		quick_state = "hosting"
		quick_t = 20.0
		quick_host_idx = 0
		_quick_host()


var quick_host_idx := 0


func _quick_host() -> void:
	var code := "PUB%d" % (quick_host_idx + 1)
	if net.host_room(code, menu.player_name, menu.pref_team, {"seed": cfg.seed, "bots": menu.bots}, _peer_cfg()):
		mode = "host"
		st = St.LOBBY
		menu.show_lobby()
		menu.refresh_lobby(net, quick_t)


func _on_host_room(code: String = "") -> void:
	if building:
		return
	var c := code if code != "" else Net.make_code()
	if net.host_room(c, menu.player_name, menu.pref_team, {"seed": cfg.seed, "bots": menu.bots}, _peer_cfg()):
		mode = "host"
		st = St.LOBBY
		menu.show_lobby()
		menu.refresh_lobby(net)


func _on_join_room(code: String) -> void:
	if building:
		return
	if net.join_room(code, menu.player_name, menu.pref_team, _peer_cfg()):
		mode = "client"
		st = St.LOBBY
		menu.show_lobby()
		menu.refresh_lobby(net)


func _on_team_chosen(t: int) -> void:
	if net.role == Net.Role.HOST:
		net.host_set_team(t)
	elif net.role == Net.Role.CLIENT:
		net.send_team(t)


func _on_lobby_changed() -> void:
	if st == St.LOBBY:
		menu.refresh_lobby(net)


func _on_net_failed(msg: String) -> void:
	if quick_state == "joining" and msg.begins_with("방을 찾을 수 없어요"):
		net.shutdown()
		quick_idx += 1
		_quick_try()
		return
	if quick_state == "hosting" and msg.begins_with("이미 같은 코드"):
		net.shutdown()
		quick_host_idx += 1
		if quick_host_idx < PUB_ROOMS:
			_quick_host()
			return
	quick_state = ""
	menu.toast(msg)
	if st != St.MENU:
		_to_menu()


func _on_peer_left(slot: int) -> void:
	if sim != null and slot >= 0 and slot < sim.units.size():
		sim.release_slot(slot)


func _on_match_start(info: Dictionary) -> void:
	var c: Dictionary = info.cfg
	await _ensure_world(int(c.seed), int(c.bots))
	_begin_match(int(info.slot))


func _begin_match(slot: int) -> void:
	quick_state = ""
	recorded = false
	caps_mine = 0
	hud.xp_gain = 0
	sim.reset(built_bots)
	local_id = slot
	sim.claim_slot(local_id, menu.loadout)
	if mode != "solo":
		for k in net.names:
			var id := int(k)
			if id < sim.units.size() and id != local_id:
				sim.units[id].label = str(net.names[k])
		sim.units[local_id].label = net.my_name
	else:
		sim.units[local_id].label = menu.player_name
	hud.setup(sim, local_id)
	hud.visible = true
	menu.hide_all()
	st = St.PLAYING
	acc = 0.0
	was_alive = false
	reload_edge = false
	if mode == "client":
		net.client_begin(sim)
	_apply_quality()
	# 버튼을 누른 클릭에서 곧바로 마우스를 잡는다(브라우저는 사용자 입력 안에서만 허용). 클라이언트는 네트워크 신호로 시작하므로 클릭이 필요하다.
	if mode != "client" or cfg.auto != "":
		_capture(true)


func _to_menu() -> void:
	quick_state = ""
	net.shutdown()
	st = St.MENU
	mode = "solo"
	if sim != null:
		sim.reset(built_bots)
	hud.visible = false
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	get_viewport().scaling_3d_scale = 1.0
	menu.show_home()


func _capture(on: bool) -> void:
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if on else Input.MOUSE_MODE_VISIBLE
	hud.captured = on


# ---------------------------------------------------------------- 입력

func _input(event: InputEvent) -> void:
	if st != St.PLAYING:
		return
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED and sim.winner < 0:
			_capture(true)
	elif event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED and not cfg.nomouse:
		var s := SENS * menu.sens
		look_yaw -= event.relative.x * s
		look_pitch = clampf(look_pitch - event.relative.y * s, -1.45, 1.45)
	elif event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_ESCAPE:
				_capture(false)
			KEY_M:
				if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
					_to_menu()
			KEY_R:
				reload_edge = true
			KEY_1, KEY_2, KEY_3:
				var w: int = event.keycode - KEY_1
				sim.units[local_id].loadout = w
				if mode == "client":
					net.send_loadout(w)
				hud._say("다음 재투입부터 " + Sim.WEAPONS[w].name, 2.5)
			KEY_ENTER, KEY_KP_ENTER:
				if sim.winner >= 0:
					_to_menu()


# ---------------------------------------------------------------- 프레임 루프

func _process(dt: float) -> void:
	net.poll(dt)
	if sim == null or building:
		return
	if quick_state == "hosting" and st == St.LOBBY and net.role == Net.Role.HOST and not net.started:
		quick_t -= dt
		menu.refresh_lobby(net, maxf(quick_t, 0.0))
		if quick_t <= 0.0 and net.status == "ready":
			quick_state = ""
			net.start_match()
	if cfg.autostart and net.role == Net.Role.HOST and not net.started and net.players.size() >= 2:
		net.start_match()
	if st == St.PLAYING:
		_play(dt)
	else:
		_menu_bg(dt)
	var pm: ShaderMaterial = post.material
	var me: Sim.Unit = sim.units[local_id]
	pm.set_shader_parameter("sun_uv", view.sun_uv)
	pm.set_shader_parameter("sun_vis", view.sun_vis)
	pm.set_shader_parameter("cam_motion", view.cam_motion if st == St.PLAYING else Vector2.ZERO)
	pm.set_shader_parameter("fx_level", float(fx_level))
	pm.set_shader_parameter("hurt", clampf(hud.hurt_t / 0.6, 0.0, 1.0) if st == St.PLAYING else 0.0)
	pm.set_shader_parameter("low_hp", clampf((45.0 - me.hp) / 45.0, 0.0, 1.0) if (st == St.PLAYING and me.alive) else 0.0)
	if cfg.perf:
		perf_t += dt
		if perf_t >= 3.0:
			print("PERF mode=%s st=%d sim_avg_ms=%.2f units=%d alive=%d fps=%d scale=%.2f" % [mode, st, perf_acc / maxf(1.0, perf_steps), sim.units.size(), sim.team_alive(0) + sim.team_alive(1), Engine.get_frames_per_second(), render_scale])
			print("NET role=%d status=%s err=%s id=%s peers=%d hello=%s local_ready=%s started=%s" % [net.role, net.status, net.err, net.peer_id, net.peers.size(), str(net.hello_sent), str(net.local_ready), str(net.started)])
			if mode == "client" and st == St.PLAYING:
				print("NET client slot=%d pos=%s alive=%s hp=%d snaps=%d tick=%d t=%.1f" % [local_id, str(me.pos), str(me.alive), int(me.hp), net.snaps.size(), net.last_snap_tick, sim.time])
			elif mode == "host":
				var peer_pos := ""
				for pid in net.peers:
					var pp: Dictionary = net.peers[pid]
					if pp.slot >= 0:
						var pu: Sim.Unit = sim.units[pp.slot]
						peer_pos += " peer%d pos=%s alive=%s hp=%d ack=%d" % [pp.slot, str(pu.pos), str(pu.alive), int(pu.hp), pp.ack]
				print("NET host players=%d started=%s peers=%d me=%s%s" % [net.players.size(), str(net.started), net.peers.size(), str(me.pos), peer_pos])
			perf_acc = 0.0
			perf_steps = 0
			perf_t = 0.0


func _menu_bg(dt: float) -> void:
	attract_t += dt
	acc += dt
	var steps := 0
	while acc >= Sim.TICK and steps < 3:
		sim.step(Sim.TICK)
		acc -= Sim.TICK
		steps += 1
	if steps >= 3:
		acc = 0.0
	view.consume(sim.events, -1)
	sim.events.clear()
	view.update_attract(acc / Sim.TICK, dt, attract_t)


func _play(dt: float) -> void:
	var me: Sim.Unit = sim.units[local_id]
	if me.alive and not was_alive:
		look_yaw = me.yaw
		look_pitch = 0.0
		if cfg.warp != "" and mode == "solo":
			var wp: PackedStringArray = str(cfg.warp).split(",")
			me.pos = Vector3(float(wp[0]), 0.0, float(wp[1]))
			me.pos.y = sim.world.height_at(me.pos.x, me.pos.z)
			me.prev_pos = me.pos
			if wp.size() > 2:
				look_yaw = deg_to_rad(float(wp[2]))
				me.yaw = look_yaw
			cfg.warp = ""
	was_alive = me.alive
	if cfg.die and me.alive and me.inv_t < 3.0 and sim.time > 2.0:
		var att: Sim.Unit = sim.units[3 if me.team == 0 else 0]
		att.alive = true
		att.pos = me.pos + Vector3(14, 0, 0)
		att.hp = 61.0
		me.inv_t = 0.0
		sim.damage(me, 999.0, att, true)
		me.respawn_t = 60.0
		cfg.die = false
	hud.show_score = Input.is_key_pressed(KEY_TAB)
	hud.look_yaw = look_yaw
	hud.spec_id = view.spec_id
	view.shake_amt = menu.shake_amt
	var captured: bool = Input.mouse_mode == Input.MOUSE_MODE_CAPTURED or bool(cfg.nomouse)
	hud.captured = captured
	acc += dt
	var steps := 0
	while acc >= Sim.TICK and steps < 4:
		var mv := Vector2.ZERO
		var fire := false
		var jump := false
		var sprint := false
		var ads := false
		if captured:
			mv.x = float(Input.is_key_pressed(KEY_D)) - float(Input.is_key_pressed(KEY_A))
			mv.y = float(Input.is_key_pressed(KEY_W)) - float(Input.is_key_pressed(KEY_S))
			fire = Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)
			jump = Input.is_key_pressed(KEY_SPACE)
			sprint = Input.is_key_pressed(KEY_SHIFT)
			ads = Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT)
		if mode == "client":
			if sim.winner < 0:
				var btn := 0
				if fire:
					btn |= Proto.BTN_FIRE
				if jump:
					btn |= Proto.BTN_JUMP
				if sprint:
					btn |= Proto.BTN_SPRINT
				if reload_edge:
					btn |= Proto.BTN_RELOAD
				if ads:
					btn |= Proto.BTN_ADS
				net.client_tick(sim, mv, look_yaw, look_pitch, btn)
		else:
			sim.set_input(local_id, mv, look_yaw, look_pitch, fire, jump, sprint, reload_edge, ads)
			if mode == "host":
				net.host_apply_inputs(sim)
			var before := sim.events.size()
			var t0 := Time.get_ticks_usec()
			sim.step(Sim.TICK)
			perf_acc += (Time.get_ticks_usec() - t0) / 1000.0
			perf_steps += 1
			if mode == "host":
				net.host_after_step(sim, Sim.TICK, before)
		reload_edge = false
		acc -= Sim.TICK
		steps += 1
	if steps >= 4:
		acc = 0.0
	if mode == "client":
		net.client_frame(sim, dt)
	for e in sim.events:
		if e.t == "cap" and e.o == me.team:
			caps_mine += 1
	if sim.winner >= 0 and not recorded:
		recorded = true
		hud.xp_gain = menu.record_match(me.kills, me.deaths, sim.winner == me.team, caps_mine)
	view.consume(sim.events, local_id)
	hud.consume(sim.events)
	sim.events.clear()
	view.update(acc / Sim.TICK if mode != "client" else clampf(acc / Sim.TICK, 0.0, 1.0), local_id, look_yaw, look_pitch, dt)
	if adaptive:
		_adapt(dt)
