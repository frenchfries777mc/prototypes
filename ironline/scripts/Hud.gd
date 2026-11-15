class_name Hud
extends Control
## 640x360 저해상도 화면 위에 도트 글꼴로 그리는 HUD.

const COL_A := Color("#79a4e8")
const COL_B := Color("#e8c865")
const COL_N := Color("#b4b4b4")

var sim: Sim
var local_id := 0
var font: Font
var feed: Array = []
var hit_t := 0.0
var head_t := 0.0
var hurt_t := 0.0
var msg := ""
var msg_t := 0.0
var show_score := false
var captured := true
var spawn_kick := 0.0


func setup(s: Sim, id: int) -> void:
	sim = s
	local_id = id
	position = Vector2.ZERO
	size = Vector2(640, 360)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	if ResourceLoader.exists("res://assets/fonts/Galmuri11.ttf"):
		font = load("res://assets/fonts/Galmuri11.ttf")
		if font is FontFile:
			font.antialiasing = TextServer.FONT_ANTIALIASING_NONE
			font.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_DISABLED
			font.hinting = TextServer.HINTING_NONE
	if font == null:
		font = ThemeDB.fallback_font


func _team_col(t: int) -> Color:
	return COL_A if t == 0 else COL_B


func consume(events: Array) -> void:
	var me: Sim.Unit = sim.units[local_id]
	for e in events:
		match e.t:
			"hit":
				if e.a == local_id:
					hit_t = 0.25
					if e.head:
						head_t = 0.25
				if e.v == local_id:
					hurt_t = 0.45
			"kill":
				var k: Sim.Unit = sim.units[e.k]
				var v: Sim.Unit = sim.units[e.v]
				feed.append({"k": k.label, "kt": k.team, "v": v.label, "vt": v.team, "w": e.w, "head": e.head, "t": 6.0})
				if feed.size() > 6:
					feed.pop_front()
				if e.k == local_id:
					_say("%s 처치%s" % [v.label, " (헤드샷)" if e.head else ""], 2.0)
			"cap":
				var side := "아군" if e.o == me.team else ("적군" if e.o >= 0 else "")
				if e.o >= 0:
					_say("거점 %d 점령 — %s" % [e.i + 1, side], 3.0)
				else:
					_say("거점 %d 중립화" % [e.i + 1], 2.5)
			"end":
				pass


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
	queue_redraw()


func _txt(pos: Vector2, s: String, col: Color, size: int = 11, align: int = HORIZONTAL_ALIGNMENT_LEFT, width: float = -1.0) -> void:
	draw_string(font, pos + Vector2(1, 1), s, align, width, size, Color(0, 0, 0, 0.85))
	draw_string(font, pos, s, align, width, size, col)


func _draw() -> void:
	if sim == null:
		return
	var W := size.x
	var H := size.y
	var me: Sim.Unit = sim.units[local_id]
	# 피격 붉은 테두리
	if hurt_t > 0.0:
		var a := hurt_t / 0.45 * 0.35
		draw_rect(Rect2(0, 0, W, 10), Color(0.8, 0.05, 0.05, a))
		draw_rect(Rect2(0, H - 10, W, 10), Color(0.8, 0.05, 0.05, a))
		draw_rect(Rect2(0, 0, 10, H), Color(0.8, 0.05, 0.05, a))
		draw_rect(Rect2(W - 10, 0, 10, H), Color(0.8, 0.05, 0.05, a))
	_draw_objectives(W, me)
	_draw_minimap(me)
	_draw_feed(W)
	if me.alive:
		_draw_crosshair(W, H)
		_draw_status(W, H, me)
		_draw_capture_hint(W, H, me)
	else:
		draw_rect(Rect2(0, 0, W, H), Color(0, 0, 0, 0.35))
		var left := ceili(maxf(0.0, me.respawn_t))
		_txt(Vector2(0, H * 0.45), "전사", Color(0.95, 0.4, 0.35), 22, HORIZONTAL_ALIGNMENT_CENTER, W)
		if sim.tickets[me.team] > 0:
			_txt(Vector2(0, H * 0.45 + 22), "%d초 후 재투입" % left, Color.WHITE, 11, HORIZONTAL_ALIGNMENT_CENTER, W)
			_txt(Vector2(0, H * 0.45 + 38), "1 소총   2 기관단총   3 경기관총", Color(0.8, 0.8, 0.8), 11, HORIZONTAL_ALIGNMENT_CENTER, W)
	if msg_t > 0.0:
		_txt(Vector2(0, H * 0.26), msg, Color.WHITE, 11, HORIZONTAL_ALIGNMENT_CENTER, W)
	if show_score:
		_draw_scoreboard(W, H)
	if sim.winner >= 0:
		draw_rect(Rect2(0, 0, W, H), Color(0, 0, 0, 0.55))
		var res := "무승부"
		var col := Color.WHITE
		if sim.winner < 2:
			res = "승리" if sim.winner == me.team else "패배"
			col = Color(0.5, 0.95, 0.5) if sim.winner == me.team else Color(0.95, 0.4, 0.35)
		_txt(Vector2(0, H * 0.38), res, col, 28, HORIZONTAL_ALIGNMENT_CENTER, W)
		_txt(Vector2(0, H * 0.38 + 26), sim.win_reason, Color.WHITE, 11, HORIZONTAL_ALIGNMENT_CENTER, W)
		_txt(Vector2(0, H * 0.38 + 46), "Enter 키로 다시 시작", Color(0.8, 0.8, 0.8), 11, HORIZONTAL_ALIGNMENT_CENTER, W)
	if not captured and sim.winner < 0:
		draw_rect(Rect2(0, 0, W, H), Color(0, 0, 0, 0.5))
		_txt(Vector2(0, H * 0.42), "클릭해서 플레이", Color.WHITE, 16, HORIZONTAL_ALIGNMENT_CENTER, W)
		_txt(Vector2(0, H * 0.42 + 24), "WASD 이동 · Shift 달리기 · Space 점프 · 좌클릭 사격 · R 장전 · Tab 점수", Color(0.85, 0.85, 0.85), 11, HORIZONTAL_ALIGNMENT_CENTER, W)


