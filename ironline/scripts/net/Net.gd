class_name Net
extends Node
## PeerJS(WebRTC) 멀티플레이. 방장 브라우저가 Sim 을 돌리는 방장 권위 구조.
##   채널 'r' = 신뢰(JSON: 접속·로비·이벤트),  채널 'u' = 비신뢰(입력·스냅샷)
## 클라이언트는 자기 캐릭터를 예측하고(입력 재적용으로 보정), 다른 유닛은 ~110ms 과거로 보간해 그린다.

signal lobby_changed
signal match_start(info: Dictionary)
signal failed(msg: String)

enum Role { NONE, HOST, CLIENT }

const PREFIX := "ironline-"
const INTERP := 0.11
const SNAP_EVERY := 2  # 틱마다(30Hz/2 = 15Hz)

const GLUE := """
(function(){
if (window.IL) return;
var S = {peer:null, conns:{}, q:[], status:'idle', err:'', id:''};
function push(s){ S.q.push(s); }
function mkopts(cfg){
  var o = {debug:0, config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'},{urls:'stun:global.stun.twilio.com:3478'}]}};
  if (cfg && cfg.host){ o.host=cfg.host; o.port=cfg.port||443; o.secure=cfg.secure!==false; o.path=cfg.path||'/'; }
  return o;
}
function wire(c, label){
  var pid = c.peer;
  var rec = S.conns[pid] || (S.conns[pid] = {});
  rec[label] = c;
  c.on('open', function(){ push(pid+'|!|open:'+label); });
  c.on('data', function(d){ push(pid+'|'+label+'|'+d); });
  c.on('close', function(){ push(pid+'|!|close:'+label); });
  c.on('error', function(e){ push(pid+'|!|error:'+label+':'+((e&&e.type)||e)); });
}
window.IL = {
  ready: function(){ return typeof Peer !== 'undefined'; },
  host: function(code, cfgjson){
    var cfg = JSON.parse(cfgjson||'{}'); S.status='connecting'; S.err='';
    try {
      var p = new Peer('ironline-'+code, mkopts(cfg)); S.peer = p;
      p.on('open', function(id){ S.id=id; S.status='ready'; });
      p.on('error', function(e){ S.err=(e&&e.type)||String(e); if (S.status!=='ready') S.status='error'; });
      p.on('disconnected', function(){ S.err='signal-lost'; });
      p.on('connection', function(c){ wire(c, c.label); });
    } catch(e) { S.status='error'; S.err=String(e); }
  },
  join: function(code, cfgjson){
    var cfg = JSON.parse(cfgjson||'{}'); S.status='connecting'; S.err='';
    try {
      var p = new Peer(undefined, mkopts(cfg)); S.peer = p;
      p.on('open', function(id){
        S.id = id;
        var hid = 'ironline-'+code;
        var r = p.connect(hid, {label:'r', reliable:true, serialization:'raw'});
        var u = p.connect(hid, {label:'u', reliable:false, serialization:'raw'});
        wire(r,'r'); wire(u,'u');
      });
      p.on('error', function(e){ S.err=(e&&e.type)||String(e); S.status='error'; });
    } catch(e) { S.status='error'; S.err=String(e); }
  },
  send: function(pid, ch, data){ var r=S.conns[pid]; if (r && r[ch] && r[ch].open) { try { r[ch].send(data); } catch(e) {} } },
  bcast: function(ch, data){ for (var k in S.conns) { var c=S.conns[k][ch]; if (c && c.open) { try { c.send(data); } catch(e) {} } } },
  pop: function(){ if (!S.q.length) return ''; var r=S.q.join('\\n'); S.q.length=0; return r; },
  state: function(){ return S.status+'|'+S.err+'|'+S.id; },
  close: function(){ try { if (S.peer) S.peer.destroy(); } catch(e) {} S.peer=null; S.conns={}; S.q.length=0; S.status='idle'; }
};
})();
"""

