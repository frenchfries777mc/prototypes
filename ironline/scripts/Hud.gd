class_name Hud
extends Control
## 해상도에 독립적인 HUD(기준 720p, 창 크기에 맞춰 배율 적용). 벡터 글꼴이라 확대해도 선명하다.

const COL_A := Color("#6aa2ff")
const COL_B := Color("#ffc84d")
const COL_N := Color("#c9c9c9")
const PANEL := Color(0.05, 0.06, 0.08, 0.62)
const WHITE := Color(1, 1, 1, 0.95)

var sim: Sim
var local_id := 0
var look_yaw := 0.0
var font: Font
var font_b: Font
var feed: Array = []
var indicators: Array = []
var hit_t := 0.0
var head_t := 0.0
var hurt_t := 0.0
var msg := ""
var msg_t := 0.0
var show_score := false
var captured := true
var u := 1.0
var _style := StyleBoxFlat.new()
var _mini: ImageTexture


func setup(s: Sim, id: int) -> void:
	sim = s
	local_id = id
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	font = load("res://assets/fonts/Gothic.ttf")
	font_b = load("res://assets/fonts/GothicBold.ttf")
	_build_minimap()


func _build_minimap() -> void:
	var w := sim.world
	var iw := 180
	var ih := 100
	var img := Image.create(iw, ih, false, Image.FORMAT_RGBA8)
	for y in ih:
		for x in iw:
			var wx := (float(x) / iw - 0.5) * World.HALF_X * 2.0
			var wz := (float(y) / ih - 0.5) * World.HALF_Z * 2.0
			var h := w.height_at(wx, wz)
			var hx := w.height_at(wx + 2.0, wz) - w.height_at(wx - 2.0, wz)
			var hz := w.height_at(wx, wz + 2.0) - w.height_at(wx, wz - 2.0)
			var shade := clampf(0.62 + (-hx * 0.5 - hz * 0.35) * 0.35, 0.3, 1.0)
			var base := Color(0.30, 0.36, 0.20).lerp(Color(0.46, 0.42, 0.26), clampf(h * 0.12 + 0.35, 0.0, 1.0))
			if h < -0.9:
				base = Color(0.20, 0.15, 0.11)
			img.set_pixel(x, y, Color(base.r * shade, base.g * shade, base.b * shade, 1.0))
	_mini = ImageTexture.create_from_image(img)


func _team_col(t: int) -> Color:
	return COL_A if t == 0 else COL_B


func consume(events: Array) -> void:
	var me: Sim.Unit = sim.units[local_id]
	for e in events:
		match e.t:
			"hit":
				if e.a == local_id:
					hit_t = 0.28
					if e.head:
						head_t = 0.28
				if e.v == local_id:
					hurt_t = 0.6
					var att: Sim.Unit = sim.units[e.a]
					var d := att.pos - me.pos
					indicators.append({"ang": atan2(d.x, -d.z), "t": 1.6})
			"kill":
				var k: Sim.Unit = sim.units[e.k]
				var v: Sim.Unit = sim.units[e.v]
				feed.append({"k": k.label, "kt": k.team, "v": v.label, "vt": v.team, "w": Sim.WEAPONS[e.w].name, "head": e.head, "t": 6.0})
				if feed.size() > 6:
					feed.pop_front()
				if e.k == local_id:
					_say("%s 처치%s" % [v.label, "  ·  헤드샷" if e.head else ""], 2.2)
			"cap":
				if e.o >= 0:
					var mine: bool = e.o == me.team
					_say("거점 %d 점령 — %s" % [e.i + 1, "아군" if mine else "적군"], 3.2)
				else:
					_say("거점 %d 중립화" % [e.i + 1], 2.6)


func _say(s: String, t: float) -> void:
	msg = s
	msg_t = t


func _process(dt: float) -> void:
	hit_t = maxf(0.0, hit_t - dt)
	head_t = maxf(0.0, head_t - dt)
	hurt_t = maxf(0.0, hurt_t - dt)
	msg_t = maxf(0.0, msg_t - dt)
	for f in feed:
		f.t -= dt
	while feed.size() > 0 and feed[0].t <= 0.0:
		feed.pop_front()
	var i := indicators.size() - 1
	while i >= 0:
		indicators[i].t -= dt
		if indicators[i].t <= 0.0:
			indicators.remove_at(i)
		i -= 1
	queue_redraw()


