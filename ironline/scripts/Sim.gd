class_name Sim
extends RefCounted
## 권위 시뮬레이션. 씬 노드·렌더에 의존하지 않는다(헤드리스 테스트 가능, 방장 브라우저에서만 돌린다).
## 30Hz 고정 틱. 사람 슬롯 6개(팀당 3명, id 0~5)는 비어 있으면 봇이 채우고, 나머지는 순수 봇이다.

const TICK := 1.0 / 30.0
const GRAV := 17.0
const WALK := 4.8
const SPRINT := 5.8
const JUMP := 5.6
const EYE := 1.62
const RADIUS := 0.38
const START_TICKETS := 250
const MATCH_TIME := 480.0
const POINT_RATE := 0.022
const BLEED_EVERY := 4.0
const NPOINTS := 5
const HUMANS_PER_TEAM := 3

const WEAPONS := [
	{"name": "볼트액션 소총", "dmg": 70.0, "cd": 1.15, "mag": 5, "reload": 2.9, "spread": 0.0015,
	 "range": 240.0, "auto": false, "fall0": 150.0, "bot_hit": 0.42, "bot_cd": 2.4},
	{"name": "기관단총", "dmg": 17.0, "cd": 0.085, "mag": 32, "reload": 2.3, "spread": 0.022,
	 "range": 90.0, "auto": true, "fall0": 25.0, "bot_hit": 0.24, "bot_cd": 3.4},
	{"name": "경기관총", "dmg": 24.0, "cd": 0.11, "mag": 50, "reload": 4.2, "spread": 0.014,
	 "range": 160.0, "auto": true, "fall0": 70.0, "bot_hit": 0.22, "bot_cd": 3.2},
]


class Unit:
	var id := 0
	var team := 0
	var is_bot := true
	var alive := false
	var pos := Vector3.ZERO
	var prev_pos := Vector3.ZERO
	var vel := Vector3.ZERO
	var yaw := 0.0
	var prev_yaw := 0.0
	var pitch := 0.0
	var hp := 100.0
	var weapon := 0
	var loadout := 0
	var ammo := 0
	var fire_cd := 0.0
	var reload_t := 0.0
	var respawn_t := 1.0
	var inv_t := 0.0
	var death_age := 0.0
	var kills := 0
	var deaths := 0
	var on_ground := true
	var speed_now := 0.0
	var trigger_held := false
	# 입력 (사람은 네트워크/키보드, 봇은 AI가 채운다)
	var in_move := Vector2.ZERO  # x: 오른쪽, y: 앞
	var in_jump := false
	var in_fire := false
	var in_reload := false
	var in_sprint := false
	var in_ads := false
	# 봇 상태
	var role := 0  # 0 돌격 1 방어
	var target := -1
	var think_t := 0.0
	var wp := Vector3.ZERO
	var wp_t := 0.0
	var obj := -1
	var strafe := 1.0
	var strafe_t := 0.0
	var avoid_sign := 1.0
	var bot_speed := 4.6
	var stuck_t := 0.0
	var last_pos := Vector3.ZERO
	var label := ""
	var killer := -1
	var kill_w := 0
	var kill_dist := 0.0
	var kill_hp := 0.0


class Pt:
	var pos := Vector3.ZERO
	var owner := -1  # -1 중립, 0 팀A, 1 팀B
	var cap := 0.0  # -1(B 완전 점령) ~ +1(A 완전 점령)
	var n_a := 0
	var n_b := 0


var world: World
var rng := RandomNumberGenerator.new()
var units: Array = []
var pts: Array = []
var tickets := [START_TICKETS, START_TICKETS]
var time := 0.0
var winner := -1  # -1 진행중, 0/1 승리 팀, 2 무승부
var win_reason := ""
var events: Array = []
var tick_count := 0
var bleed_t := 0.0
var _grid := {}
var _grid_t := 0.0


func setup(seed_v: int, per_team: int) -> void:
	rng.seed = seed_v
	world = World.new(seed_v)
	reset(per_team)


