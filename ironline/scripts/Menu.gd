class_name Menu
extends Control
## 로비/메뉴 — 군용 포스터풍 디자인.
##  홈: 계급·전적 카드 / 출격·빠른 대전·방 만들기·참가 / 병과 선택 카드 / 작전 브리핑
##  대기실: 방 코드, 진영별 참가자, 진영 변경, 방장은 [게임 시작]
## 배경은 살아 움직이는 3D 전장이고, 이 UI 는 그 위에 얹힌다.

signal play_solo
signal quick_match
signal host_room
signal join_room(code: String)
signal start_match
signal leave_room
signal team_chosen(team: int)
signal settings_changed

const INK := Color("#0b0d0f")
const STEEL := Color("#171c21")
const STEEL2 := Color("#222a31")
const OLIVE := Color("#5b6b34")
const OLIVE_HI := Color("#7d9142")
const KHAKI := Color("#cdbd8c")
const BRASS := Color("#c39a45")
const RED := Color("#c9382d")
const PAPER := Color("#ece3cb")
const COL_A := Color("#6aa2ff")
const COL_B := Color("#ffc84d")
const SAVE := "user://ironline.cfg"
const RANKS := ["이병", "일병", "상병", "병장", "하사", "중사", "상사", "소위", "중위", "대위", "소령", "중령", "대령"]
const RANK_XP := [0, 100, 260, 480, 760, 1100, 1550, 2100, 2800, 3600, 4600, 5800, 7400]
const TIPS := [
	"거점은 순서대로만 점령할 수 있습니다. 앞쪽 거점을 먼저 확보하세요.",
	"참호 안에서는 봇의 시야가 막힙니다. 널빤지를 따라 측면으로 접근해 보세요.",
	"창문은 총알이 통과합니다. 폐가를 거점 방어에 활용하세요.",
	"볼트액션 소총은 머리를 맞히면 한 방입니다. 호흡을 가다듬고 우클릭으로 조준하세요.",
	"경기관총은 장전이 깁니다. 엄폐물 뒤에서 탄창을 비우고 다시 숨으세요.",
	"거점 안에 아군이 많을수록 점령이 빨라집니다. 혼자 들어가지 마세요.",
]

var font: Font
var font_b: Font
var font_st: Font
var font_cd: Font
var screen := "home"
var player_name := "병사"
var quality := 3
var bots := 30
var sens := 1.0
var shake_amt := 0.5
var pref_team := -1
var loadout := 0
var multi_ok := false
var stats := {"matches": 0, "wins": 0, "kills": 0, "deaths": 0, "xp": 0}
var map_tex: Texture2D
var tip_i := 0
var tip_t := 0.0

var deco: Control
var home_ui: Control
var lobby_ui: Control
var load_ui: Control
var settings_ui: Control
var toast_lbl: Label
var toast_t := 0.0
var name_edit: LineEdit
var code_edit: LineEdit
var q_opt: OptionButton
var bots_slider: HSlider
var bots_lbl: Label
var sens_slider: HSlider
var team_btns: Array = []
var cards: Array = []
var lobby_code: Label
var lobby_link: Label
var lobby_list: VBoxContainer
var lobby_hint: Label
var lobby_title: Label
var start_btn: Button
var load_lbl: Label
var player_card: Control
var brief: Control
var tip_lbl: Label
var note_lbl: Label
var quick_btn: Button
var host_btn: Button
var join_btn: Button


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_PASS
	font = load("res://assets/fonts/Gothic.ttf")
	font_b = load("res://assets/fonts/GothicBold.ttf")
	font_st = load("res://assets/fonts/Stencil.ttf")
	font_cd = load("res://assets/fonts/Condensed.ttf")
	# 라틴 전용 표시 글꼴은 한글을 한글 글꼴로 대체한다
	if font_st is FontFile:
		font_st.fallbacks = [font_b]
	if font_cd is FontFile:
		font_cd.fallbacks = [font_b]
	_load_settings()
	var th := Theme.new()
	th.default_font = font
	th.default_font_size = 16
	th.set_color("font_color", "Label", PAPER)
	th.set_color("font_color", "LineEdit", PAPER)
	th.set_color("font_placeholder_color", "LineEdit", Color(1, 1, 1, 0.3))
	th.set_stylebox("normal", "LineEdit", _flat(Color(0, 0, 0, 0.45), KHAKI * Color(1, 1, 1, 0.35), 1, 0))
	th.set_stylebox("focus", "LineEdit", _flat(Color(0, 0, 0, 0.55), BRASS, 2, 0))
	th.set_stylebox("normal", "OptionButton", _flat(STEEL2, KHAKI * Color(1, 1, 1, 0.3), 1, 0))
	th.set_stylebox("hover", "OptionButton", _flat(STEEL2.lightened(0.1), BRASS, 1, 0))
	th.set_stylebox("pressed", "OptionButton", _flat(STEEL2, BRASS, 1, 0))
	th.set_color("font_color", "OptionButton", PAPER)
	theme = th
	deco = Control.new()
	deco.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	deco.mouse_filter = Control.MOUSE_FILTER_IGNORE
	deco.draw.connect(_draw_deco)
	add_child(deco)
	_build_home()
	_build_lobby()
	_build_settings()
	_build_loading()
	_build_toast()
	show_home()


