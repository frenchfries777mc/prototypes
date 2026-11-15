class_name Menu
extends Control
## 로비/메뉴. 3D 전장이 살아 움직이는 배경 위에 반투명 패널로 띄운다.
##  홈: [플레이] 바로 시작 · 친구와 플레이(방 만들기/코드로 참가) · 설정
##  대기실: 방 코드, 참가자·진영 선택, 방장은 [게임 시작]

signal play_solo
signal host_room
signal join_room(code: String)
signal start_match
signal leave_room
signal team_chosen(team: int)
signal settings_changed

const COL_A := Color("#6aa2ff")
const COL_B := Color("#ffc84d")
const INK := Color(0.93, 0.95, 1.0)
const SAVE := "user://ironline.cfg"

var font: Font
var font_b: Font
var theme_: Theme
var root_box: VBoxContainer
var panel: PanelContainer
var screen := "home"
var home_ui: Control
var lobby_ui: Control
var load_ui: Control
var toast_lbl: Label
var toast_t := 0.0
# 설정값
var player_name := "병사"
var quality := 3  # 0 낮음 1 보통 2 높음 3 자동
var bots := 30
var sens := 1.0
var pref_team := -1
var multi_ok := false
# 위젯
var name_edit: LineEdit
var code_edit: LineEdit
var q_opt: OptionButton
var bots_slider: HSlider
var bots_lbl: Label
var sens_slider: HSlider
var team_btns: Array = []
var lobby_title: Label
var lobby_code: Label
var lobby_link: Label
var lobby_list: VBoxContainer
var lobby_hint: Label
var start_btn: Button
var load_lbl: Label


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_PASS
	font = load("res://assets/fonts/Gothic.ttf")
	font_b = load("res://assets/fonts/GothicBold.ttf")
	_load_settings()
	_build_theme()
	_build_home()
	_build_lobby()
	_build_loading()
	_build_toast()
	show_home()


func _process(dt: float) -> void:
	if toast_t > 0.0:
		toast_t -= dt
		toast_lbl.modulate.a = clampf(toast_t / 0.5, 0.0, 1.0)
		if toast_t <= 0.0:
			toast_lbl.visible = false


# ---------------------------------------------------------------- 설정 저장

func _load_settings() -> void:
	var c := ConfigFile.new()
	if c.load(SAVE) == OK:
		player_name = str(c.get_value("p", "name", player_name))
		quality = int(c.get_value("p", "q", quality))
		bots = int(c.get_value("p", "bots", bots))
		sens = float(c.get_value("p", "sens", sens))
		pref_team = int(c.get_value("p", "team", pref_team))
	else:
		player_name = "병사%d" % (randi() % 900 + 100)


func save_settings() -> void:
	var c := ConfigFile.new()
	c.set_value("p", "name", player_name)
	c.set_value("p", "q", quality)
	c.set_value("p", "bots", bots)
	c.set_value("p", "sens", sens)
	c.set_value("p", "team", pref_team)
	c.save(SAVE)


# ---------------------------------------------------------------- 테마/위젯 도구

func _sb(col: Color, radius: int = 10, border: Color = Color(1, 1, 1, 0.1), bw: int = 1) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = col
	s.set_corner_radius_all(radius)
	s.border_color = border
	s.set_border_width_all(bw)
	s.content_margin_left = 16
	s.content_margin_right = 16
	s.content_margin_top = 10
	s.content_margin_bottom = 10
	return s


func _build_theme() -> void:
	theme_ = Theme.new()
	theme_.default_font = font
	theme_.default_font_size = 16
	theme_.set_stylebox("normal", "Button", _sb(Color(1, 1, 1, 0.08)))
	theme_.set_stylebox("hover", "Button", _sb(Color(1, 1, 1, 0.16)))
	theme_.set_stylebox("pressed", "Button", _sb(Color(1, 1, 1, 0.24)))
	theme_.set_stylebox("disabled", "Button", _sb(Color(1, 1, 1, 0.03)))
	theme_.set_stylebox("focus", "Button", _sb(Color(0, 0, 0, 0), 10, Color(0.5, 0.75, 1.0, 0.8), 2))
	theme_.set_color("font_color", "Button", INK)
	theme_.set_color("font_hover_color", "Button", Color.WHITE)
	theme_.set_color("font_disabled_color", "Button", Color(1, 1, 1, 0.3))
	theme_.set_stylebox("normal", "LineEdit", _sb(Color(0, 0, 0, 0.35), 8))
	theme_.set_stylebox("focus", "LineEdit", _sb(Color(0, 0, 0, 0.45), 8, Color(0.5, 0.75, 1.0, 0.8), 2))
	theme_.set_color("font_color", "LineEdit", INK)
	theme_.set_color("font_placeholder_color", "LineEdit", Color(1, 1, 1, 0.35))
	theme_.set_color("font_color", "Label", INK)
	theme_.set_stylebox("panel", "PanelContainer", _sb(Color(0.04, 0.05, 0.07, 0.72), 16, Color(1, 1, 1, 0.1), 1))
	theme_.set_stylebox("normal", "OptionButton", _sb(Color(1, 1, 1, 0.08)))
	theme_.set_stylebox("hover", "OptionButton", _sb(Color(1, 1, 1, 0.16)))
	theme_.set_stylebox("pressed", "OptionButton", _sb(Color(1, 1, 1, 0.24)))
	theme_.set_color("font_color", "OptionButton", INK)
	theme = theme_