## 월드는 그대로 두고 유닛·거점·병력·시간을 처음 상태로 되돌린다(메뉴 배경 → 본 게임 전환용).
func reset(per_team: int) -> void:
	tickets = [START_TICKETS, START_TICKETS]
	bleed_t = 0.0
	time = 0.0
	winner = -1
	win_reason = ""
	events.clear()
	tick_count = 0
	_grid.clear()
	_grid_t = 0.0
	pts.clear()
	for i in NPOINTS:
		var p := Pt.new()
		p.pos = world.point_pos(i)
		if i == 0:
			p.owner = 0
			p.cap = 1.0
		elif i == NPOINTS - 1:
			p.owner = 1
			p.cap = -1.0
		pts.append(p)
	units.clear()
	for t in 2:
		for k in HUMANS_PER_TEAM:
			_new_unit(t)
	var extra := maxi(0, per_team - HUMANS_PER_TEAM)
	for k in extra:
		for t in 2:
			_new_unit(t)


func _new_unit(team: int) -> Unit:
	var u := Unit.new()
	u.id = units.size()
	u.team = team
	u.is_bot = true
	u.respawn_t = rng.randf_range(0.3, 5.0)
	u.weapon = _bot_weapon()
	u.avoid_sign = 1.0 if rng.randf() < 0.5 else -1.0
	u.label = "%s%d" % ["A" if team == 0 else "B", u.id]
	units.append(u)
	return u


func _bot_weapon() -> int:
	var r := rng.randf()
	if r < 0.25:
		return 0
	if r < 0.7:
		return 1
	return 2


func claim_slot(id: int, loadout: int = 0) -> void:
	var u: Unit = units[id]
	u.is_bot = false
	u.loadout = loadout
	u.weapon = loadout
	u.label = "P%d" % id
	if not u.alive:
		if u.deaths == 0 and tickets[u.team] > 0:
			_spawn(u)  # 아직 한 번도 죽지 않았다면(경기 시작·첫 접속) 기다리지 않고 바로 투입한다
		else:
			u.respawn_t = minf(u.respawn_t, 0.15)


## 슬롯을 다시 봇에게 돌려준다(접속 종료).
func release_slot(id: int) -> void:
	var u: Unit = units[id]
	u.is_bot = true
	u.in_move = Vector2.ZERO
	u.in_fire = false
	u.label = "%s%d" % ["A" if u.team == 0 else "B", u.id]


## 클라이언트 예측: 서버와 같은 이동 함수를 로컬 유닛에만 적용한다.
func predict_local(u: Unit, dt: float) -> void:
	u.fire_cd = maxf(0.0, u.fire_cd - dt)
	_integrate(u, dt)


func set_input(id: int, move: Vector2, yaw: float, pitch: float, fire: bool, jump: bool,
		sprint: bool, reload: bool, ads: bool = false) -> void:
	var u: Unit = units[id]
	if u.is_bot:
		return
	u.in_move = move
	u.yaw = yaw
	u.pitch = pitch
	u.in_fire = fire
	u.in_jump = jump
	u.in_sprint = sprint
	u.in_ads = ads
	if reload:
		u.in_reload = true


func team_alive(team: int) -> int:
	var n := 0
	for u in units:
		if u.team == team and u.alive:
			n += 1
	return n


func owned_count(team: int) -> int:
	var n := 0
	for p in pts:
		if p.owner == team:
			n += 1
	return n


# ---------------------------------------------------------------- 메인 루프

func step(dt: float) -> void:
	if winner >= 0:
		for u in units:
			if not u.alive:
				u.death_age += dt
		return
	tick_count += 1
	time += dt
	for u in units:
		u.prev_pos = u.pos
		u.prev_yaw = u.yaw
	_grid_t -= dt
	if _grid_t <= 0.0:
		_rebuild_grid()
		_grid_t = 0.1
	for u in units:
		_step_unit(u, dt)
	_step_points(dt)
	_bleed(dt)
	_check_end()
	if events.size() > 400:
		events = events.slice(events.size() - 200)