func _process(dt: float) -> void:
	if toast_t > 0.0:
		toast_t -= dt
		toast_lbl.modulate.a = clampf(toast_t / 0.5, 0.0, 1.0)
		if toast_t <= 0.0:
			toast_lbl.visible = false
	tip_t += dt
	if tip_t > 8.0:
		tip_t = 0.0
		tip_i = (tip_i + 1) % TIPS.size()
		if tip_lbl:
			tip_lbl.text = TIPS[tip_i]
	if visible:
		deco.queue_redraw()


# ---------------------------------------------------------------- 저장/전적

func _load_settings() -> void:
	var c := ConfigFile.new()
	if c.load(SAVE) == OK:
		player_name = str(c.get_value("p", "name", player_name))
		quality = int(c.get_value("p", "q", quality))
		bots = int(c.get_value("p", "bots", bots))
		sens = float(c.get_value("p", "sens", sens))
		shake_amt = float(c.get_value("p", "shake", shake_amt))
		pref_team = int(c.get_value("p", "team", pref_team))
		loadout = int(c.get_value("p", "loadout", loadout))
		for k in stats:
			stats[k] = int(c.get_value("stats", k, 0))
	else:
		player_name = "병사%d" % (randi() % 900 + 100)


func save_settings() -> void:
	var c := ConfigFile.new()
	c.set_value("p", "name", player_name)
	c.set_value("p", "q", quality)
	c.set_value("p", "bots", bots)
	c.set_value("p", "sens", sens)
	c.set_value("p", "shake", shake_amt)
	c.set_value("p", "team", pref_team)
	c.set_value("p", "loadout", loadout)
	for k in stats:
		c.set_value("stats", k, stats[k])
	c.save(SAVE)


func rank_index() -> int:
	var r := 0
	for i in RANK_XP.size():
		if stats.xp >= RANK_XP[i]:
			r = i
	return r


## 경기 결과를 전적/경험치에 반영하고 얻은 경험치를 돌려준다.
func record_match(kills: int, deaths: int, won: bool, caps: int) -> int:
	var gain := kills * 10 + caps * 25 + (90 if won else 25)
	stats.matches += 1
	stats.kills += kills
	stats.deaths += deaths
	if won:
		stats.wins += 1
	stats.xp += gain
	save_settings()
	player_card.queue_redraw()
	return gain


# ---------------------------------------------------------------- 스타일 도구

func _flat(bg: Color, border: Color = Color(0, 0, 0, 0), bw: int = 0, left_bar: int = 0) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(bw)
	if left_bar > 0:
		s.border_width_left = left_bar
	s.set_corner_radius_all(0)
	s.content_margin_left = 18
	s.content_margin_right = 18
	s.content_margin_top = 10
	s.content_margin_bottom = 10
	return s


func _label(text: String, size: int = 16, col: Color = PAPER, f: Font = null) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", col)
	l.add_theme_font_override("font", f if f else font)
	return l