# ---------------------------------------------------------------- 그리기 도구

func _panel(r: Rect2, col: Color = PANEL, radius: float = 8.0, border: float = 0.0, bcol: Color = Color(1, 1, 1, 0.12)) -> void:
	_style.bg_color = col
	_style.set_corner_radius_all(int(radius * u))
	_style.set_border_width_all(int(border * u))
	_style.border_color = bcol
	draw_style_box(_style, r)


func _t(pos: Vector2, s: String, sz: float, col: Color = WHITE, bold: bool = false,
		align: int = HORIZONTAL_ALIGNMENT_LEFT, width: float = -1.0) -> void:
	var f := font_b if bold else font
	var px := int(sz * u)
	draw_string(f, pos + Vector2(1.5, 1.8) * u, s, align, width, px, Color(0, 0, 0, 0.7))
	draw_string(f, pos, s, align, width, px, col)


func _draw() -> void:
	if sim == null:
		return
	u = size.y / 720.0
	var W := size.x
	var H := size.y
	var me: Sim.Unit = sim.units[local_id]
	_draw_indicators(W, H, me)
	_draw_objectives(W, me)
	_draw_minimap(me)
	_draw_feed(W)
	if me.alive:
		_draw_crosshair(W, H, me)
		_draw_status(W, H, me)
		_draw_capture_hint(W, H, me)
	else:
		_draw_death(W, H, me)
	if msg_t > 0.0:
		var a := clampf(msg_t / 0.6, 0.0, 1.0)
		_t(Vector2(0, H * 0.23), msg, 24, Color(1, 1, 1, a), true, HORIZONTAL_ALIGNMENT_CENTER, W)
	if show_score:
		_draw_scoreboard(W, H)
	if sim.winner >= 0:
		_draw_end(W, H, me)
	elif not captured:
		_draw_pause(W, H)


func _draw_indicators(W: float, H: float, me: Sim.Unit) -> void:
	var c := Vector2(W, H) * 0.5
	for ind in indicators:
		var rel: float = ind.ang - look_yaw
		var dir := Vector2(sin(rel), -cos(rel))
		var a: float = clampf(ind.t / 1.0, 0.0, 1.0) * 0.85
		var r := 150.0 * u
		var p := c + dir * r
		var perp := Vector2(-dir.y, dir.x)
		var pts := PackedVector2Array([p + dir * 16.0 * u, p - dir * 4.0 * u + perp * 16.0 * u, p - dir * 4.0 * u - perp * 16.0 * u])
		draw_colored_polygon(pts, Color(0.95, 0.15, 0.1, a))