func _step_unit(u: Unit, dt: float) -> void:
	if not u.alive:
		u.death_age += dt
		u.respawn_t -= dt
		if u.respawn_t <= 0.0 and tickets[u.team] > 0:
			_spawn(u)
		return
	if u.inv_t > 0.0:
		u.inv_t -= dt
	u.fire_cd = maxf(0.0, u.fire_cd - dt)
	if u.reload_t > 0.0:
		u.reload_t -= dt
		if u.reload_t <= 0.0:
			u.ammo = WEAPONS[u.weapon].mag
	if u.is_bot:
		_bot_ai(u, dt)
	else:
		if u.in_reload:
			_start_reload(u)
			u.in_reload = false
		if u.in_fire:
			_try_fire(u)
		u.trigger_held = u.in_fire
	_integrate(u, dt)


func _integrate(u: Unit, dt: float) -> void:
	var sp: float = u.bot_speed if u.is_bot else (SPRINT if (u.in_sprint and u.in_move.y > 0.5 and not u.in_fire) else WALK)
	if u.reload_t > 0.0 and not u.is_bot:
		sp *= 0.85
	if u.in_ads and not u.is_bot:
		sp *= 0.62
	var wish := Vector3(u.in_move.x, 0.0, -u.in_move.y)
	if wish.length() > 1.0:
		wish = wish.normalized()
	wish = wish.rotated(Vector3.UP, u.yaw) * sp
	var accel := 38.0 if u.on_ground else 7.0
	var hv := Vector2(u.vel.x, u.vel.z).move_toward(Vector2(wish.x, wish.z), accel * dt)
	u.vel.x = hv.x
	u.vel.z = hv.y
	if u.in_jump and u.on_ground:
		u.vel.y = JUMP
		u.on_ground = false
	var nx := u.pos.x + u.vel.x * dt
	if world.block_top(nx, u.pos.z, RADIUS, u.pos.y) > -1e8:
		u.vel.x = 0.0
	else:
		u.pos.x = nx
	var nz := u.pos.z + u.vel.z * dt
	if world.block_top(u.pos.x, nz, RADIUS, u.pos.y) > -1e8:
		u.vel.z = 0.0
	else:
		u.pos.z = nz
	u.pos.x = clampf(u.pos.x, -World.HALF_X + 1.5, World.HALF_X - 1.5)
	u.pos.z = clampf(u.pos.z, -World.HALF_Z + 1.5, World.HALF_Z - 1.5)
	u.vel.y -= GRAV * dt
	u.pos.y += u.vel.y * dt
	var g := world.ground_y(u.pos.x, u.pos.z, u.pos.y)
	if u.pos.y <= g or (u.on_ground and u.vel.y <= 0.0 and u.pos.y - g < 0.5):
		u.pos.y = g
		u.vel.y = 0.0
		u.on_ground = true
	else:
		u.on_ground = false
	u.speed_now = hv.length()


# ---------------------------------------------------------------- 전투

func _aim_dir(yaw: float, pitch: float) -> Vector3:
	return Vector3(-sin(yaw) * cos(pitch), sin(pitch), -cos(yaw) * cos(pitch))


func _start_reload(u: Unit) -> void:
	var w: Dictionary = WEAPONS[u.weapon]
	if u.reload_t > 0.0 or u.ammo >= w.mag:
		return
	u.reload_t = w.reload
	events.append({"t": "reload", "id": u.id})


func _try_fire(u: Unit) -> void:
	var w: Dictionary = WEAPONS[u.weapon]
	if u.fire_cd > 0.0 or u.reload_t > 0.0:
		return
	if u.ammo <= 0:
		_start_reload(u)
		return
	if not w.auto and u.trigger_held:
		return
	u.ammo -= 1
	u.fire_cd = w.cd
	var spread: float = w.spread * (1.0 + u.speed_now * 0.12) * (0.3 if u.in_ads else 1.0)
	var dir := _aim_dir(u.yaw, u.pitch)
	dir = (dir + Vector3(rng.randfn(0.0, spread), rng.randfn(0.0, spread), rng.randfn(0.0, spread))).normalized()
	var origin := u.pos + Vector3(0.0, EYE, 0.0)
	_hitscan(u, origin, dir, w)