func _button(text: String, kind: String = "normal", size: int = 18) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	b.alignment = HORIZONTAL_ALIGNMENT_LEFT
	b.add_theme_font_override("font", font_cd)
	b.add_theme_font_size_override("font_size", size)
	b.add_theme_color_override("font_color", PAPER)
	b.add_theme_color_override("font_hover_color", Color.WHITE)
	b.add_theme_color_override("font_disabled_color", Color(1, 1, 1, 0.25))
	match kind:
		"primary":
			b.custom_minimum_size = Vector2(0, 64)
			b.add_theme_font_override("font", font_st)
			b.add_theme_font_size_override("font_size", 26)
			b.add_theme_stylebox_override("normal", _flat(OLIVE, BRASS, 2, 8))
			b.add_theme_stylebox_override("hover", _flat(OLIVE_HI, KHAKI, 2, 8))
			b.add_theme_stylebox_override("pressed", _flat(OLIVE.darkened(0.2), BRASS, 2, 8))
			b.add_theme_stylebox_override("disabled", _flat(STEEL, Color(1, 1, 1, 0.1), 1, 8))
		"danger":
			b.custom_minimum_size = Vector2(0, 44)
			b.add_theme_stylebox_override("normal", _flat(Color(0.3, 0.08, 0.07, 0.9), RED, 1, 6))
			b.add_theme_stylebox_override("hover", _flat(Color(0.45, 0.1, 0.09, 0.95), RED, 1, 6))
		_:
			b.custom_minimum_size = Vector2(0, 46)
			b.add_theme_stylebox_override("normal", _flat(Color(0.05, 0.06, 0.07, 0.78), Color(1, 1, 1, 0.12), 1, 5))
			b.add_theme_stylebox_override("hover", _flat(Color(0.12, 0.14, 0.12, 0.9), BRASS, 1, 5))
			b.add_theme_stylebox_override("pressed", _flat(Color(0.2, 0.22, 0.16, 0.95), KHAKI, 1, 5))
			b.add_theme_stylebox_override("disabled", _flat(Color(0.05, 0.06, 0.07, 0.5), Color(1, 1, 1, 0.06), 1, 5))
	return b


# ---------------------------------------------------------------- 배경 장식

func _draw_deco() -> void:
	var W := deco.size.x
	var H := deco.size.y
	var u := H / 720.0
	# 왼쪽에서 오른쪽으로 옅어지는 어두운 그라데이션(글자 가독성). 정점 색 보간이라 줄무늬가 없다.
	var c0 := Color(0.015, 0.02, 0.02, 0.92)
	var c1 := Color(0.015, 0.02, 0.02, 0.5)
	var c2 := Color(0.015, 0.02, 0.02, 0.0)
	deco.draw_polygon(PackedVector2Array([Vector2(0, 0), Vector2(W * 0.34, 0), Vector2(W * 0.34, H), Vector2(0, H)]), PackedColorArray([c0, c1, c1, c0]))
	deco.draw_polygon(PackedVector2Array([Vector2(W * 0.34, 0), Vector2(W * 0.72, 0), Vector2(W * 0.72, H), Vector2(W * 0.34, H)]), PackedColorArray([c1, c2, c2, c1]))
	# 위·아래 검은 띠 + 경고 사선
	deco.draw_rect(Rect2(0, 0, W, 8 * u), INK)
	deco.draw_rect(Rect2(0, H - 38 * u, W, 38 * u), Color(INK.r, INK.g, INK.b, 0.92))
	var x := -40.0 * u
	while x < W:
		deco.draw_colored_polygon(PackedVector2Array([Vector2(x, 8 * u), Vector2(x + 14 * u, 8 * u), Vector2(x + 4 * u, 14 * u), Vector2(x - 10 * u, 14 * u)]), Color(BRASS.r, BRASS.g, BRASS.b, 0.75))
		x += 28.0 * u
	# 하단 문구
	var f := font_cd
	deco.draw_string(f, Vector2(24 * u, H - 13 * u), "IRONLINE  ·  v%s  ·  PeerJS 방장 권위 멀티플레이" % Proto.BUILD, HORIZONTAL_ALIGNMENT_LEFT, -1, int(13 * u), Color(KHAKI.r, KHAKI.g, KHAKI.b, 0.6))
	deco.draw_string(f, Vector2(0, H - 13 * u), "WASD 이동   Shift 달리기   Space 점프   좌클릭 사격   우클릭 조준   R 장전   Tab 점수판", HORIZONTAL_ALIGNMENT_RIGHT, W - 24 * u, int(13 * u), Color(KHAKI.r, KHAKI.g, KHAKI.b, 0.6))


# ---------------------------------------------------------------- 병과 카드