var role := Role.NONE
var code := ""
var my_name := "플레이어"
var my_slot := -1
var my_team := 0
var cfg := {"seed": 20260101, "bots": 30}
var peer_cfg := {}
var started := false
var players: Array = []  # [{slot,name,team,host}]
var names := {}
var status := "idle"
var err := ""
var il: JavaScriptObject
var clock := 0.0
var last_msg := 0.0

# --- 방장
var peers := {}  # pid -> {slot,name,team,loadout,inq,last,ack,open_r,open_u,seen}
var pending_events: Array = []
var shots_out: Array = []
var snap_tick := 0
var score_t := 0.0

# --- 클라이언트
var seq := 0
var hist: Array = []
var snaps: Array = []
var last_snap_tick := -1
var pending_local := {}
var local_ready := false
var _scratch: Sim.Unit
var hello_sent := false
var peer_id := ""


static func available() -> bool:
	if not OS.has_feature("web"):
		return false
	return bool(JavaScriptBridge.eval("typeof Peer !== 'undefined'", true))


func _ensure_js() -> bool:
	if il != null:
		return true
	if not available():
		return false
	JavaScriptBridge.eval(GLUE, true)
	il = JavaScriptBridge.get_interface("IL")
	return il != null


func shutdown() -> void:
	if il != null:
		il.close()
	role = Role.NONE
	peers.clear()
	players.clear()
	started = false
	status = "idle"
	local_ready = false
	hello_sent = false


# ---------------------------------------------------------------- 방 만들기 / 참가

static func make_code() -> String:
	var chars := "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	var s := ""
	for i in 5:
		s += chars[randi() % chars.length()]
	return s


func host_room(room_code: String, pname: String, team: int, room_cfg: Dictionary, pcfg: Dictionary = {}) -> bool:
	if not _ensure_js():
		failed.emit("이 환경에서는 멀티플레이를 쓸 수 없어요 (웹 빌드에서만 지원)")
		return false
	shutdown()
	_ensure_js()
	role = Role.HOST
	code = room_code
	my_name = _clean(pname)
	cfg = room_cfg.duplicate()
	peer_cfg = pcfg
	my_slot = _free_slot(team)
	my_team = my_slot / Sim.HUMANS_PER_TEAM
	names = {str(my_slot): my_name}
	status = "connecting"
	il.host(code, JSON.stringify(pcfg))
	_refresh_players()
	return true


func join_room(room_code: String, pname: String, team_pref: int, pcfg: Dictionary = {}) -> bool:
	if not _ensure_js():
		failed.emit("이 환경에서는 멀티플레이를 쓸 수 없어요 (웹 빌드에서만 지원)")
		return false
	shutdown()
	_ensure_js()
	role = Role.CLIENT
	code = room_code.to_upper().strip_edges()
	my_name = _clean(pname)
	my_team = team_pref
	peer_cfg = pcfg
	status = "connecting"
	last_msg = clock
	il.join(code, JSON.stringify(pcfg))
	return true


func _clean(s: String) -> String:
	var t := s.strip_edges().replace("|", "").replace("\n", "").replace("\"", "")
	if t.length() > 12:
		t = t.substr(0, 12)
	return t if t != "" else "플레이어"


func _used_slots() -> Dictionary:
	var used := {}
	if role == Role.HOST and my_slot >= 0:
		used[my_slot] = true
	for pid in peers:
		used[peers[pid].slot] = true
	return used


func _free_slot(team: int) -> int:
	var used := _used_slots()
	var order := [0, 1] if team == 0 else ([1, 0] if team == 1 else ([0, 1] if _team_count(0) <= _team_count(1) else [1, 0]))
	for t in order:
		for k in Sim.HUMANS_PER_TEAM:
			var id: int = t * Sim.HUMANS_PER_TEAM + k
			if not used.has(id):
				return id
	return -1


func _team_count(t: int) -> int:
	var n := 0
	var used := _used_slots()
	for id in used:
		if int(id) / Sim.HUMANS_PER_TEAM == t:
			n += 1
	return n