func _draw_objectives(W: float, me: Sim.Unit) -> void:
	var cx := W * 0.5
	var cy := 44.0 * u
	var gap := 66.0 * u
	var rad := 20.0 * u
	# 연결선
	for i in Sim.NPOINTS - 1:
		draw_line(Vector2(cx + (i - 2) * gap + rad, cy), Vector2(cx + (i - 1) * gap - rad, cy), Color(1, 1, 1, 0.25), 2.0 * u)
	for i in Sim.NPOINTS:
		var p: Sim.Pt = sim.pts[i]
		var c := Vector2(cx + (i - 2) * gap, cy)
		var col := COL_N
		if p.owner == 0:
			col = COL_A
		elif p.owner == 1:
			col = COL_B
		draw_circle(c, rad + 3.0 * u, Color(0, 0, 0, 0.55))
		draw_circle(c, rad, col.darkened(0.45))
		if p.owner >= 0:
			draw_circle(c, rad * 0.72, Color(col.r, col.g, col.b, 0.35))
		# 점령 진행 링
		if absf(p.cap) > 0.01 and p.owner != (0 if p.cap > 0.0 else 1):
			var lead := 0 if p.cap > 0.0 else 1
			draw_arc(c, rad + 5.0 * u, -PI * 0.5, -PI * 0.5 + TAU * absf(p.cap), 48, _team_col(lead), 3.5 * u, true)
		if p.n_a > 0 and p.n_b > 0:
			draw_arc(c, rad + 9.0 * u, 0, TAU, 40, Color(1, 0.3, 0.2, 0.5 + 0.4 * sin(Time.get_ticks_msec() * 0.012)), 2.0 * u)
		_t(c + Vector2(-rad, rad * 0.38), str(i + 1), 17, WHITE, true, HORIZONTAL_ALIGNMENT_CENTER, rad * 2.0)
		if i == 0 or i == Sim.NPOINTS - 1:
			_t(c + Vector2(-rad, rad + 17.0 * u), "본진", 11, Color(1, 1, 1, 0.7), false, HORIZONTAL_ALIGNMENT_CENTER, rad * 2.0)
	# 병력 바
	var bw := 150.0 * u
	var bh := 14.0 * u
	var by := cy - bh * 0.5
	var lx := cx - 2.0 * gap - rad - 22.0 * u - bw
	var rx := cx + 2.0 * gap + rad + 22.0 * u
	var fa := clampf(float(sim.tickets[0]) / Sim.START_TICKETS, 0.0, 1.0)
	var fb := clampf(float(sim.tickets[1]) / Sim.START_TICKETS, 0.0, 1.0)
	_panel(Rect2(lx - 4 * u, by - 4 * u, bw + 8 * u, bh + 8 * u), PANEL, 6.0)
	_panel(Rect2(lx + bw * (1.0 - fa), by, bw * fa, bh), COL_A, 4.0)
	_panel(Rect2(rx - 4 * u, by - 4 * u, bw + 8 * u, bh + 8 * u), PANEL, 6.0)
	_panel(Rect2(rx, by, bw * fb, bh), COL_B, 4.0)
	_t(Vector2(lx - 54 * u, cy + 7 * u), str(sim.tickets[0]), 20, COL_A, true, HORIZONTAL_ALIGNMENT_RIGHT, 46 * u)
	_t(Vector2(rx + bw + 10 * u, cy + 7 * u), str(sim.tickets[1]), 20, COL_B, true)
	var rem := maxf(0.0, Sim.MATCH_TIME - sim.time)
	_t(Vector2(0, cy + rad + 36 * u), "%d:%02d" % [int(rem) / 60, int(rem) % 60], 15, Color(1, 1, 1, 0.8), true, HORIZONTAL_ALIGNMENT_CENTER, W)


func _draw_minimap(me: Sim.Unit) -> void:
	var w := 224.0 * u
	var h := w * World.HALF_Z / World.HALF_X
	var o := Vector2(18, 18) * u
	_panel(Rect2(o - Vector2(5, 5) * u, Vector2(w, h) + Vector2(10, 10) * u), Color(0, 0, 0, 0.55), 8.0, 1.0)
	draw_texture_rect(_mini, Rect2(o, Vector2(w, h)), false, Color(1, 1, 1, 0.92))
	var sx := w / (World.HALF_X * 2.0)
	var to_map := func(p: Vector3) -> Vector2: return o + Vector2((p.x + World.HALF_X) * sx, (p.z + World.HALF_Z) * sx)
	for i in Sim.NPOINTS:
		var p: Sim.Pt = sim.pts[i]
		var c := COL_N
		if p.owner == 0:
			c = COL_A
		elif p.owner == 1:
			c = COL_B
		var q: Vector2 = to_map.call(p.pos)
		draw_circle(q, 7.0 * u, Color(0, 0, 0, 0.6))
		draw_circle(q, 5.5 * u, c)
		_t(q + Vector2(-8, 4.5) * u, str(i + 1), 10, Color(0, 0, 0, 0.9), true, HORIZONTAL_ALIGNMENT_CENTER, 16 * u)
	for e in sim.units:
		if not e.alive or (e.team != me.team):
			continue
		var q2: Vector2 = to_map.call(e.pos)
		if e.id == local_id:
			var dir := Vector2(-sin(e.yaw), -cos(e.yaw))
			var perp := Vector2(-dir.y, dir.x)
			draw_colored_polygon(PackedVector2Array([q2 + dir * 8.0 * u, q2 - dir * 4.0 * u + perp * 5.0 * u, q2 - dir * 4.0 * u - perp * 5.0 * u]), Color.WHITE)
		else:
			draw_circle(q2, 1.8 * u, _team_col(e.team))