class WeaponCard extends Control:
	signal chosen(idx: int)
	var idx := 0
	var selected := false
	var hover := false
	var menu: Menu

	func _init(i: int, m: Menu) -> void:
		idx = i
		menu = m
		custom_minimum_size = Vector2(140, 170)
		mouse_filter = Control.MOUSE_FILTER_STOP

	func _gui_input(e: InputEvent) -> void:
		if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
			chosen.emit(idx)

	func _notification(what: int) -> void:
		if what == NOTIFICATION_MOUSE_ENTER:
			hover = true
			queue_redraw()
		elif what == NOTIFICATION_MOUSE_EXIT:
			hover = false
			queue_redraw()

	func _draw() -> void:
		var w: Dictionary = Sim.WEAPONS[idx]
		var r := Rect2(Vector2.ZERO, size)
		var bg := Color(0.05, 0.06, 0.07, 0.86)
		if selected:
			bg = Color(0.16, 0.2, 0.1, 0.94)
		elif hover:
			bg = Color(0.1, 0.12, 0.1, 0.92)
		draw_rect(r, bg)
		var edge := BRASS if selected else Color(1, 1, 1, 0.14)
		draw_rect(r, edge, false, 2.0 if selected else 1.0)
		if selected:
			draw_rect(Rect2(0, 0, 6, size.y), BRASS)
		# 이름
		var names := ["소총병", "돌격병", "기관총수"]
		draw_string(menu.font_st, Vector2(18, 34), names[idx], HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Color.WHITE if selected else menu.PAPER)
		draw_string(menu.font_cd, Vector2(18, 54), w.name, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(menu.KHAKI.r, menu.KHAKI.g, menu.KHAKI.b, 0.85))
		# 무기 실루엣
		var c := Color(0.85, 0.8, 0.65, 0.95) if selected else Color(0.6, 0.58, 0.5, 0.8)
		var y := 82.0
		draw_set_transform(Vector2(4, 0), 0.0, Vector2(0.8, 1.0))
		match idx:
			0:
				draw_rect(Rect2(20, y, 110, 4), c)
				draw_rect(Rect2(10, y - 2, 40, 9), c * 0.8)
				draw_rect(Rect2(128, y - 3, 22, 10), c * 0.8)
				draw_rect(Rect2(86, y + 4, 5, 8), c)
			1:
				draw_rect(Rect2(40, y, 60, 7), c)
				draw_rect(Rect2(98, y + 1, 40, 4), c)
				draw_rect(Rect2(60, y + 7, 7, 20), c * 0.85)
				draw_rect(Rect2(20, y - 1, 24, 9), c * 0.8)
			_:
				draw_rect(Rect2(36, y, 100, 5), c)
				draw_rect(Rect2(66, y - 9, 24, 9), c * 0.85)
				draw_rect(Rect2(14, y - 1, 26, 10), c * 0.8)
				draw_line(Vector2(120, y + 3), Vector2(138, y + 26), c, 2.0)
				draw_line(Vector2(120, y + 3), Vector2(104, y + 26), c, 2.0)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		# 능력치 막대
		var stats_ := [["피해", clampf(w.dmg / 70.0, 0.0, 1.0)], ["연사", clampf((1.0 / w.cd) / 12.0, 0.04, 1.0)], ["사거리", clampf(w.range / 240.0, 0.0, 1.0)]]
		var by := 112.0
		for s in stats_:
			draw_string(menu.font_cd, Vector2(18, by + 9), s[0], HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1, 1, 1, 0.6))
			draw_rect(Rect2(64, by, size.x - 82, 7), Color(1, 1, 1, 0.1))
			draw_rect(Rect2(64, by, (size.x - 82) * s[1], 7), menu.OLIVE_HI if selected else menu.KHAKI * Color(1, 1, 1, 0.55))
			by += 17.0


# ---------------------------------------------------------------- 계급/전적 카드

class PlayerCard extends Control:
	var menu: Menu

	func _init(m: Menu) -> void:
		menu = m
		custom_minimum_size = Vector2(330, 74)
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var r := Rect2(Vector2.ZERO, size)
		draw_rect(r, Color(0.04, 0.05, 0.06, 0.82))
		draw_rect(r, Color(1, 1, 1, 0.12), false, 1.0)
		draw_rect(Rect2(0, 0, 5, size.y), menu.BRASS)
		var ri := menu.rank_index()
		# 계급장: 갈매기표
		var chev := 1 + (ri % 4) if ri < 7 else 2 + (ri - 7) % 3
		var cx := 40.0
		for k in chev:
			var y := 24.0 + 10.0 * k
			draw_polyline(PackedVector2Array([Vector2(cx - 16, y + 8), Vector2(cx, y), Vector2(cx + 16, y + 8)]), menu.BRASS if ri >= 7 else menu.KHAKI, 3.0)
		if ri >= 7:
			var sc := Vector2(cx, 18.0)
			var star := PackedVector2Array()
			for k in 10:
				var a := -PI * 0.5 + k * PI / 5.0
				star.append(sc + Vector2(cos(a), sin(a)) * (8.0 if k % 2 == 0 else 3.4))
			draw_colored_polygon(star, menu.BRASS)
		draw_string(menu.font_b, Vector2(74, 28), menu.player_name, HORIZONTAL_ALIGNMENT_LEFT, 240, 20, Color.WHITE)
		draw_string(menu.font_cd, Vector2(74, 48), "%s  ·  %d승 %d패  ·  K/D %.2f" % [Menu.RANKS[ri], menu.stats.wins, menu.stats.matches - menu.stats.wins, float(menu.stats.kills) / maxf(1.0, float(menu.stats.deaths))], HORIZONTAL_ALIGNMENT_LEFT, 250, 13, Color(menu.KHAKI.r, menu.KHAKI.g, menu.KHAKI.b, 0.85))
		# 경험치 막대
		var lo: int = Menu.RANK_XP[ri]
		var hi: int = Menu.RANK_XP[mini(ri + 1, Menu.RANK_XP.size() - 1)]
		var f := 1.0 if hi == lo else clampf(float(menu.stats.xp - lo) / float(hi - lo), 0.0, 1.0)
		draw_rect(Rect2(74, 58, size.x - 90, 6), Color(1, 1, 1, 0.12))
		draw_rect(Rect2(74, 58, (size.x - 90) * f, 6), menu.OLIVE_HI)