func _draw_objectives(W: float, me: Sim.Unit) -> void:
	var bw := 26.0
	var gap := 6.0
	var total := Sim.NPOINTS * bw + (Sim.NPOINTS - 1) * gap
	var x0 := (W - total) * 0.5
	var y := 6.0
	for i in Sim.NPOINTS:
		var p: Sim.Pt = sim.pts[i]
		var x := x0 + i * (bw + gap)
		var col := COL_N
		if p.owner == 0:
			col = COL_A
		elif p.owner == 1:
			col = COL_B
		draw_rect(Rect2(x - 1, y - 1, bw + 2, 18), Color(0, 0, 0, 0.7))
		draw_rect(Rect2(x, y, bw, 16), col.darkened(0.35))
		if p.n_a > 0 and p.n_b > 0:
			draw_rect(Rect2(x, y, bw, 16), Color(1, 0.3, 0.2, 0.35 + 0.25 * sin(Time.get_ticks_msec() * 0.012)))
		_txt(Vector2(x, y + 12), str(i + 1), Color.WHITE, 11, HORIZONTAL_ALIGNMENT_CENTER, bw)
		# 점령 진행 막대 (왼쪽=A, 오른쪽=B)
		draw_rect(Rect2(x, y + 19, bw, 3), Color(0, 0, 0, 0.7))
		var f := (p.cap + 1.0) * 0.5
		draw_rect(Rect2(x, y + 19, bw * f, 3), COL_A)
		draw_rect(Rect2(x + bw * f, y + 19, bw * (1.0 - f), 3), COL_B)
		if i == 0 or i == Sim.NPOINTS - 1:
			_txt(Vector2(x, y + 34), "본진", Color(0.85, 0.85, 0.85), 11, HORIZONTAL_ALIGNMENT_CENTER, bw)
	_txt(Vector2(x0 - 78, y + 12), "%d" % sim.tickets[0], COL_A, 11, HORIZONTAL_ALIGNMENT_RIGHT, 70)
	_txt(Vector2(x0 + total + 8, y + 12), "%d" % sim.tickets[1], COL_B, 11)
	var rem := maxf(0.0, Sim.MATCH_TIME - sim.time)
	_txt(Vector2(0, y + 44), "%d:%02d" % [int(rem) / 60, int(rem) % 60], Color(0.85, 0.85, 0.85), 11, HORIZONTAL_ALIGNMENT_CENTER, W)


func _draw_minimap(me: Sim.Unit) -> void:
	var s := 0.28
	var w := World.HALF_X * 2.0 * s
	var h := World.HALF_Z * 2.0 * s
	var o := Vector2(6, 6)
	draw_rect(Rect2(o - Vector2(1, 1), Vector2(w + 2, h + 2)), Color(0, 0, 0, 0.7))
	draw_rect(Rect2(o, Vector2(w, h)), Color(0.18, 0.2, 0.14, 0.75))
	for i in Sim.NPOINTS:
		var p: Sim.Pt = sim.pts[i]
		var c := COL_N
		if p.owner == 0:
			c = COL_A
		elif p.owner == 1:
			c = COL_B
		var q := o + Vector2((p.pos.x + World.HALF_X) * s, (p.pos.z + World.HALF_Z) * s)
		draw_rect(Rect2(q - Vector2(3, 3), Vector2(6, 6)), c)
	for u in sim.units:
		if not u.alive:
			continue
		if u.team != me.team and u.id != local_id:
			continue
		var q := o + Vector2((u.pos.x + World.HALF_X) * s, (u.pos.z + World.HALF_Z) * s)
		if u.id == local_id:
			var dir := Vector2(-sin(u.yaw), -cos(u.yaw))
			draw_line(q, q + dir * 7.0, Color.WHITE, 1.0)
			draw_rect(Rect2(q - Vector2(1.5, 1.5), Vector2(3, 3)), Color.WHITE)
		else:
			draw_rect(Rect2(q - Vector2(0.5, 0.5), Vector2(1.5, 1.5)), _team_col(u.team))