func _hitscan(u: Unit, origin: Vector3, dir: Vector3, w: Dictionary) -> void:
	var best_t: float = world.raycast(origin, dir, w.range)
	var best: Unit = null
	var head := false
	var dh := Vector2(dir.x, dir.z)
	var l2 := dh.length_squared()
	if l2 > 1e-6:
		for e in units:
			if not e.alive or e.team == u.team:
				continue
			var to: Vector3 = e.pos - origin
			var t := Vector2(to.x, to.z).dot(dh) / l2
			if t < 0.0 or t > best_t:
				continue
			var p := origin + dir * t
			var dxz := Vector2(p.x - e.pos.x, p.z - e.pos.z).length()
			if dxz > 0.5:
				continue
			var rel: float = p.y - e.pos.y
			if rel < 0.0 or rel > 1.9:
				continue
			best_t = t
			best = e
			head = rel > 1.52 and dxz < 0.33
	var end := origin + dir * best_t
	events.append({"t": "shot", "id": u.id, "team": u.team, "a": origin + dir * 0.9 + Vector3(0, -0.15, 0), "b": end, "hit": best != null})
	if best:
		var dmg: float = w.dmg * _falloff(w, best_t) * (2.0 if head else 1.0)
		damage(best, dmg, u, head)


func _falloff(w: Dictionary, dist: float) -> float:
	return clampf(1.0 - maxf(0.0, dist - w.fall0) / (w.range - w.fall0 + 1.0), 0.4, 1.0)


func damage(e: Unit, amount: float, attacker: Unit, head: bool) -> void:
	if not e.alive or e.inv_t > 0.0:
		return
	e.hp -= amount
	events.append({"t": "hit", "a": attacker.id, "v": e.id, "head": head, "dmg": amount})
	if e.hp <= 0.0:
		e.alive = false
		e.hp = 0.0
		e.death_age = 0.0
		e.respawn_t = (5.0 if not e.is_bot else rng.randf_range(5.0, 8.0))
		e.deaths += 1
		e.vel = Vector3.ZERO
		attacker.kills += 1
		e.killer = attacker.id
		e.kill_w = attacker.weapon
		e.kill_dist = attacker.pos.distance_to(e.pos)
		e.kill_hp = maxf(attacker.hp, 0.0)
		tickets[e.team] = maxi(0, tickets[e.team] - 1)
		events.append({"t": "kill", "k": attacker.id, "v": e.id, "w": attacker.weapon, "head": head})


# ---------------------------------------------------------------- 스폰

func _front_index(team: int) -> int:
	if team == 0:
		var f := 0
		for i in NPOINTS:
			if pts[i].owner == 0:
				f = i
		return f
	var g := NPOINTS - 1
	for i in range(NPOINTS - 1, -1, -1):
		if pts[i].owner == 1:
			g = i
	return g


func _enemy_near(p: Vector3, team: int, r: float) -> bool:
	for e in units:
		if e.alive and e.team != team:
			var dx: float = e.pos.x - p.x
			var dz: float = e.pos.z - p.z
			if dx * dx + dz * dz < r * r:
				return true
	return false


func _spawn_index(team: int) -> int:
	var i := _front_index(team)
	var base := 0 if team == 0 else NPOINTS - 1
	if i != base and _enemy_near(pts[i].pos, team, 26.0):
		i += -1 if team == 0 else 1
	return i