# ---------------------------------------------------------------- 홈

func _build_home() -> void:
	home_ui = Control.new()
	home_ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	home_ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(home_ui)
	# 좌상단 로고
	var logo := VBoxContainer.new()
	logo.position = Vector2(56, 30)
	logo.add_theme_constant_override("separation", -4)
	home_ui.add_child(logo)
	var t1 := _label("IRONLINE", 66, PAPER, font_st)
	logo.add_child(t1)
	logo.add_child(_label("전  선  점  령  전   ·   1914", 16, BRASS, font_cd))
	# 우상단 플레이어 카드
	player_card = PlayerCard.new(self)
	player_card.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	player_card.offset_left = -360
	player_card.offset_right = -30
	player_card.offset_top = 28
	player_card.offset_bottom = 102
	home_ui.add_child(player_card)
	# 좌측 내비게이션
	var nav := VBoxContainer.new()
	nav.set_anchors_and_offsets_preset(Control.PRESET_CENTER_LEFT)
	nav.offset_left = 56
	nav.offset_right = 56 + 360
	nav.offset_top = -170
	nav.offset_bottom = 230
	nav.add_theme_constant_override("separation", 10)
	home_ui.add_child(nav)
	var name_row := HBoxContainer.new()
	nav.add_child(name_row)
	name_row.add_child(_label("콜사인", 13, Color(KHAKI.r, KHAKI.g, KHAKI.b, 0.7), font_cd))
	name_edit = LineEdit.new()
	name_edit.text = player_name
	name_edit.max_length = 12
	name_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_edit.text_changed.connect(func(t): player_name = t; save_settings(); player_card.queue_redraw())
	name_row.add_child(name_edit)
	var play := _button("출  격", "primary")
	play.pressed.connect(func(): play_solo.emit())
	nav.add_child(play)
	quick_btn = _button("빠른 대전   ONLINE")
	quick_btn.pressed.connect(func(): quick_match.emit())
	nav.add_child(quick_btn)
	host_btn = _button("방 만들기   친구 초대")
	host_btn.pressed.connect(func(): host_room.emit())
	nav.add_child(host_btn)
	var jr := HBoxContainer.new()
	jr.add_theme_constant_override("separation", 8)
	nav.add_child(jr)
	code_edit = LineEdit.new()
	code_edit.placeholder_text = "방 코드 입력"
	code_edit.max_length = 6
	code_edit.custom_minimum_size = Vector2(0, 46)
	code_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	code_edit.text_submitted.connect(func(t): _try_join())
	jr.add_child(code_edit)
	join_btn = _button("입장", "normal", 17)
	join_btn.custom_minimum_size = Vector2(90, 46)
	join_btn.pressed.connect(_try_join)
	jr.add_child(join_btn)
	var set_btn := _button("설정")
	set_btn.pressed.connect(func(): settings_ui.visible = true)
	nav.add_child(set_btn)
	note_lbl = _label("", 12, Color(1, 0.8, 0.5, 0.9), font)
	note_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	nav.add_child(note_lbl)
	# 하단 중앙 병과 카드
	var dock := VBoxContainer.new()
	dock.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	dock.offset_left = 440
	dock.offset_top = -262
	dock.offset_bottom = -52
	dock.add_theme_constant_override("separation", 8)
	home_ui.add_child(dock)
	dock.add_child(_label("병과 선택", 14, BRASS, font_cd))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	dock.add_child(row)
	for i in 3:
		var c := WeaponCard.new(i, self)
		c.selected = i == loadout
		c.chosen.connect(func(k):
			loadout = k
			save_settings()
			for cc in cards:
				cc.selected = cc.idx == loadout
				cc.queue_redraw())
		row.add_child(c)
		cards.append(c)
	# 우측 작전 브리핑
	brief = Control.new()
	brief.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	brief.offset_left = -370
	brief.offset_right = -30
	brief.offset_top = 118
	brief.offset_bottom = 118 + 372
	brief.mouse_filter = Control.MOUSE_FILTER_IGNORE
	brief.draw.connect(_draw_brief)
	home_ui.add_child(brief)
	tip_lbl = _label(TIPS[0], 13, PAPER, font)
	tip_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	tip_lbl.position = Vector2(16, 318)
	tip_lbl.size = Vector2(310, 60)
	brief.add_child(tip_lbl)


