extends SceneTree
## 헤드리스 시뮬레이션 테스트.
##   godot --headless --path . -s res://scripts/tests/sim_test.gd -- [팀당 인원] [시뮬레이션 초]
## 불변식(NaN·맵 이탈·점령 규칙)을 검사하고 틱당 비용을 잰다.

var fails := 0


func check(cond: bool, msg: String) -> void:
	if cond:
		print("  ok   ", msg)
	else:
		print("  FAIL ", msg)
		fails += 1


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var per_team := int(args[0]) if args.size() > 0 else 40
	var secs := float(args[1]) if args.size() > 1 else 120.0
	print("== Ironline sim test: 팀당 %d명(총 %d), %.0f초" % [per_team, per_team * 2, secs])

	var t_build := Time.get_ticks_usec()
	var sim := Sim.new()
	sim.setup(int(args[2]) if args.size() > 2 else 1234, per_team)
	print("  월드 생성 %.0f ms, 상자 %d개" % [(Time.get_ticks_usec() - t_build) / 1000.0, sim.world.boxes.size()])

	# 사람 슬롯 하나를 직접 조종해 입력 경로도 검사한다
	var human := not (args.size() > 3 and args[3] == "bots")
	if human:
		sim.claim_slot(0, 1)

	var ticks := int(secs / Sim.TICK)
	var worst := 0.0
	var total := 0.0
	var kills := 0
	var shots := 0
	var caps := 0
	var bad := false
	for i in ticks:
		if human:
			sim.set_input(0, Vector2(0, 1), 0.0, 0.0, i % 20 < 5, i % 90 == 0, false, false)
		var t0 := Time.get_ticks_usec()
		sim.step(Sim.TICK)
		var dt := (Time.get_ticks_usec() - t0) / 1000.0
		total += dt
		worst = maxf(worst, dt)
		for e in sim.events:
			match e.t:
				"kill": kills += 1
				"shot": shots += 1
				"cap": caps += 1
		sim.events.clear()
		for u in sim.units:
			if not u.alive:
				continue
			if is_nan(u.pos.x) or is_nan(u.pos.y) or is_nan(u.pos.z):
				bad = true
			if absf(u.pos.x) > World.HALF_X or absf(u.pos.z) > World.HALF_Z:
				bad = true
		if sim.winner >= 0:
			print("  종료: winner=%d (%s) @ %.1fs" % [sim.winner, sim.win_reason, sim.time])
			break

	var avg := total / maxf(1.0, float(sim.tick_count))
	print("  틱 평균 %.2f ms / 최악 %.2f ms (예산 %.1f ms)" % [avg, worst, Sim.TICK * 1000.0])
	print("  킬 %d, 발사 %d, 점령 이벤트 %d, 남은 병력 A=%d B=%d" % [kills, shots, caps, sim.tickets[0], sim.tickets[1]])
	var own := ""
	for p in sim.pts:
		own += "%d(%.2f) " % [p.owner, p.cap]
	print("  거점 소유/진행: ", own)

	check(not bad, "NaN·맵 이탈 없음")
	check(kills > 0, "교전이 일어나 킬이 발생함")
	check(shots > kills, "발사 수가 킬보다 많음")
	check(avg < Sim.TICK * 1000.0 * 0.5, "틱 평균이 예산의 절반 이하")
	var alive := 0
	for u in sim.units:
		if u.alive:
			alive += 1
	if sim.winner < 0:
		check(alive > per_team, "생존자가 충분함 (%d)" % alive)
	else:
		check(sim.time < 420.0, "경기가 7분 안에 끝남 (%.0f초)" % sim.time)

	# 순차 점령 규칙: 상대 본진 옆 거점을 안 가진 채로는 본진을 건드릴 수 없다
	var s2 := Sim.new()
	s2.setup(7, 3)
	for u in s2.units:
		u.alive = false
		u.respawn_t = 999.0
	var pu: Sim.Unit = s2.units[0]  # 팀A
	pu.alive = true
	pu.pos = s2.pts[4].pos  # 팀B 본진에 팀A가 서 있다
	for k in 100:
		s2.step(Sim.TICK)
	check(is_equal_approx(s2.pts[4].cap, -1.0), "팀A는 3번 거점을 갖기 전엔 5번 본진을 못 건드림")
	s2.pts[3].owner = 0
	s2.pts[3].cap = 1.0
	for k in 600:
		s2.step(Sim.TICK)
	check(s2.pts[4].cap > -1.0, "인접 거점을 가지면 본진 점령이 진행됨 (cap=%.2f)" % s2.pts[4].cap)

	print("== 결과: %s" % ("통과" if fails == 0 else "실패 %d건" % fails))
	quit(0 if fails == 0 else 1)
