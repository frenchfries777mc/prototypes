class_name Sfx
extends Node3D
## 절차적 사운드: 총성(무기별), 피격/처치 알림음, 바람, 먼 포성. 외부 음원 파일이 필요 없다.

const RATE := 22050

var shots: Array = []
var tick: AudioStreamWAV
var thump: AudioStreamWAV
var boom: AudioStreamWAV
var chime: AudioStreamWAV
var pool3d: Array = []
var pool2d: Array = []
var i3 := 0
var i2 := 0
var rng := RandomNumberGenerator.new()
var boom_t := 6.0
var budget := 0


func _ready() -> void:
	rng.seed = 99
	shots = [_gun(0.9, 11.0, 0.45, 70.0, 0.9), _gun(0.4, 24.0, 0.7, 120.0, 0.55), _gun(0.55, 17.0, 0.6, 90.0, 0.7)]
	tick = _blip(1800.0, 0.06, 0.5)
	thump = _blip(110.0, 0.28, 0.9)
	chime = _blip(880.0, 0.35, 0.4)
	boom = _gun(2.4, 2.6, 0.12, 38.0, 1.0)
	for i in 10:
		var p := AudioStreamPlayer3D.new()
		p.max_distance = 170.0
		p.unit_size = 9.0
		p.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
		p.max_polyphony = 1
		add_child(p)
		pool3d.append(p)
	for i in 4:
		var p := AudioStreamPlayer.new()
		add_child(p)
		pool2d.append(p)
	var wind := AudioStreamPlayer.new()
	wind.stream = _wind()
	wind.volume_db = -24.0
	wind.autoplay = true
	add_child(wind)


func _wav(samples: PackedFloat32Array) -> AudioStreamWAV:
	var data := PackedByteArray()
	data.resize(samples.size() * 2)
	for i in samples.size():
		data.encode_s16(i * 2, int(clampf(samples[i], -1.0, 1.0) * 32767.0))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = RATE
	w.stereo = false
	w.data = data
	return w


func _gun(dur: float, decay: float, bright: float, thump_hz: float, vol: float) -> AudioStreamWAV:
	var n := int(dur * RATE)
	var s := PackedFloat32Array()
	s.resize(n)
	var lp := 0.0
	for i in n:
		var t := float(i) / RATE
		var noise := rng.randf() * 2.0 - 1.0
		lp += (noise - lp) * bright
		var env := exp(-t * decay)
		var body := sin(TAU * thump_hz * t * exp(-t * 4.0)) * exp(-t * (decay * 0.6)) * 0.9
		s[i] = (lp * env * 1.1 + body) * vol
	# 반향
	var d1 := int(0.085 * RATE)
	var d2 := int(0.19 * RATE)
	for i in range(n - 1, d1, -1):
		s[i] += s[i - d1] * 0.22
		if i > d2:
			s[i] += s[i - d2] * 0.12
	# 클리핑 방지
	for i in n:
		s[i] = tanh(s[i] * 1.1)
	return _wav(s)


func _blip(hz: float, dur: float, vol: float) -> AudioStreamWAV:
	var n := int(dur * RATE)
	var s := PackedFloat32Array()
	s.resize(n)
	for i in n:
		var t := float(i) / RATE
		s[i] = sin(TAU * hz * t) * exp(-t * (5.0 / dur)) * vol
	return _wav(s)


func _wind() -> AudioStreamWAV:
	var n := RATE * 6
	var s := PackedFloat32Array()
	s.resize(n)
	var lp := 0.0
	var lp2 := 0.0
	for i in n:
		var t := float(i) / RATE
		var noise := rng.randf() * 2.0 - 1.0
		lp += (noise - lp) * 0.03
		lp2 += (lp - lp2) * 0.08
		var swell := 0.55 + 0.45 * sin(TAU * t / 6.0 * 1.0) * sin(TAU * t / 3.0 + 1.0)
		s[i] = lp2 * 6.0 * swell
	var w := _wav(s)
	w.loop_mode = AudioStreamWAV.LOOP_FORWARD
	w.loop_begin = 0
	w.loop_end = n
	return w


func begin_frame() -> void:
	budget = 6


func shot_at(weapon: int, pos: Vector3, near_cam: float) -> void:
	if budget <= 0 or near_cam > 150.0:
		return
	budget -= 1
	var p: AudioStreamPlayer3D = pool3d[i3]
	i3 = (i3 + 1) % pool3d.size()
	p.stream = shots[weapon]
	p.global_position = pos
	p.pitch_scale = rng.randf_range(0.93, 1.08)
	p.volume_db = -3.0
	p.play()


func play2d(stream: AudioStream, vol_db: float = 0.0, pitch: float = 1.0) -> void:
	var p: AudioStreamPlayer = pool2d[i2]
	i2 = (i2 + 1) % pool2d.size()
	p.stream = stream
	p.volume_db = vol_db
	p.pitch_scale = pitch
	p.play()


func own_shot(weapon: int) -> void:
	play2d(shots[weapon], -2.0, rng.randf_range(0.97, 1.03))


func update(dt: float, cam_pos: Vector3) -> void:
	boom_t -= dt
	if boom_t <= 0.0:
		boom_t = rng.randf_range(7.0, 16.0)
		var p: AudioStreamPlayer3D = pool3d[i3]
		i3 = (i3 + 1) % pool3d.size()
		p.stream = boom
		var a := rng.randf() * TAU
		p.global_position = cam_pos + Vector3(cos(a), 0.2, sin(a)) * 150.0
		p.volume_db = 2.0
		p.pitch_scale = rng.randf_range(0.8, 1.1)
		p.play()