func _draw_brief() -> void:
	var r := Rect2(Vector2.ZERO, brief.size)
	brief.draw_rect(r, Color(0.04, 0.05, 0.06, 0.82))
	brief.draw_rect(r, Color(1, 1, 1, 0.12), false, 1.0)
	brief.draw_rect(Rect2(0, 0, brief.size.x, 5), BRASS)
	brief.draw_string(font_st, Vector2(16, 32), "작전 브리핑", HORIZONTAL_ALIGNMENT_LEFT, -1, 20, PAPER)
	brief.draw_string(font_cd, Vector2(16, 52), "5개 거점 · 순차 점령 · 병력 소진전", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color(KHAKI.r, KHAKI.g, KHAKI.b, 0.85))
	var mr := Rect2(16, 64, brief.size.x - 32, (brief.size.x - 32) * 100.0 / 180.0)
	if map_tex:
		brief.draw_texture_rect(map_tex, mr, false, Color(1, 1, 1, 0.95))
	else:
		brief.draw_rect(mr, Color(0.1, 0.12, 0.08))
	brief.draw_rect(mr, Color(1, 1, 1, 0.2), false, 1.0)
	for i in 5:
		var px: float = mr.position.x + (World.POINT_X[i] + World.HALF_X) / (World.HALF_X * 2.0) * mr.size.x
		var py: float = mr.position.y + (World.POINT_Z[i] + World.HALF_Z) / (World.HALF_Z * 2.0) * mr.size.y
		var col := COL_A if i == 0 else (COL_B if i == 4 else Color(0.8, 0.8, 0.8))
		brief.draw_circle(Vector2(px, py), 8, Color(0, 0, 0, 0.7))
		brief.draw_circle(Vector2(px, py), 6.5, col)
		brief.draw_string(font_cd, Vector2(px - 4, py + 4), str(i + 1), HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color.BLACK)
	var y := mr.end.y + 22
	brief.draw_string(font_cd, Vector2(16, y), "A 북부 연합   <  1 → 5  >   B 남부 동맹", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color(KHAKI.r, KHAKI.g, KHAKI.b, 0.9))
	brief.draw_line(Vector2(16, y + 10), Vector2(brief.size.x - 16, y + 10), Color(1, 1, 1, 0.12), 1.0)
	brief.draw_string(font_cd, Vector2(16, y + 30), "TIP", HORIZONTAL_ALIGNMENT_LEFT, -1, 12, BRASS)


func set_map(t: Texture2D) -> void:
	map_tex = t
	if brief:
		brief.queue_redraw()


func _try_join() -> void:
	var c := code_edit.text.strip_edges().to_upper()
	if c.length() < 4:
		toast("방 코드를 입력해 주세요")
		return
	join_room.emit(c)


func set_multi_available(ok: bool) -> void:
	multi_ok = ok
	note_lbl.text = "" if ok else "멀티플레이는 웹 빌드(브라우저)에서만 쓸 수 있어요. 지금은 혼자 하기만 가능합니다."
	quick_btn.disabled = not ok
	host_btn.disabled = not ok
	join_btn.disabled = not ok
	code_edit.editable = ok


# ---------------------------------------------------------------- 설정 팝업