func _draw_feed(W: float) -> void:
	var y := 8.0
	for f in feed:
		var line := "%s  ›  %s%s" % [f.k, f.v, " ✕" if f.head else ""]
		_txt(Vector2(W - 8 - 170, y + 10), "", Color.WHITE)
		var kc := _team_col(f.kt)
		_txt(Vector2(W - 178, y + 10), f.k, kc, 11, HORIZONTAL_ALIGNMENT_RIGHT, 70)
		_txt(Vector2(W - 104, y + 10), "›", Color(0.85, 0.85, 0.85), 11)
		_txt(Vector2(W - 94, y + 10), f.v + (" ✕" if f.head else ""), _team_col(f.vt), 11)
		y += 13.0


func _draw_crosshair(W: float, H: float) -> void:
	var c := Vector2(W, H) * 0.5
	var col := Color(1, 1, 1, 0.9)
	if head_t > 0.0:
		col = Color(1.0, 0.35, 0.25)
	elif hit_t > 0.0:
		col = Color(1.0, 0.9, 0.3)
	for d in [Vector2(-1, 0), Vector2(1, 0), Vector2(0, -1), Vector2(0, 1)]:
		draw_line(c + d * 3.0, c + d * 7.0, Color(0, 0, 0, 0.8), 3.0)
		draw_line(c + d * 3.0, c + d * 7.0, col, 1.0)
	if hit_t > 0.0:
		for d in [Vector2(-1, -1), Vector2(1, -1), Vector2(-1, 1), Vector2(1, 1)]:
			draw_line(c + d * 5.0, c + d * 10.0, col, 1.0)


func _draw_status(W: float, H: float, me: Sim.Unit) -> void:
	var w: Dictionary = Sim.WEAPONS[me.weapon]
	var bx := 10.0
	var by := H - 20.0
	draw_rect(Rect2(bx - 1, by - 1, 102, 10), Color(0, 0, 0, 0.7))
	var f := clampf(me.hp / 100.0, 0.0, 1.0)
	var hc := Color(0.45, 0.85, 0.4) if f > 0.5 else (Color(0.9, 0.75, 0.25) if f > 0.25 else Color(0.9, 0.3, 0.25))
	draw_rect(Rect2(bx, by, 100.0 * f, 8), hc)
	_txt(Vector2(bx, by - 4), "체력 %d" % ceili(me.hp), Color.WHITE)
	var ammo := "장전 중" if me.reload_t > 0.0 else "%d / %d" % [me.ammo, w.mag]
	_txt(Vector2(0, H - 22), ammo, Color.WHITE if me.ammo > 0 else Color(1, 0.4, 0.3), 16, HORIZONTAL_ALIGNMENT_RIGHT, W - 12)
	_txt(Vector2(0, H - 8), w.name, Color(0.85, 0.85, 0.85), 11, HORIZONTAL_ALIGNMENT_RIGHT, W - 12)


func _draw_capture_hint(W: float, H: float, me: Sim.Unit) -> void:
	for i in Sim.NPOINTS:
		var p: Sim.Pt = sim.pts[i]
		var dx := me.pos.x - p.pos.x
		var dz := me.pos.z - p.pos.z
		if dx * dx + dz * dz < World.POINT_R * World.POINT_R:
			var s := "거점 %d  %d vs %d" % [i + 1, p.n_a if me.team == 0 else p.n_b, p.n_b if me.team == 0 else p.n_a]
			if not sim._eligible(me.team, i) and p.owner != me.team:
				s += "  (앞 거점을 먼저 점령하세요)"
			_txt(Vector2(0, H - 52), s, Color.WHITE, 11, HORIZONTAL_ALIGNMENT_CENTER, W)
			return


func _draw_scoreboard(W: float, H: float) -> void:
	draw_rect(Rect2(W * 0.5 - 150, 70, 300, 200), Color(0, 0, 0, 0.75))
	var list: Array = sim.units.duplicate()
	list.sort_custom(func(a, b): return a.kills > b.kills)
	var y := 86.0
	_txt(Vector2(W * 0.5 - 140, y), "이름      팀   킬   데스", Color(0.8, 0.8, 0.8))
	y += 14.0
	for k in mini(12, list.size()):
		var u: Sim.Unit = list[k]
		var col := _team_col(u.team)
		if u.id == local_id:
			col = Color.WHITE
		_txt(Vector2(W * 0.5 - 140, y), "%s" % u.label, col)
		_txt(Vector2(W * 0.5 - 70, y), "A" if u.team == 0 else "B", col)
		_txt(Vector2(W * 0.5 - 30, y), "%d" % u.kills, col)
		_txt(Vector2(W * 0.5 + 20, y), "%d" % u.deaths, col)
		y += 13.0