func _draw_feed(W: float) -> void:
	var y := 20.0 * u
	for f in feed:
		var a := clampf(f.t / 1.0, 0.0, 1.0)
		var txt_w := 230.0 * u
		_panel(Rect2(W - txt_w - 20 * u, y - 2 * u, txt_w, 24 * u), Color(0.04, 0.05, 0.07, 0.55 * a), 6.0)
		var kc := _team_col(f.kt)
		var vc := _team_col(f.vt)
		_t(Vector2(W - txt_w - 12 * u, y + 15 * u), f.k, 13, Color(kc.r, kc.g, kc.b, a), true)
		_t(Vector2(W - txt_w + 52 * u, y + 15 * u), "›  " + f.v + ("  ◆" if f.head else ""), 13, Color(vc.r, vc.g, vc.b, a), true)
		y += 28.0 * u


func _draw_crosshair(W: float, H: float, me: Sim.Unit) -> void:
	var c := Vector2(W, H) * 0.5
	var col := WHITE
	if head_t > 0.0:
		col = Color(1.0, 0.3, 0.22)
	elif hit_t > 0.0:
		col = Color(1.0, 0.9, 0.35)
	var gap := (5.0 + me.speed_now * 1.3 + (4.0 if me.fire_cd > 0.05 else 0.0)) * u
	var ln := 9.0 * u
	for d in [Vector2(-1, 0), Vector2(1, 0), Vector2(0, -1), Vector2(0, 1)]:
		draw_line(c + d * gap, c + d * (gap + ln), Color(0, 0, 0, 0.6), 4.0 * u)
		draw_line(c + d * gap, c + d * (gap + ln), col, 2.0 * u)
	draw_circle(c, 1.6 * u, col)
	if hit_t > 0.0:
		var k := hit_t / 0.28
		for d in [Vector2(-1, -1), Vector2(1, -1), Vector2(-1, 1), Vector2(1, 1)]:
			draw_line(c + d * (10.0 + 4.0 * (1.0 - k)) * u, c + d * (18.0 + 4.0 * (1.0 - k)) * u, Color(col.r, col.g, col.b, k), 2.5 * u)


func _draw_status(W: float, H: float, me: Sim.Unit) -> void:
	var w: Dictionary = Sim.WEAPONS[me.weapon]
	# 체력
	var pr := Rect2(24 * u, H - 86 * u, 280 * u, 62 * u)
	_panel(pr, PANEL, 10.0)
	var f := clampf(me.hp / 100.0, 0.0, 1.0)
	var hc := Color(0.5, 0.88, 0.42) if f > 0.5 else (Color(0.95, 0.76, 0.28) if f > 0.25 else Color(0.95, 0.32, 0.26))
	_t(pr.position + Vector2(16, 40) * u, str(ceili(me.hp)), 34, WHITE, true)
	_t(pr.position + Vector2(86, 22) * u, "체력", 11, Color(1, 1, 1, 0.6))
	_panel(Rect2(pr.position + Vector2(86, 30) * u, Vector2(176 * u, 10 * u)), Color(1, 1, 1, 0.12), 5.0)
	_panel(Rect2(pr.position + Vector2(86, 30) * u, Vector2(176 * u * f, 10 * u)), hc, 5.0)
	# 탄약
	var ar := Rect2(W - 24 * u - 280 * u, H - 86 * u, 280 * u, 62 * u)
	_panel(ar, PANEL, 10.0)
	var ammo_col := WHITE if me.ammo > 0 else Color(1, 0.4, 0.32)
	if me.reload_t > 0.0:
		_t(ar.position + Vector2(16, 40) * u, "장전 중", 22, Color(1, 1, 1, 0.8), true)
		var rf: float = 1.0 - me.reload_t / w.reload
		_panel(Rect2(ar.position + Vector2(16, 48) * u, Vector2(248 * u * rf, 4 * u)), Color(1, 1, 1, 0.7), 2.0)
	else:
		_t(ar.position + Vector2(16, 42) * u, str(me.ammo), 38, ammo_col, true)
		_t(ar.position + Vector2(86, 42) * u, "/ %d" % w.mag, 18, Color(1, 1, 1, 0.55))
	_t(Vector2(ar.position.x, ar.position.y + 28 * u), w.name, 13, Color(1, 1, 1, 0.75), false, HORIZONTAL_ALIGNMENT_RIGHT, ar.size.x - 16 * u)
	_t(Vector2(ar.position.x, ar.position.y + 48 * u), "1  소총   2  기관단총   3  경기관총", 10, Color(1, 1, 1, 0.38), false, HORIZONTAL_ALIGNMENT_RIGHT, ar.size.x - 16 * u)