func _label(text: String, size: int = 16, col: Color = INK, bold: bool = false) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", col)
	if bold:
		l.add_theme_font_override("font", font_b)
	return l


func _button(text: String, primary: bool = false, size: int = 17) -> Button:
	var b := Button.new()
	b.text = text
	b.add_theme_font_size_override("font_size", size)
	b.add_theme_font_override("font", font_b if primary else font)
	b.custom_minimum_size = Vector2(0, 46 if primary else 40)
	b.focus_mode = Control.FOCUS_NONE
	if primary:
		b.add_theme_stylebox_override("normal", _sb(Color(0.22, 0.42, 0.82, 0.95), 12, Color(0.6, 0.8, 1.0, 0.5), 1))
		b.add_theme_stylebox_override("hover", _sb(Color(0.3, 0.52, 0.95, 1.0), 12, Color(0.7, 0.88, 1.0, 0.7), 1))
		b.add_theme_stylebox_override("pressed", _sb(Color(0.18, 0.34, 0.7, 1.0), 12))
	return b


func _panel_at_left() -> PanelContainer:
	var p := PanelContainer.new()
	p.set_anchors_and_offsets_preset(Control.PRESET_CENTER_LEFT)
	p.offset_left = 56
	p.offset_right = 56 + 440
	p.offset_top = -300
	p.offset_bottom = 300
	p.grow_vertical = Control.GROW_DIRECTION_BOTH
	add_child(p)
	return p


# ---------------------------------------------------------------- 홈

func _build_home() -> void:
	var p := _panel_at_left()
	home_ui = p
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	p.add_child(v)
	v.add_child(_label("IRONLINE", 54, Color.WHITE, true))
	var sub := _label("전선 점령전  ·  3 vs 3 + 봇 대부대", 15, Color(1, 1, 1, 0.6))
	v.add_child(sub)
	v.add_child(Control.new())
	v.add_child(_label("이름", 13, Color(1, 1, 1, 0.55)))
	name_edit = LineEdit.new()
	name_edit.text = player_name
	name_edit.max_length = 12
	name_edit.placeholder_text = "이름"
	name_edit.text_changed.connect(func(t): player_name = t; save_settings())
	v.add_child(name_edit)
	# 진영
	v.add_child(_label("진영", 13, Color(1, 1, 1, 0.55)))
	var tr := HBoxContainer.new()
	tr.add_theme_constant_override("separation", 8)
	v.add_child(tr)
	var labels := ["자동", "A  북부 연합", "B  남부 동맹"]
	for i in 3:
		var b := _button(labels[i])
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
	var play := _button("플레이", true, 22)
	play.custom_minimum_size = Vector2(0, 58)
	play.pressed.connect(func(): play_solo.emit())
	v.add_child(play)
	var host := _button("친구와 플레이  ·  방 만들기")
	host.pressed.connect(func(): host_room.emit())
	v.add_child(host)
	var jr := HBoxContainer.new()
	jr.add_theme_constant_override("separation", 8)
	v.add_child(jr)
	code_edit = LineEdit.new()
	code_edit.placeholder_text = "방 코드"
	code_edit.max_length = 6
	code_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	code_edit.text_submitted.connect(func(t): _try_join())
	jr.add_child(code_edit)
	var jb := _button("참가")
	jb.pressed.connect(_try_join)
	jr.add_child(jb)
	v.add_child(HSeparator.new())
	# 설정
	v.add_child(_label("설정", 13, Color(1, 1, 1, 0.55)))
	var qr := HBoxContainer.new()
	v.add_child(qr)
	var ql := _label("그래픽", 15)
	ql.custom_minimum_size = Vector2(90, 0)
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
	bots_lbl = _label("봇 (팀당) %d" % bots, 15)
	bots_lbl.custom_minimum_size = Vector2(140, 0)
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
	var sl := _label("마우스 감도", 15)
	sl.custom_minimum_size = Vector2(140, 0)
	sr.add_child(sl)
	sens_slider = HSlider.new()
	sens_slider.min_value = 0.3
	sens_slider.max_value = 2.5
	sens_slider.step = 0.05
	sens_slider.value = sens
	sens_slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sens_slider.value_changed.connect(func(x): sens = x; save_settings())
	sr.add_child(sens_slider)
	var note := _label("", 12, Color(1, 0.8, 0.5, 0.9))
	note.name = "Note"
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(note)


func _sync_team_btns() -> void:
	for i in team_btns.size():
		team_btns[i].button_pressed = (i - 1) == pref_team