func _spawn(u: Unit) -> void:
	var idx := _spawn_index(u.team)
	var c: Vector3 = pts[idx].pos
	var p := c
	for attempt in 10:
		var a := rng.randf() * TAU
		var r := rng.randf_range(3.0, 9.0)
		p = c + Vector3(cos(a) * r, 0.0, sin(a) * r)
		p.x = clampf(p.x, -World.HALF_X + 2.0, World.HALF_X - 2.0)
		p.z = clampf(p.z, -World.HALF_Z + 2.0, World.HALF_Z - 2.0)
		if world.block_top(p.x, p.z, RADIUS + 0.2, world.height_at(p.x, p.z)) < -1e8:
			break
	p.y = world.height_at(p.x, p.z)
	u.pos = p
	u.prev_pos = p
	u.vel = Vector3.ZERO
	u.hp = 100.0
	u.alive = true
	u.death_age = 0.0
	if u.is_bot:
		u.weapon = _bot_weapon()
		u.role = 1 if rng.randf() < 0.18 else 0
	else:
		u.weapon = u.loadout
	u.ammo = WEAPONS[u.weapon].mag
	u.reload_t = 0.0
	u.fire_cd = 0.5
	u.inv_t = 2.0 if u.is_bot else 4.0
	u.target = -1
	u.obj = -1
	u.think_t = rng.randf() * 0.3
	u.yaw = PI * 0.5 if u.team == 1 else -PI * 0.5
	u.prev_yaw = u.yaw
	u.pitch = 0.0
	u.last_pos = p
	u.stuck_t = 0.0
	events.append({"t": "spawn", "id": u.id})


# ---------------------------------------------------------------- 점령

func _eligible(team: int, i: int) -> bool:
	if pts[i].owner == team:
		return true
	if team == 0:
		return i == 0 or pts[i - 1].owner == 0
	return i == NPOINTS - 1 or pts[i + 1].owner == 1


func _step_points(dt: float) -> void:
	var r2 := World.POINT_R * World.POINT_R
	for i in NPOINTS:
		var p: Pt = pts[i]
		var ca := 0
		var cb := 0
		for u in units:
			if not u.alive:
				continue
			var dx: float = u.pos.x - p.pos.x
			var dz: float = u.pos.z - p.pos.z
			if dx * dx + dz * dz < r2 and absf(u.pos.y - p.pos.y) < 8.0:
				if u.team == 0:
					ca += 1
				else:
					cb += 1
		p.n_a = ca
		p.n_b = cb
		var d := ca - cb
		if d != 0:
			var team := 0 if d > 0 else 1
			if _eligible(team, i):
				p.cap = clampf(p.cap + signf(float(d)) * minf(absf(float(d)), 5.0) * POINT_RATE * dt, -1.0, 1.0)
		var prev: int = p.owner
		if p.owner == 0 and p.cap <= 0.0:
			p.owner = -1
		elif p.owner == 1 and p.cap >= 0.0:
			p.owner = -1
		if p.owner == -1:
			if p.cap >= 1.0:
				p.owner = 0
			elif p.cap <= -1.0:
				p.owner = 1
		if p.owner != prev:
			events.append({"t": "cap", "i": i, "o": p.owner, "prev": prev})


## 거점을 더 많이 가진 팀이 4초마다 (거점 차이)만큼 상대 병력을 깎는다 — 전선이 굳어도 경기가 끝나게 한다.
func _bleed(dt: float) -> void:
	bleed_t += dt
	if bleed_t < BLEED_EVERY:
		return
	bleed_t = 0.0
	var d := owned_count(0) - owned_count(1)
	if d > 0:
		tickets[1] = maxi(0, tickets[1] - d)
	elif d < 0:
		tickets[0] = maxi(0, tickets[0] + d)


func _check_end() -> void:
	if pts[NPOINTS - 1].owner == 0:
		_end(0, "적 본진 점령")
	elif pts[0].owner == 1:
		_end(1, "적 본진 점령")
	elif tickets[0] <= 0 and tickets[1] <= 0:
		_end(2, "병력 소진")
	elif tickets[0] <= 0:
		_end(1, "적 병력 소진")
	elif tickets[1] <= 0:
		_end(0, "적 병력 소진")
	elif time >= MATCH_TIME:
		var a := owned_count(0)
		var b := owned_count(1)
		if a != b:
			_end(0 if a > b else 1, "시간 종료 · 거점 우세")
		elif tickets[0] != tickets[1]:
			_end(0 if tickets[0] > tickets[1] else 1, "시간 종료 · 병력 우세")
		else:
			_end(2, "시간 종료")


