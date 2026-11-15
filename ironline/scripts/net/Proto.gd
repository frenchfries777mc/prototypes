class_name Proto
extends RefCounted
## 네트워크 패킷 인코더/디코더. 바이너리를 만들어 base64 문자열로 보낸다(JavaScriptBridge 는 바이트 배열을 못 넘긴다).
##
## 비신뢰 채널:  C→H 입력 'I' (12바이트),  H→C 스냅샷 'S'
## 신뢰 채널:    JSON 문자열 (hello / welcome / lobby / start / ev / score / names ...)

const BUILD := "0.2.0"
const UNIT_BYTES := 12
const HEAD_BYTES := 36
const LOCAL_BYTES := 17
const SHOT_BYTES := 14
const MAX_SHOTS := 24

const BTN_FIRE := 1
const BTN_JUMP := 2
const BTN_SPRINT := 4
const BTN_RELOAD := 8
const BTN_ADS := 16


static func b64(buf: PackedByteArray) -> String:
	return Marshalls.raw_to_base64(buf)


static func unb64(s: String) -> PackedByteArray:
	return Marshalls.base64_to_raw(s)


static func q16(v: float, scale: float, offset: float = 0.0) -> int:
	return clampi(int(round((v + offset) * scale)), -32768, 32767)


# ---------------------------------------------------------------- 입력

static func enc_input(seq: int, move: Vector2, yaw: float, pitch: float, btn: int) -> String:
	var b := PackedByteArray()
	b.resize(12)
	b.encode_u8(0, 73)  # 'I'
	b.encode_u16(1, seq & 0xFFFF)
	b.encode_s8(3, clampi(int(round(move.x * 127.0)), -127, 127))
	b.encode_s8(4, clampi(int(round(move.y * 127.0)), -127, 127))
	b.encode_float(5, yaw)
	b.encode_s16(9, clampi(int(round(pitch * 10000.0)), -32768, 32767))
	b.encode_u8(11, btn)
	return b64(b)


static func dec_input(s: String) -> Dictionary:
	var b := unb64(s)
	if b.size() < 12 or b[0] != 73:
		return {}
	return {
		"seq": b.decode_u16(1),
		"move": Vector2(b.decode_s8(3) / 127.0, b.decode_s8(4) / 127.0),
		"yaw": b.decode_float(5),
		"pitch": b.decode_s16(9) / 10000.0,
		"btn": b.decode_u8(11),
	}


# ---------------------------------------------------------------- 스냅샷

static func _flags(u: Sim.Unit) -> int:
	var f := 0
	if u.alive:
		f |= 1
	if u.on_ground:
		f |= 2
	if u.reload_t > 0.0:
		f |= 4
	f |= (u.weapon & 3) << 3
	if u.team == 1:
		f |= 32
	if not u.is_bot:
		f |= 64
	return f


## 모든 수신자가 공유하는 앞부분.
static func enc_world(sim: Sim) -> PackedByteArray:
	var n := sim.units.size()
	var b := PackedByteArray()
	b.resize(HEAD_BYTES + n * UNIT_BYTES)
	b.encode_u8(0, 83)  # 'S'
	b.encode_u32(1, sim.tick_count)
	b.encode_float(5, sim.time)
	b.encode_s8(9, sim.winner)
	b.encode_u16(10, sim.tickets[0])
	b.encode_u16(12, sim.tickets[1])
	var o := 14
	for p in sim.pts:
		b.encode_s8(o, p.owner)
		b.encode_s8(o + 1, clampi(int(round(p.cap * 127.0)), -127, 127))
		b.encode_u8(o + 2, p.n_a)
		b.encode_u8(o + 3, p.n_b)
		o += 4
	b.encode_u16(34, n)
	o = HEAD_BYTES
	for u in sim.units:
		b.encode_u8(o, _flags(u))
		b.encode_s16(o + 1, q16(u.pos.x, 100.0))
		b.encode_s16(o + 3, q16(u.pos.y, 100.0, 20.0))
		b.encode_s16(o + 5, q16(u.pos.z, 100.0))
		b.encode_u16(o + 7, int(round(wrapf(u.yaw, 0.0, TAU) / TAU * 65535.0)) & 0xFFFF)
		b.encode_s8(o + 9, clampi(int(round(u.pitch / 1.5 * 127.0)), -127, 127))
		b.encode_u8(o + 10, clampi(int(ceil(u.hp)), 0, 255))
		b.encode_u8(o + 11, clampi(int(round(u.speed_now * 20.0)), 0, 255))
		o += UNIT_BYTES
	return b