func _refresh_players() -> void:
	players.clear()
	if role != Role.HOST:
		return
	players.append({"slot": my_slot, "name": my_name, "team": my_slot / Sim.HUMANS_PER_TEAM, "host": true})
	for pid in peers:
		var p: Dictionary = peers[pid]
		if p.joined:
			players.append({"slot": p.slot, "name": p.name, "team": p.slot / Sim.HUMANS_PER_TEAM, "host": false})
	lobby_changed.emit()


func _lobby_json() -> String:
	return JSON.stringify({"t": "lobby", "players": players, "cfg": cfg, "started": started})


func broadcast_lobby() -> void:
	if role != Role.HOST or il == null:
		return
	il.bcast("r", _lobby_json())
	_refresh_players()


# ---------------------------------------------------------------- 메시지 루프

func poll(dt: float) -> void:
	clock += dt
	if il == null or role == Role.NONE:
		return
	var st: String = il.state()
	var parts := st.split("|", true, 2)
	if parts.size() >= 2:
		var new_status: String = parts[0]
		if new_status == "error" and status != "error":
			err = parts[1]
			failed.emit(_err_text(parts[1]))
		if new_status == "ready" and role == Role.HOST and status != "ready":
			status = "ready"
			lobby_changed.emit()
		elif new_status != "ready":
			status = new_status
		if parts.size() >= 3:
			peer_id = parts[2]
	var raw: String = il.pop()
	if raw != "":
		for line in raw.split("\n", false):
			var f := line.split("|", true, 2)
			if f.size() < 3:
				continue
			if role == Role.HOST:
				_host_msg(f[0], f[1], f[2])
			else:
				_client_msg(f[0], f[1], f[2])
	if role == Role.HOST and started:
		for pid in peers.keys():
			if clock - peers[pid].seen > 12.0:
				_drop_peer(pid)
	elif role == Role.CLIENT and local_ready and clock - last_msg > 10.0:
		failed.emit("방장과의 연결이 끊어졌어요")
		shutdown()


func _err_text(e: String) -> String:
	match e:
		"peer-unavailable": return "방을 찾을 수 없어요. 코드를 확인해 주세요"
		"unavailable-id": return "이미 같은 코드의 방이 있어요. 다시 시도해 주세요"
		"network": return "시그널링 서버에 연결할 수 없어요"
		"server-error": return "시그널링 서버 오류"
		"browser-incompatible": return "이 브라우저는 WebRTC 를 지원하지 않아요"
	return "연결 오류: " + e


# ---------------------------------------------------------------- 방장: 수신

func _host_msg(pid: String, ch: String, payload: String) -> void:
	if ch == "!":
		if payload.begins_with("open:"):
			if not peers.has(pid):
				peers[pid] = {"slot": -1, "name": "", "team": 0, "loadout": 0, "inq": [], "last": {}, "ack": 0,
					"open_r": false, "open_u": false, "seen": clock, "joined": false}
			peers[pid]["open_" + payload.substr(5)] = true
		elif payload.begins_with("close:"):
			_drop_peer(pid)
		return
	if not peers.has(pid):
		return
	var p: Dictionary = peers[pid]
	p.seen = clock
	if ch == "u":
		var inp := Proto.dec_input(payload)
		if not inp.is_empty():
			if p.inq.size() < 8:
				p.inq.append(inp)
		return
	var msg: Variant = JSON.parse_string(payload)
	if typeof(msg) != TYPE_DICTIONARY:
		return
	match str(msg.get("t", "")):
		"hello":
			_on_hello(pid, msg)
		"team":
			if p.joined and not started:
				_change_team(pid, int(msg.get("team", 0)))
		"loadout":
			p.loadout = clampi(int(msg.get("w", 0)), 0, 2)


func _on_hello(pid: String, msg: Dictionary) -> void:
	var p: Dictionary = peers[pid]
	if p.joined:
		return
	if str(msg.get("v", "")) != Proto.BUILD:
		_send_r(pid, {"t": "deny", "why": "게임 버전이 달라요 (방장 %s / 내 %s)" % [Proto.BUILD, str(msg.get("v", "?"))]})
		return
	var slot := _free_slot(int(msg.get("team", -1)))
	if slot < 0:
		_send_r(pid, {"t": "deny", "why": "방이 가득 찼어요 (사람 6명)"})
		return
	p.slot = slot
	p.name = _clean(str(msg.get("name", "")))
	p.team = slot / Sim.HUMANS_PER_TEAM
	p.joined = true
	names[str(slot)] = p.name
	_send_r(pid, {"t": "welcome", "slot": slot, "team": p.team, "cfg": cfg, "started": started, "v": Proto.BUILD, "names": names})
	broadcast_lobby()
	if started:
		match_start_late.emit(pid, slot)