func _end(w: int, reason: String) -> void:
	winner = w
	win_reason = reason
	events.append({"t": "end", "w": w, "reason": reason})


# ---------------------------------------------------------------- 공간 해시 (봇 시야 탐색용)

func _rebuild_grid() -> void:
	_grid.clear()
	for u in units:
		if not u.alive:
			continue
		var key := Vector3i(int(floor(u.pos.x / 16.0)), int(floor(u.pos.z / 16.0)), u.team)
		if not _grid.has(key):
			_grid[key] = []
		_grid[key].append(u.id)


func _enemies_near(u: Unit, radius: float) -> Array:
	var out: Array = []
	var cx := int(floor(u.pos.x / 16.0))
	var cz := int(floor(u.pos.z / 16.0))
	var n := int(ceil(radius / 16.0))
	var et := 1 - u.team
	var r2 := radius * radius
	for gx in range(cx - n, cx + n + 1):
		for gz in range(cz - n, cz + n + 1):
			var key := Vector3i(gx, gz, et)
			if not _grid.has(key):
				continue
			for id in _grid[key]:
				var e: Unit = units[id]
				if not e.alive:
					continue
				var dx := e.pos.x - u.pos.x
				var dz := e.pos.z - u.pos.z
				var d2 := dx * dx + dz * dz
				if d2 < r2:
					out.append([d2, id])
	return out


# ---------------------------------------------------------------- 봇 AI

func _objective(u: Unit) -> int:
	var f := _front_index(u.team)
	if u.role == 1:
		return f
	if u.team == 0:
		return mini(f + 1, NPOINTS - 1)
	return maxi(f - 1, 0)


func _turn(cur: float, target: float, max_step: float) -> float:
	var d := wrapf(target - cur, -PI, PI)
	return cur + clampf(d, -max_step, max_step)


func _bot_think(u: Unit) -> void:
	var o := _objective(u)
	u.wp_t -= 0.3
	if o != u.obj or u.wp_t <= 0.0:
		u.obj = o
		var a := rng.randf() * TAU
		var r := rng.randf_range(1.5, 9.0)
		var c: Vector3 = pts[o].pos
		u.wp = c + Vector3(cos(a) * r, 0.0, sin(a) * r)
		u.wp_t = rng.randf_range(6.0, 14.0)
	# 막힘 감지
	if u.pos.distance_to(u.last_pos) < 0.5 and u.in_move.length() > 0.1:
		u.stuck_t += 0.3
		if u.stuck_t > 1.2:
			u.avoid_sign = -u.avoid_sign
			u.wp_t = 0.0
			u.stuck_t = 0.0
	else:
		u.stuck_t = 0.0
	u.last_pos = u.pos
	# 목표 탐색
	if u.target >= 0:
		var t: Unit = units[u.target]
		if t.alive and t.pos.distance_to(u.pos) < 75.0 and world.los(u.pos + Vector3(0, EYE, 0), t.pos + Vector3(0, 1.2, 0)):
			return
		u.target = -1
	var cand := _enemies_near(u, 60.0)
	if cand.is_empty():
		return
	cand.sort_custom(func(a, b): return a[0] < b[0])
	var eye := u.pos + Vector3(0, EYE, 0)
	for k in mini(3, cand.size()):
		var e: Unit = units[cand[k][1]]
		if world.los(eye, e.pos + Vector3(0, 1.2, 0)):
			u.target = e.id
			return