func _draw_capture_hint(W: float, H: float, me: Sim.Unit) -> void:
	for i in Sim.NPOINTS:
		var p: Sim.Pt = sim.pts[i]
		var dx := me.pos.x - p.pos.x
		var dz := me.pos.z - p.pos.z
		if dx * dx + dz * dz < World.POINT_R * World.POINT_R:
			var rw := 360.0 * u
			var r := Rect2((W - rw) * 0.5, H - 130 * u, rw, 54 * u)
			_panel(r, PANEL, 10.0)
			var mine := p.n_a if me.team == 0 else p.n_b
			var theirs := p.n_b if me.team == 0 else p.n_a
			var s := "거점 %d   아군 %d  :  적 %d" % [i + 1, mine, theirs]
			_t(r.position + Vector2(0, 22 * u), s, 15, WHITE, true, HORIZONTAL_ALIGNMENT_CENTER, rw)
			var f := (p.cap + 1.0) * 0.5
			var bx := r.position + Vector2(18, 34) * u
			var bw := rw - 36 * u
			_panel(Rect2(bx, Vector2(bw, 8 * u)), Color(1, 1, 1, 0.12), 4.0)
			_panel(Rect2(bx, Vector2(bw * f, 8 * u)), COL_A, 4.0)
			draw_rect(Rect2(bx + Vector2(bw * f, 0), Vector2(bw * (1.0 - f), 8 * u)), COL_B)
			if not sim._eligible(me.team, i) and p.owner != me.team:
				_t(Vector2(0, r.position.y - 8 * u), "앞쪽 거점을 먼저 점령해야 합니다", 13, Color(1, 0.8, 0.5), true, HORIZONTAL_ALIGNMENT_CENTER, W)
			return


func _draw_death(W: float, H: float, me: Sim.Unit) -> void:
	draw_rect(Rect2(0, 0, W, H), Color(0, 0, 0, 0.45))
	_t(Vector2(0, H * 0.36), "전사", 46, Color(0.95, 0.4, 0.34), true, HORIZONTAL_ALIGNMENT_CENTER, W)
	if sim.tickets[me.team] > 0:
		_t(Vector2(0, H * 0.36 + 40 * u), "%d초 후 재투입" % ceili(maxf(0.0, me.respawn_t)), 18, WHITE, false, HORIZONTAL_ALIGNMENT_CENTER, W)
		var cw := 160.0 * u
		var x0 := W * 0.5 - cw * 1.5 - 12 * u
		for k in 3:
			var wp: Dictionary = Sim.WEAPONS[k]
			var r := Rect2(x0 + k * (cw + 12 * u), H * 0.36 + 70 * u, cw, 88 * u)
			var sel := me.loadout == k
			_panel(r, Color(0.2, 0.3, 0.5, 0.75) if sel else PANEL, 10.0, 2.0 if sel else 0.0, Color(0.5, 0.75, 1.0, 0.9))
			_t(r.position + Vector2(12, 24) * u, "%d" % (k + 1), 20, Color(1, 1, 1, 0.5), true)
			_t(r.position + Vector2(40, 24) * u, wp.name, 15, WHITE, true)
			_t(r.position + Vector2(12, 50) * u, "피해 %d   장탄 %d" % [int(wp.dmg), wp.mag], 12, Color(1, 1, 1, 0.65))
			_t(r.position + Vector2(12, 70) * u, "연사 %.1f/초" % (1.0 / wp.cd), 12, Color(1, 1, 1, 0.65))