signal match_start_late(pid: String, slot: int)


func _change_team(pid: String, team: int) -> void:
	var p: Dictionary = peers[pid]
	var old: int = p.slot
	p.slot = -1
	var s := _free_slot(team)
	p.slot = s if s >= 0 else old
	p.team = p.slot / Sim.HUMANS_PER_TEAM
	names.erase(str(old))
	names[str(p.slot)] = p.name
	_send_r(pid, {"t": "slot", "slot": p.slot, "team": p.team})
	broadcast_lobby()


func host_set_team(team: int) -> void:
	if role != Role.HOST or started:
		return
	var old := my_slot
	my_slot = -1
	var s := _free_slot(team)
	my_slot = s if s >= 0 else old
	my_team = my_slot / Sim.HUMANS_PER_TEAM
	names.erase(str(old))
	names[str(my_slot)] = my_name
	broadcast_lobby()


func _drop_peer(pid: String) -> void:
	if not peers.has(pid):
		return
	var p: Dictionary = peers[pid]
	peers.erase(pid)
	names.erase(str(p.slot))
	peer_left.emit(p.slot)
	broadcast_lobby()


signal peer_left(slot: int)


func _send_r(pid: String, d: Dictionary) -> void:
	if il != null:
		il.send(pid, "r", JSON.stringify(d))


func start_match() -> void:
	if role != Role.HOST or started:
		return
	started = true
	il.bcast("r", JSON.stringify({"t": "start", "cfg": cfg, "names": names}))
	broadcast_lobby()
	match_start.emit({"cfg": cfg, "slot": my_slot, "names": names})


# ---------------------------------------------------------------- 방장: 매 틱

## 큐에 쌓인 입력을 하나씩 꺼내 Sim 에 적용한다.
func host_apply_inputs(sim: Sim) -> void:
	for pid in peers:
		var p: Dictionary = peers[pid]
		if not p.joined or p.slot < 0:
			continue
		var u: Sim.Unit = sim.units[p.slot]
		if u.is_bot:
			sim.claim_slot(p.slot, p.loadout)
			u.label = str(names.get(str(p.slot), "P%d" % p.slot))
		u.loadout = p.loadout
		var inp: Dictionary = p.last
		if p.inq.size() > 0:
			inp = p.inq.pop_front()
			p.last = inp
			p.ack = inp.seq
		if inp.is_empty():
			continue
		var b: int = inp.btn
		sim.set_input(p.slot, inp.move, inp.yaw, inp.pitch, (b & Proto.BTN_FIRE) != 0,
			(b & Proto.BTN_JUMP) != 0, (b & Proto.BTN_SPRINT) != 0, (b & Proto.BTN_RELOAD) != 0, (b & Proto.BTN_ADS) != 0)


## sim.step 직후 호출: 이벤트를 모으고 주기적으로 스냅샷을 보낸다.
func host_after_step(sim: Sim, dt: float, from_idx: int) -> void:
	for i in range(from_idx, sim.events.size()):
		var e: Dictionary = sim.events[i]
		match e.t:
			"shot":
				shots_out.append(e)
			"kill", "cap", "end":
				pending_events.append(e)
			"hit":
				pending_events.append(e)
	snap_tick += 1
	if pending_events.size() > 0 and il != null:
		_flush_events(sim)
	if snap_tick % SNAP_EVERY == 0 and il != null and peers.size() > 0:
		_send_snapshots(sim)
		shots_out.clear()
	elif shots_out.size() > 64:
		shots_out = shots_out.slice(shots_out.size() - 48)
	score_t -= dt
	if score_t <= 0.0 and il != null and peers.size() > 0:
		score_t = 2.0
		var ks := []
		var ds := []
		var human := []
		for u in sim.units:
			ks.append(u.kills)
			ds.append(u.deaths)
		il.bcast("r", JSON.stringify({"t": "score", "k": ks, "d": ds, "n": names}))