func _try_join() -> void:
	var c := code_edit.text.strip_edges().to_upper()
	if c.length() < 4:
		toast("방 코드를 입력해 주세요")
		return
	join_room.emit(c)


func set_multi_available(ok: bool) -> void:
	multi_ok = ok
	var note: Label = home_ui.find_child("Note", true, false)
	if note:
		note.text = "" if ok else "멀티플레이는 웹 빌드(브라우저)에서만 쓸 수 있어요. 지금은 혼자 하기만 가능합니다."
	for b in home_ui.find_children("*", "Button", true, false):
		if b.text.begins_with("친구와") or b.text == "참가":
			b.disabled = not ok
	code_edit.editable = ok


# ---------------------------------------------------------------- 대기실

func _build_lobby() -> void:
	var p := _panel_at_left()
	lobby_ui = p
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	p.add_child(v)
	lobby_title = _label("대기실", 30, Color.WHITE, true)
	v.add_child(lobby_title)
	v.add_child(_label("방 코드 (친구에게 알려 주세요)", 13, Color(1, 1, 1, 0.55)))
	lobby_code = _label("-----", 46, Color(0.75, 0.9, 1.0), true)
	v.add_child(lobby_code)
	lobby_link = _label("", 12, Color(1, 1, 1, 0.5))
	lobby_link.autowrap_mode = TextServer.AUTOWRAP_ARBITRARY
	v.add_child(lobby_link)
	var cb := _button("초대 링크 복사")
	cb.pressed.connect(func():
		DisplayServer.clipboard_set(lobby_link.text)
		toast("초대 링크를 복사했어요"))
	v.add_child(cb)
	v.add_child(HSeparator.new())
	var tr := HBoxContainer.new()
	tr.add_theme_constant_override("separation", 8)
	v.add_child(tr)
	for i in 2:
		var b := _button("A  북부 연합" if i == 0 else "B  남부 동맹")
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var t := i
		b.pressed.connect(func(): team_chosen.emit(t))
		tr.add_child(b)
	lobby_list = VBoxContainer.new()
	lobby_list.add_theme_constant_override("separation", 6)
	v.add_child(lobby_list)
	lobby_hint = _label("", 13, Color(1, 1, 1, 0.6))
	lobby_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(lobby_hint)
	start_btn = _button("게임 시작", true, 22)
	start_btn.custom_minimum_size = Vector2(0, 56)
	start_btn.pressed.connect(func(): start_match.emit())
	v.add_child(start_btn)
	var lv := _button("나가기")
	lv.pressed.connect(func(): leave_room.emit())
	v.add_child(lv)
	lobby_ui.visible = false


func refresh_lobby(net: Net) -> void:
	for c in lobby_list.get_children():
		c.queue_free()
	var hosting := net.role == Net.Role.HOST
	lobby_title.text = "대기실  ·  방장" if hosting else "대기실"
	lobby_code.text = net.code if net.code != "" else "-----"
	lobby_link.text = _invite_link(net.code)
	start_btn.visible = hosting
	start_btn.disabled = net.status != "ready"
	var teams := [[], []]
	for p in net.players:
		teams[int(p.team)].append(p)
	for t in 2:
		var col := COL_A if t == 0 else COL_B
		var head := _label("%s팀  (%d / 3)" % ["A" if t == 0 else "B", teams[t].size()], 14, col, true)
		lobby_list.add_child(head)
		for p in teams[t]:
			var tag := "  · 방장" if p.host else ""
			lobby_list.add_child(_label("   " + str(p.name) + tag, 16))
		if teams[t].is_empty():
			lobby_list.add_child(_label("   (비어 있음 — 봇이 채웁니다)", 13, Color(1, 1, 1, 0.4)))
	var st := "방을 만드는 중…" if net.status == "connecting" else ("접속 대기 중" if hosting else "방장이 시작하길 기다리는 중…")
	lobby_hint.text = st + "\n빈 자리는 봇이 채우고, 총 병력은 팀당 %d명입니다." % int(net.cfg.get("bots", 30))


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
	(load_ui as ColorRect).color = Color(0.02, 0.03, 0.04, 0.92)
	load_ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	load_ui.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(load_ui)
	load_lbl = _label("전장 준비 중…", 28, Color.WHITE, true)
	load_lbl.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	load_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	load_lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	load_ui.add_child(load_lbl)
	load_ui.visible = false


func _build_toast() -> void:
	toast_lbl = _label("", 18, Color.WHITE, true)
	toast_lbl.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	toast_lbl.offset_top = 40
	toast_lbl.offset_left = -300
	toast_lbl.offset_right = 300
	toast_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var sb := _sb(Color(0.6, 0.12, 0.1, 0.9), 12, Color(1, 0.5, 0.4, 0.6), 1)
	toast_lbl.add_theme_stylebox_override("normal", sb)
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
	visible = true


func show_lobby() -> void:
	screen = "lobby"
	home_ui.visible = false
	lobby_ui.visible = true
	visible = true


func hide_all() -> void:
	visible = false