func _draw_scoreboard(W: float, H: float) -> void:
	var pw := 640.0 * u
	var r := Rect2((W - pw) * 0.5, 130 * u, pw, 420 * u)
	_panel(r, Color(0.03, 0.04, 0.06, 0.85), 12.0, 1.0)
	for t in 2:
		var x0 := r.position.x + 20 * u + t * (pw * 0.5)
		var col := _team_col(t)
		_t(Vector2(x0, r.position.y + 34 * u), "A팀" if t == 0 else "B팀", 20, col, true)
		_t(Vector2(x0 + 120 * u, r.position.y + 34 * u), "점령 %d   병력 %d" % [sim.owned_count(t), sim.tickets[t]], 13, Color(1, 1, 1, 0.7))
		var list: Array = []
		for e in sim.units:
			if e.team == t:
				list.append(e)
		list.sort_custom(func(a, b): return a.kills > b.kills)
		_t(Vector2(x0, r.position.y + 62 * u), "이름", 11, Color(1, 1, 1, 0.5))
		_t(Vector2(x0 + 150 * u, r.position.y + 62 * u), "킬", 11, Color(1, 1, 1, 0.5))
		_t(Vector2(x0 + 200 * u, r.position.y + 62 * u), "데스", 11, Color(1, 1, 1, 0.5))
		for k in mini(14, list.size()):
			var e: Sim.Unit = list[k]
			var y := r.position.y + 84 * u + k * 22 * u
			var c := Color.WHITE if e.id == local_id else (col if e.alive else Color(col.r, col.g, col.b, 0.45))
			if not e.is_bot:
				_panel(Rect2(x0 - 6 * u, y - 15 * u, 250 * u, 20 * u), Color(1, 1, 1, 0.08), 4.0)
			_t(Vector2(x0, y), e.label + ("" if e.is_bot else "  (사람)"), 13, c, not e.is_bot)
			_t(Vector2(x0 + 150 * u, y), str(e.kills), 13, c)
			_t(Vector2(x0 + 200 * u, y), str(e.deaths), 13, c)


func _draw_end(W: float, H: float, me: Sim.Unit) -> void:
	draw_rect(Rect2(0, 0, W, H), Color(0, 0, 0, 0.6))
	var res := "무승부"
	var col := WHITE
	if sim.winner < 2:
		var win: bool = sim.winner == me.team
		res = "승리" if win else "패배"
		col = Color(0.55, 0.95, 0.55) if win else Color(0.95, 0.4, 0.34)
	_t(Vector2(0, H * 0.38), res, 72, col, true, HORIZONTAL_ALIGNMENT_CENTER, W)
	_t(Vector2(0, H * 0.38 + 44 * u), sim.win_reason, 20, WHITE, false, HORIZONTAL_ALIGNMENT_CENTER, W)
	_t(Vector2(0, H * 0.38 + 86 * u), "Enter 키로 다시 시작", 15, Color(1, 1, 1, 0.65), false, HORIZONTAL_ALIGNMENT_CENTER, W)


func _draw_pause(W: float, H: float) -> void:
	draw_rect(Rect2(0, 0, W, H), Color(0.02, 0.03, 0.04, 0.55))
	_t(Vector2(0, H * 0.34), "IRONLINE", 64, WHITE, true, HORIZONTAL_ALIGNMENT_CENTER, W)
	_t(Vector2(0, H * 0.34 + 34 * u), "전선 점령전  ·  3 vs 3  +  봇 대부대", 16, Color(1, 1, 1, 0.65), false, HORIZONTAL_ALIGNMENT_CENTER, W)
	var r := Rect2((W - 260 * u) * 0.5, H * 0.34 + 70 * u, 260 * u, 46 * u)
	_panel(r, Color(0.25, 0.42, 0.75, 0.9), 10.0)
	_t(r.position + Vector2(0, 30 * u), "클릭해서 플레이", 18, WHITE, true, HORIZONTAL_ALIGNMENT_CENTER, r.size.x)
	_t(Vector2(0, H * 0.34 + 150 * u), "WASD 이동   Shift 달리기   Space 점프   좌클릭 사격   R 장전   Tab 점수   Esc 마우스 해제", 13, Color(1, 1, 1, 0.55), false, HORIZONTAL_ALIGNMENT_CENTER, W)