func _flush_events(sim: Sim) -> void:
	var common := []
	for e in pending_events:
		if e.t == "hit":
			continue
		common.append(_ev_json(e))
	if common.size() > 0:
		il.bcast("r", JSON.stringify({"t": "ev", "e": common}))
	for pid in peers:
		var p: Dictionary = peers[pid]
		if not p.joined:
			continue
		var mine := []
		for e in pending_events:
			if e.t == "hit" and (e.a == p.slot or e.v == p.slot):
				mine.append(_ev_json(e))
		if mine.size() > 0:
			_send_r(pid, {"t": "ev", "e": mine})
	pending_events.clear()


func _ev_json(e: Dictionary) -> Dictionary:
	var d := {}
	for k in e:
		d[k] = e[k]
	return d


func _send_snapshots(sim: Sim) -> void:
	var world_part := Proto.enc_world(sim)
	var shots_part := Proto.enc_shots(shots_out)
	for pid in peers:
		var p: Dictionary = peers[pid]
		if not p.joined or p.slot < 0:
			continue
		var u: Sim.Unit = sim.units[p.slot]
		var snap := Proto.enc_snapshot(world_part, Proto.enc_local(u, p.ack), shots_part)
		il.send(pid, "u", snap)


# ---------------------------------------------------------------- 클라이언트: 수신

func _client_msg(pid: String, ch: String, payload: String) -> void:
	last_msg = clock
	if ch == "!":
		if payload == "open:r" and not hello_sent:
			hello_sent = true
			il.send(pid, "r", JSON.stringify({"t": "hello", "name": my_name, "team": my_team, "v": Proto.BUILD}))
		elif payload.begins_with("close:"):
			failed.emit("방장과의 연결이 끊어졌어요")
			shutdown()
		elif payload.begins_with("error:"):
			failed.emit("연결 오류: " + payload.substr(6))
		return
	if ch == "u":
		var d := Proto.dec_snapshot(payload)
		if not d.is_empty():
			snaps_in.append(d)
		return
	var msg: Variant = JSON.parse_string(payload)
	if typeof(msg) != TYPE_DICTIONARY:
		return
	match str(msg.get("t", "")):
		"deny":
			failed.emit(str(msg.get("why", "입장이 거부됐어요")))
			shutdown()
		"welcome":
			my_slot = int(msg.slot)
			my_team = int(msg.team)
			cfg = msg.cfg
			names = msg.names
			status = "joined"
			lobby_changed.emit()
			if bool(msg.started):
				started = true
				match_start.emit({"cfg": cfg, "slot": my_slot, "names": names})
		"slot":
			my_slot = int(msg.slot)
			my_team = int(msg.team)
			lobby_changed.emit()
		"lobby":
			players = msg.players
			cfg = msg.cfg
			lobby_changed.emit()
		"start":
			started = true
			cfg = msg.cfg
			names = msg.names
			match_start.emit({"cfg": cfg, "slot": my_slot, "names": names})
		"ev":
			for e in msg.e:
				events_in.append(e)
		"score":
			score_in = msg


var snaps_in: Array = []
var events_in: Array = []
var score_in: Dictionary = {}


func send_team(team: int) -> void:
	if role == Role.CLIENT and il != null:
		il.send(_host_pid(), "r", JSON.stringify({"t": "team", "team": team}))


func send_loadout(w: int) -> void:
	if role == Role.CLIENT and il != null:
		il.send(_host_pid(), "r", JSON.stringify({"t": "loadout", "w": w}))
	elif role == Role.HOST:
		pass


func _host_pid() -> String:
	return PREFIX + code


# ---------------------------------------------------------------- 클라이언트: 매 틱 / 매 프레임