func _bot_ai(u: Unit, dt: float) -> void:
	u.think_t -= dt
	if u.think_t <= 0.0:
		u.think_t = 0.25 + rng.randf() * 0.15
		_bot_think(u)
	u.in_jump = false
	u.in_sprint = false
	var tgt: Unit = null
	if u.target >= 0:
		tgt = units[u.target]
		if not tgt.alive:
			u.target = -1
			tgt = null
	if tgt != null:
		var d := tgt.pos - u.pos
		d.y = 0.0
		var dist := d.length()
		var want := atan2(-d.x, -d.z)
		u.yaw = _turn(u.yaw, want, 5.5 * dt)
		u.pitch = atan2((tgt.pos.y + 1.2) - (u.pos.y + EYE), maxf(dist, 1.0))
		u.strafe_t -= dt
		if u.strafe_t <= 0.0:
			if rng.randf() < 0.6:
				u.strafe = -u.strafe
			u.strafe_t = rng.randf_range(0.8, 2.2)
		var fwd := 0.0
		if dist > 38.0:
			fwd = 1.0
		elif dist < 12.0:
			fwd = -0.5
		u.in_move = Vector2(u.strafe * 0.7, fwd)
		u.bot_speed = WALK
		if u.fire_cd <= 0.0 and u.reload_t <= 0.0:
			if u.ammo <= 0:
				_start_reload(u)
			elif absf(wrapf(want - u.yaw, -PI, PI)) < 0.12:
				_bot_fire(u, tgt, dist)
	else:
		_bot_nav(u, dt)


func _bot_nav(u: Unit, dt: float) -> void:
	u.pitch = move_toward(u.pitch, 0.0, dt * 1.5)
	var to := u.wp - u.pos
	to.y = 0.0
	var dist := to.length()
	if dist < 2.5:
		u.in_move = Vector2.ZERO
		u.bot_speed = 0.0
		# 도착하면 적진 쪽을 본다
		var face := PI * 0.5 if u.team == 1 else -PI * 0.5
		u.yaw = _turn(u.yaw, face, 2.0 * dt)
		return
	var hd := atan2(-to.x, -to.z)
	var fdir := Vector3(-sin(hd), 0.0, -cos(hd))
	var look := u.pos + fdir * 1.1
	var top := world.block_top(look.x, look.z, RADIUS, u.pos.y)
	if top > -1e8:
		if top - u.pos.y < 1.05 and u.on_ground:
			u.in_jump = true
		else:
			for a in [0.9, -0.9, 1.6, -1.6, 2.4, -2.4]:
				var h2: float = hd + a * u.avoid_sign
				var l2 := u.pos + Vector3(-sin(h2), 0.0, -cos(h2)) * 1.1
				if world.block_top(l2.x, l2.z, RADIUS, u.pos.y) < -1e8:
					hd = h2
					break
	u.yaw = _turn(u.yaw, hd, 8.0 * dt)
	u.in_move = Vector2(0.0, 1.0)
	# 플레이어와 같은 속도: 멀리 이동할 땐 달리기, 가까워지면 걷기
	u.bot_speed = SPRINT if dist > 25.0 else WALK


func _bot_fire(u: Unit, tgt: Unit, dist: float) -> void:
	var w: Dictionary = WEAPONS[u.weapon]
	u.ammo -= 1
	u.fire_cd = w.cd * w.bot_cd * rng.randf_range(0.8, 1.3)
	var eye := u.pos + Vector3(0.0, EYE, 0.0)
	var chest := tgt.pos + Vector3(0.0, 1.2, 0.0)
	var moving := u.speed_now > 1.2
	var p: float = w.bot_hit * clampf(1.3 - dist / (w.range * 0.5), 0.1, 1.0) * (0.7 if moving else 1.0)
	var hit := rng.randf() < p and world.los(eye, chest)
	var end := chest
	if not hit:
		end += Vector3(rng.randf_range(-1.6, 1.6), rng.randf_range(-1.0, 0.6), rng.randf_range(-1.6, 1.6))
	var dir := (end - eye).normalized()
	events.append({"t": "shot", "id": u.id, "team": u.team, "a": eye + dir * 0.9 + Vector3(0, -0.15, 0), "b": end, "hit": hit})
	if hit:
		var head := rng.randf() < 0.07
		damage(tgt, w.dmg * _falloff(w, dist) * (2.0 if head else 1.0), u, head)