func _build_settings() -> void:
	settings_ui = ColorRect.new()
	(settings_ui as ColorRect).color = Color(0, 0, 0, 0.6)
	settings_ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	settings_ui.mouse_filter = Control.MOUSE_FILTER_STOP
	settings_ui.visible = false
	add_child(settings_ui)
	var p := PanelContainer.new()
	p.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	p.offset_left = -240
	p.offset_right = 240
	p.offset_top = -215
	p.offset_bottom = 215
	p.add_theme_stylebox_override("panel", _flat(Color(0.05, 0.06, 0.07, 0.97), BRASS, 2, 0))
	settings_ui.add_child(p)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 14)
	p.add_child(v)
	v.add_child(_label("설정", 28, PAPER, font_st))
	var qr := HBoxContainer.new()
	v.add_child(qr)
	var ql := _label("그래픽", 15, KHAKI, font_cd)
	ql.custom_minimum_size = Vector2(130, 0)
	qr.add_child(ql)
	q_opt = OptionButton.new()
	for t in ["낮음", "보통", "높음", "자동 (권장)"]:
		q_opt.add_item(t)
	q_opt.select(quality)
	q_opt.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	q_opt.item_selected.connect(func(i): quality = i; save_settings(); settings_changed.emit())
	qr.add_child(q_opt)
	var br := HBoxContainer.new()
	v.add_child(br)
	bots_lbl = _label("봇 (팀당) %d" % bots, 15, KHAKI, font_cd)
	bots_lbl.custom_minimum_size = Vector2(130, 0)
	br.add_child(bots_lbl)
	bots_slider = HSlider.new()
	bots_slider.min_value = 6
	bots_slider.max_value = 50
	bots_slider.step = 2
	bots_slider.value = bots
	bots_slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bots_slider.value_changed.connect(func(x): bots = int(x); bots_lbl.text = "봇 (팀당) %d" % bots; save_settings())
	br.add_child(bots_slider)
	var sr := HBoxContainer.new()
	v.add_child(sr)
	var sl := _label("마우스 감도", 15, KHAKI, font_cd)
	sl.custom_minimum_size = Vector2(130, 0)
	sr.add_child(sl)
	sens_slider = HSlider.new()
	sens_slider.min_value = 0.3
	sens_slider.max_value = 2.5
	sens_slider.step = 0.05
	sens_slider.value = sens
	sens_slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sens_slider.value_changed.connect(func(x): sens = x; save_settings())
	sr.add_child(sens_slider)
	var shr := HBoxContainer.new()
	v.add_child(shr)
	var shl := _label("화면 흔들림", 15, KHAKI, font_cd)
	shl.custom_minimum_size = Vector2(130, 0)
	shr.add_child(shl)
	var shake_slider := HSlider.new()
	shake_slider.min_value = 0.0
	shake_slider.max_value = 1.0
	shake_slider.step = 0.05
	shake_slider.value = shake_amt
	shake_slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	shake_slider.value_changed.connect(func(x): shake_amt = x; save_settings())
	shr.add_child(shake_slider)
	v.add_child(_label("진영", 15, KHAKI, font_cd))
	var tr := HBoxContainer.new()
	tr.add_theme_constant_override("separation", 8)
	v.add_child(tr)
	var labels := ["자동", "A 북부 연합", "B 남부 동맹"]
	for i in 3:
		var b := _button(labels[i], "normal", 16)
		b.toggle_mode = true
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var tv := i - 1
		b.pressed.connect(func():
			pref_team = tv
			_sync_team_btns()
			save_settings())
		tr.add_child(b)
		team_btns.append(b)
	_sync_team_btns()
	var close := _button("닫기", "primary", 22)
	close.custom_minimum_size = Vector2(0, 52)
	close.pressed.connect(func(): settings_ui.visible = false)
	v.add_child(close)


func _sync_team_btns() -> void:
	for i in team_btns.size():
		team_btns[i].button_pressed = (i - 1) == pref_team


# ---------------------------------------------------------------- 대기실

func _build_lobby() -> void:
	lobby_ui = Control.new()
	lobby_ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	lobby_ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(lobby_ui)
	var p := PanelContainer.new()
	p.set_anchors_and_offsets_preset(Control.PRESET_CENTER_LEFT)
	p.offset_left = 56
	p.offset_right = 56 + 560
	p.offset_top = -290
	p.offset_bottom = 290
	p.add_theme_stylebox_override("panel", _flat(Color(0.04, 0.05, 0.06, 0.86), Color(1, 1, 1, 0.12), 1, 0))
	lobby_ui.add_child(p)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	p.add_child(v)
	lobby_title = _label("대기실", 34, PAPER, font_st)
	v.add_child(lobby_title)
	v.add_child(_label("방 코드 — 친구에게 알려 주세요", 13, KHAKI, font_cd))
	lobby_code = _label("-----", 58, BRASS, font_st)
	v.add_child(lobby_code)
	lobby_link = _label("", 12, Color(1, 1, 1, 0.5), font)
	lobby_link.autowrap_mode = TextServer.AUTOWRAP_ARBITRARY
	v.add_child(lobby_link)
	var cb := _button("초대 링크 복사")
	cb.pressed.connect(func():
		DisplayServer.clipboard_set(lobby_link.text)
		toast("초대 링크를 복사했어요", 2.5))
	v.add_child(cb)
	var tr := HBoxContainer.new()
	tr.add_theme_constant_override("separation", 8)
	v.add_child(tr)
	for i in 2:
		var b := _button("A  북부 연합으로" if i == 0 else "B  남부 동맹으로", "normal", 16)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var t := i
		b.pressed.connect(func(): team_chosen.emit(t))
		tr.add_child(b)
	lobby_list = VBoxContainer.new()
	lobby_list.add_theme_constant_override("separation", 4)
	v.add_child(lobby_list)
	lobby_hint = _label("", 13, Color(1, 1, 1, 0.6), font)
	lobby_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(lobby_hint)
	start_btn = _button("게 임  시 작", "primary")
	start_btn.pressed.connect(func(): start_match.emit())
	v.add_child(start_btn)
	var lv := _button("나가기", "danger")
	lv.pressed.connect(func(): leave_room.emit())
	v.add_child(lv)
	lobby_ui.visible = false