## 수신자 본인에게만 필요한 정보(예측 보정용).
static func enc_local(u: Sim.Unit, ack: int) -> PackedByteArray:
	var b := PackedByteArray()
	b.resize(LOCAL_BYTES)
	b.encode_u16(0, ack & 0xFFFF)
	b.encode_u8(2, clampi(u.ammo, 0, 255))
	b.encode_u8(3, clampi(int(round(u.reload_t * 50.0)), 0, 255))
	b.encode_u8(4, clampi(int(round(maxf(u.respawn_t, 0.0) * 20.0)), 0, 255))
	b.encode_s16(5, q16(u.vel.x, 100.0))
	b.encode_s16(7, q16(u.vel.y, 100.0))
	b.encode_s16(9, q16(u.vel.z, 100.0))
	b.encode_u16(11, clampi(u.kills, 0, 65535))
	b.encode_u16(13, clampi(u.deaths, 0, 65535))
	b.encode_u16(15, clampi(int(round(u.fire_cd * 1000.0)), 0, 65535))
	return b


static func enc_shots(shots: Array) -> PackedByteArray:
	var n := mini(shots.size(), MAX_SHOTS)
	var b := PackedByteArray()
	b.resize(1 + n * SHOT_BYTES)
	b.encode_u8(0, n)
	var o := 1
	for i in n:
		var s: Dictionary = shots[i]
		var a: Vector3 = s.a
		var e: Vector3 = s.b
		b.encode_u8(o, s.id)
		b.encode_u8(o + 1, 1 if s.hit else 0)
		b.encode_s16(o + 2, q16(a.x, 100.0))
		b.encode_s16(o + 4, q16(a.y, 100.0, 20.0))
		b.encode_s16(o + 6, q16(a.z, 100.0))
		b.encode_s16(o + 8, q16(e.x, 100.0))
		b.encode_s16(o + 10, q16(e.y, 100.0, 20.0))
		b.encode_s16(o + 12, q16(e.z, 100.0))
		o += SHOT_BYTES
	return b


static func enc_snapshot(world_part: PackedByteArray, local_part: PackedByteArray, shots_part: PackedByteArray) -> String:
	var b := PackedByteArray()
	b.append_array(world_part)
	b.append_array(local_part)
	b.append_array(shots_part)
	return b64(b)


## 디코드 결과: {tick, time, winner, tickets, pts:[[owner,cap,na,nb]], n, units: PackedFloat32Array(n*8),
##               local:{...}, shots:[{id,hit,a,b}]}
static func dec_snapshot(s: String) -> Dictionary:
	var b := unb64(s)
	if b.size() < HEAD_BYTES or b[0] != 83:
		return {}
	var n := b.decode_u16(34)
	var need := HEAD_BYTES + n * UNIT_BYTES + LOCAL_BYTES + 1
	if b.size() < need:
		return {}
	var d := {
		"tick": b.decode_u32(1),
		"time": b.decode_float(5),
		"winner": b.decode_s8(9),
		"tickets": [b.decode_u16(10), b.decode_u16(12)],
		"n": n,
	}
	var pts := []
	var o := 14
	for i in 5:
		pts.append([b.decode_s8(o), b.decode_s8(o + 1) / 127.0, b.decode_u8(o + 2), b.decode_u8(o + 3)])
		o += 4
	d.pts = pts
	var units := PackedFloat32Array()
	units.resize(n * 8)
	o = HEAD_BYTES
	for i in n:
		var k := i * 8
		units[k] = float(b.decode_u8(o))  # flags
		units[k + 1] = b.decode_s16(o + 1) / 100.0
		units[k + 2] = b.decode_s16(o + 3) / 100.0 - 20.0
		units[k + 3] = b.decode_s16(o + 5) / 100.0
		units[k + 4] = b.decode_u16(o + 7) / 65535.0 * TAU
		units[k + 5] = b.decode_s8(o + 9) / 127.0 * 1.5
		units[k + 6] = float(b.decode_u8(o + 10))  # hp
		units[k + 7] = b.decode_u8(o + 11) / 20.0  # speed
		o += UNIT_BYTES
	d.units = units
	d.local = {
		"ack": b.decode_u16(o),
		"ammo": b.decode_u8(o + 2),
		"reload_t": b.decode_u8(o + 3) / 50.0,
		"respawn_t": b.decode_u8(o + 4) / 20.0,
		"vel": Vector3(b.decode_s16(o + 5) / 100.0, b.decode_s16(o + 7) / 100.0, b.decode_s16(o + 9) / 100.0),
		"kills": b.decode_u16(o + 11),
		"deaths": b.decode_u16(o + 13),
		"fire_cd": b.decode_u16(o + 15) / 1000.0,
	}
	o += LOCAL_BYTES
	var ns := b.decode_u8(o)
	o += 1
	var shots := []
	for i in ns:
		if o + 14 > b.size():
			break
		shots.append({
			"id": b.decode_u8(o),
			"hit": b.decode_u8(o + 1) == 1,
			"a": Vector3(b.decode_s16(o + 2) / 100.0, b.decode_s16(o + 4) / 100.0 - 20.0, b.decode_s16(o + 6) / 100.0),
			"b": Vector3(b.decode_s16(o + 8) / 100.0, b.decode_s16(o + 10) / 100.0 - 20.0, b.decode_s16(o + 12) / 100.0),
		})
		o += 14
	d.shots = shots
	return d