func client_begin(sim: Sim) -> void:
	local_ready = true
	started = true
	hist.clear()
	snaps.clear()
	last_snap_tick = -1
	seq = 0
	_scratch = Sim.Unit.new()
	last_msg = clock
	for k in names:
		var id := int(k)
		if id < sim.units.size():
			sim.units[id].label = str(names[k])
			sim.units[id].is_bot = false


## 30Hz: 입력을 보내고 로컬 유닛을 예측한다.
func client_tick(sim: Sim, move: Vector2, yaw: float, pitch: float, btn: int) -> void:
	var u: Sim.Unit = sim.units[my_slot]
	seq = (seq + 1) & 0xFFFF
	u.prev_pos = u.pos
	u.prev_yaw = u.yaw
	u.yaw = yaw
	u.pitch = pitch
	if u.alive:
		u.in_move = move
		u.in_jump = (btn & Proto.BTN_JUMP) != 0
		u.in_sprint = (btn & Proto.BTN_SPRINT) != 0
		u.in_fire = (btn & Proto.BTN_FIRE) != 0
		u.in_ads = (btn & Proto.BTN_ADS) != 0
		sim.predict_local(u, Sim.TICK)
	hist.append({"seq": seq, "move": move, "yaw": yaw, "btn": btn})
	if hist.size() > 90:
		hist.pop_front()
	il.send(_host_pid(), "u", Proto.enc_input(seq, move, yaw, pitch, btn))


## 받은 스냅샷/이벤트를 Sim 에 반영한다. 프레임마다 호출.
func client_frame(sim: Sim, dt: float) -> void:
	for d in snaps_in:
		_apply_snapshot(sim, d)
	snaps_in.clear()
	for e in events_in:
		_push_event(sim, e)
	events_in.clear()
	if not score_in.is_empty():
		var ks: Array = score_in.k
		var ds: Array = score_in.d
		for i in mini(ks.size(), sim.units.size()):
			if i != my_slot:
				sim.units[i].kills = int(ks[i])
				sim.units[i].deaths = int(ds[i])
		if score_in.has("n"):
			for k in score_in.n:
				var id := int(k)
				if id < sim.units.size():
					sim.units[id].label = str(score_in.n[k])
					sim.units[id].is_bot = false
		score_in = {}
	_interpolate(sim, dt)


func _push_event(sim: Sim, e: Dictionary) -> void:
	var ev := e.duplicate()
	for k in ["i", "o", "prev", "k", "v", "w", "a", "id"]:
		if ev.has(k):
			ev[k] = int(ev[k])
	if ev.t == "end":
		sim.winner = int(ev.w)
		sim.win_reason = str(ev.reason)
		ev.w = int(ev.w)
	sim.events.append(ev)


func _apply_snapshot(sim: Sim, d: Dictionary) -> void:
	if int(d.tick) <= last_snap_tick and last_snap_tick - int(d.tick) < 1000:
		return
	last_snap_tick = int(d.tick)
	sim.tick_count = d.tick
	sim.time = d.time
	sim.tickets = d.tickets
	if d.winner >= 0 and sim.winner < 0:
		sim.winner = d.winner
	for i in mini(d.pts.size(), sim.pts.size()):
		var p: Sim.Pt = sim.pts[i]
		var q: Array = d.pts[i]
		p.owner = q[0]
		p.cap = q[1]
		p.n_a = q[2]
		p.n_b = q[3]
	snaps.append({"t": clock, "units": d.units})
	if snaps.size() > 8:
		snaps.pop_front()
	var units: PackedFloat32Array = d.units
	var local: Dictionary = d.local
	var u: Sim.Unit = sim.units[my_slot]
	var k := my_slot * 8
	var flags := int(units[k])
	var alive := (flags & 1) != 0
	u.hp = units[k + 6]
	u.weapon = (flags >> 3) & 3
	u.ammo = local.ammo
	u.reload_t = local.reload_t
	u.respawn_t = local.respawn_t
	u.kills = local.kills
	u.deaths = local.deaths
	u.fire_cd = local.fire_cd
	var auth := Vector3(units[k + 1], units[k + 2], units[k + 3])
	if alive and not u.alive:
		u.alive = true
		u.death_age = 0.0
		u.pos = auth
		u.prev_pos = auth
		u.vel = local.vel
		u.yaw = units[k + 4]
		u.prev_yaw = u.yaw
		hist.clear()
		u.inv_t = 1.0
	elif not alive and u.alive:
		u.alive = false
		u.death_age = 0.0
		u.vel = Vector3.ZERO
	elif alive:
		_reconcile(sim, u, auth, local, (flags & 2) != 0)
	for ev in d.shots:
		sim.events.append({"t": "shot", "id": ev.id, "team": sim.units[ev.id].team if ev.id < sim.units.size() else 0,
			"a": ev.a, "b": ev.b, "hit": ev.hit})