func refresh_lobby(net: Net, countdown: float = -1.0) -> void:
	for c in lobby_list.get_children():
		c.queue_free()
	var hosting := net.role == Net.Role.HOST
	lobby_title.text = "대기실 · 방장" if hosting else "대기실"
	lobby_code.text = net.code if net.code != "" else "-----"
	lobby_link.text = _invite_link(net.code)
	start_btn.visible = hosting
	start_btn.disabled = net.status != "ready"
	var teams := [[], []]
	for p in net.players:
		teams[int(p.team)].append(p)
	for t in 2:
		var col := COL_A if t == 0 else COL_B
		lobby_list.add_child(_label("%s팀  (%d / 3)" % ["A 북부 연합" if t == 0 else "B 남부 동맹", teams[t].size()], 15, col, font_cd))
		for p in teams[t]:
			lobby_list.add_child(_label("     " + str(p.name) + ("   ★ 방장" if p.host else ""), 16))
		if teams[t].is_empty():
			lobby_list.add_child(_label("     (비어 있음 — 봇이 채웁니다)", 13, Color(1, 1, 1, 0.4)))
	var st := "방을 만드는 중…" if net.status == "connecting" else ("접속 대기 중" if hosting else "방장이 시작하길 기다리는 중…")
	if countdown >= 0.0:
		st = "%d초 후 자동 시작" % ceili(countdown)
	lobby_hint.text = st + "   ·   팀당 병력 %d명 (빈 자리는 봇)" % int(net.cfg.get("bots", 30))


func _invite_link(code: String) -> String:
	if code == "":
		return ""
	if OS.has_feature("web"):
		var base := str(JavaScriptBridge.eval("location.origin + location.pathname", true))
		return "%s?join=%s" % [base, code]
	return code


# ---------------------------------------------------------------- 로딩/토스트

func _build_loading() -> void:
	load_ui = ColorRect.new()
	(load_ui as ColorRect).color = Color(0.03, 0.04, 0.04, 0.94)
	load_ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	load_ui.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(load_ui)
	load_lbl = _label("전장 준비 중…", 30, PAPER, font_st)
	load_lbl.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	load_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	load_lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	load_ui.add_child(load_lbl)
	load_ui.visible = false


func _build_toast() -> void:
	toast_lbl = _label("", 18, Color.WHITE, font_b)
	toast_lbl.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	toast_lbl.offset_top = 56
	toast_lbl.offset_left = -300
	toast_lbl.offset_right = 300
	toast_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_lbl.add_theme_stylebox_override("normal", _flat(Color(0.45, 0.1, 0.08, 0.95), RED, 1, 6))
	toast_lbl.visible = false
	add_child(toast_lbl)


func toast(msg: String, t: float = 3.5) -> void:
	toast_lbl.text = msg
	toast_lbl.visible = true
	toast_lbl.modulate.a = 1.0
	toast_t = t


func set_loading(on: bool, text: String = "전장 준비 중…") -> void:
	load_ui.visible = on
	load_lbl.text = text


# ---------------------------------------------------------------- 화면 전환

func show_home() -> void:
	screen = "home"
	home_ui.visible = true
	lobby_ui.visible = false
	settings_ui.visible = false
	visible = true
	player_card.queue_redraw()


func show_lobby() -> void:
	screen = "lobby"
	home_ui.visible = false
	lobby_ui.visible = true
	settings_ui.visible = false
	visible = true


func hide_all() -> void:
	visible = false