func _seq_after(a: int, b: int) -> bool:
	return ((a - b) & 0xFFFF) != 0 and ((a - b) & 0xFFFF) < 32768


func _reconcile(sim: Sim, u: Sim.Unit, auth: Vector3, local: Dictionary, on_ground: bool) -> void:
	var ack: int = local.ack
	while hist.size() > 0 and not _seq_after(hist[0].seq, ack):
		hist.pop_front()
	var s := _scratch
	s.pos = auth
	s.vel = local.vel
	s.on_ground = on_ground
	s.alive = true
	s.is_bot = false
	s.reload_t = u.reload_t
	for h in hist:
		s.yaw = h.yaw
		s.in_move = h.move
		s.in_jump = (h.btn & Proto.BTN_JUMP) != 0
		s.in_sprint = (h.btn & Proto.BTN_SPRINT) != 0
		s.in_fire = (h.btn & Proto.BTN_FIRE) != 0
		s.in_ads = (h.btn & Proto.BTN_ADS) != 0
		sim._integrate(s, Sim.TICK)
	var err_v := s.pos - u.pos
	if err_v.length() > 1.8:
		u.pos = s.pos
		u.prev_pos = s.pos
		u.vel = s.vel
	else:
		u.pos += err_v * 0.25
		u.vel = s.vel
	u.on_ground = s.on_ground


func _interpolate(sim: Sim, dt: float) -> void:
	if snaps.is_empty():
		return
	var rt := clock - INTERP
	var a: Dictionary = snaps[0]
	var b: Dictionary = snaps[snaps.size() - 1]
	for i in snaps.size() - 1:
		if snaps[i].t <= rt and snaps[i + 1].t >= rt:
			a = snaps[i]
			b = snaps[i + 1]
			break
	var f := 1.0
	if b.t > a.t:
		f = clampf((rt - a.t) / (b.t - a.t), 0.0, 1.0)
	var ua: PackedFloat32Array = a.units
	var ub: PackedFloat32Array = b.units
	var n := mini(ub.size() / 8, sim.units.size())
	for i in n:
		if i == my_slot:
			continue
		var u: Sim.Unit = sim.units[i]
		var k := i * 8
		var flags := int(ub[k])
		var alive := (flags & 1) != 0
		if alive and not u.alive:
			u.alive = true
			u.death_age = 0.0
		elif not alive and u.alive:
			u.alive = false
			u.death_age = 0.0
		if not alive:
			u.death_age += dt
		var pa := Vector3(ua[k + 1], ua[k + 2], ua[k + 3])
		var pb := Vector3(ub[k + 1], ub[k + 2], ub[k + 3])
		var p := pb if pa.distance_squared_to(pb) > 64.0 else pa.lerp(pb, f)
		u.pos = p
		u.prev_pos = p
		var y := lerp_angle(ua[k + 4], ub[k + 4], f)
		u.yaw = y
		u.prev_yaw = y
		u.pitch = ub[k + 5]
		u.hp = ub[k + 6]
		u.speed_now = ub[k + 7]
		u.on_ground = (flags & 2) != 0
		u.weapon = (flags >> 3) & 3
		u.is_bot = (flags & 64) == 0
		u.vel = Vector3.ZERO
	# 자신이 죽어 있으면 death_age 증가
	var me: Sim.Unit = sim.units[my_slot]
	if not me.alive:
		me.death_age += dt
