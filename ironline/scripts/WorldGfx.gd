class_name WorldGfx
extends RefCounted
## 월드의 정적 그래픽: 지형 메시, 소품(벽·모래주머니·상자), 죽은 나무, 철조망, 거점 깃발.
## 전부 World(시드)에서 결정적으로 만들어지므로 클라이언트마다 같은 모양이다.

static func terrain(w: World) -> MeshInstance3D:
	var gw := w.gw
	var gh := w.gh
	var verts := PackedVector3Array()
	var nrms := PackedVector3Array()
	var cols := PackedColorArray()
	verts.resize(gw * gh)
	nrms.resize(gw * gh)
	cols.resize(gw * gh)
	for j in gh:
		for i in gw:
			var k := j * gw + i
			var h: float = w.hmap[k]
			var hl: float = w.hmap[j * gw + maxi(i - 1, 0)]
			var hr: float = w.hmap[j * gw + mini(i + 1, gw - 1)]
			var hd: float = w.hmap[maxi(j - 1, 0) * gw + i]
			var hu: float = w.hmap[mini(j + 1, gh - 1) * gw + i]
			verts[k] = Vector3(w.gx0 + i * World.GRID, h, w.gz0 + j * World.GRID)
			nrms[k] = Vector3(hl - hr, 2.0 * World.GRID, hd - hu).normalized()
			var cav := clampf(((hl + hr + hd + hu) * 0.25 - h) * 0.7, 0.0, 1.0)
			cols[k] = Color(1.0 - cav * 0.5, 0.0, 0.0, 1.0)
	var idx := PackedInt32Array()
	idx.resize((gw - 1) * (gh - 1) * 6)
	var q := 0
	for j in gh - 1:
		for i in gw - 1:
			var a := j * gw + i
			var b := a + 1
			var c := a + gw
			var d := c + 1
			idx[q] = a
			idx[q + 1] = b
			idx[q + 2] = c
			idx[q + 3] = b
			idx[q + 4] = d
			idx[q + 5] = c
			q += 6
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_NORMAL] = nrms
	arr[Mesh.ARRAY_COLOR] = cols
	arr[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/terrain.gdshader")
	var pts := PackedVector2Array()
	for i in 5:
		pts.append(Vector2(World.POINT_X[i], World.POINT_Z[i]))
	mat.set_shader_parameter("points", pts)
	m.surface_set_material(0, mat)
	var mi := MeshInstance3D.new()
	mi.mesh = m
	mi.name = "Terrain"
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi


static func _kind_col(base: Color, kind: int) -> Color:
	return Color(base.r, base.g, base.b, float(kind) / 8.0)


const CHUNK := 48.0


static func _g(chunks: Dictionary, p: Vector3) -> Geo:
	var key := Vector2i(int(floor(p.x / CHUNK)), int(floor(p.z / CHUNK)))
	if not chunks.has(key):
		chunks[key] = Geo.new()
	return chunks[key]


## 소품을 48m 청크로 나눠 메시를 만든다(프러스텀·거리 컬링이 되도록).
static func props(w: World) -> Node3D:
	var chunks := {}
	var rng := RandomNumberGenerator.new()
	rng.seed = w.seed_v * 17 + 3
	for b in w.boxes:
		var mn: Vector3 = b.mn
		var mx: Vector3 = b.mx
		var g := _g(chunks, (mn + mx) * 0.5)
		match int(b.kind):
			0: _wall(g, mn, mx, rng)
			1: _sandbags(g, mn, mx, rng)
			2: _crate(g, mn, mx, rng)
			_: _timber(g, mn, mx)
	_trees(chunks, w, rng)
	_wire(chunks, w, rng)
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/props.gdshader")
	var root := Node3D.new()
	root.name = "Props"
	for key in chunks:
		var g: Geo = chunks[key]
		var mesh := ArrayMesh.new()
		g.commit_to(mesh, mat)
		var mi := MeshInstance3D.new()
		mi.mesh = mesh
		mi.visibility_range_end = 280.0
		mi.visibility_range_end_margin = 20.0
		root.add_child(mi)
	return root


static func _wall(g: Geo, mn: Vector3, mx: Vector3, rng: RandomNumberGenerator) -> void:
	var size := mx - mn
	var along_x := size.x >= size.z
	var length: float = size.x if along_x else size.z
	var thick: float = size.z if along_x else size.x
	var full := size.y
	var nc := maxi(1, int(length / 0.55))
	var cw := length / nc
	var base := Color(0.40, 0.38, 0.34)
	for k in nc:
		var u := (k + 0.5) * cw - length * 0.5
		# 끝으로 갈수록, 그리고 무작위로 무너진 높이
		var edge := minf(float(k), float(nc - 1 - k))
		var hf := 0.5 + 0.5 * rng.randf()
		if edge < 1.5:
			hf *= 0.65 + 0.12 * edge
		if k % 5 == 2:
			hf = 1.0
		var h := maxf(0.5, full * hf)
		var jitter := rng.randf_range(-0.03, 0.03)
		var col := _kind_col(base * rng.randf_range(0.85, 1.1), 0)
		var cx := (mn.x + mx.x) * 0.5
		var cz := (mn.z + mx.z) * 0.5
		var pos := Vector3(cx + (u if along_x else jitter), mn.y + h * 0.5, cz + (jitter if along_x else u))
		var sz := Vector3(cw * 0.99, h, thick) if along_x else Vector3(thick, h, cw * 0.99)
		var rot := Basis(Vector3.UP, rng.randf_range(-0.04, 0.04))
		g.box(sz, Transform3D(rot, pos), col)
	# 잔해 더미
	for k in 5:
		var sx := rng.randf_range(0.18, 0.4)
		var p := Vector3(rng.randf_range(mn.x - 0.5, mx.x + 0.5), mn.y + sx * 0.4, rng.randf_range(mn.z - 0.5, mx.z + 0.5))
		var rb := Basis(Vector3.UP, rng.randf() * TAU) * Basis(Vector3.RIGHT, rng.randf_range(-0.3, 0.3))
		g.box(Vector3(sx, sx * 0.7, sx * 0.9), Transform3D(rb, p), _kind_col(base * 0.8, 0))


static func _sandbags(g: Geo, mn: Vector3, mx: Vector3, rng: RandomNumberGenerator) -> void:
	var size := mx - mn
	var along_x := size.x >= size.z
	var length: float = size.x if along_x else size.z
	var thick: float = size.z if along_x else size.x
	var rows := maxi(2, int(ceil((size.y - 0.35) / 0.28)))
	var across := maxi(1, int(round(thick / 0.42)))
	var per := maxi(2, int(length / 0.5))
	var step := length / per
	var cx := (mn.x + mx.x) * 0.5
	var cz := (mn.z + mx.z) * 0.5
	for r in rows:
		var y := mn.y + 0.35 + 0.15 + 0.27 * r
		var off := 0.5 * step * float(r % 2)
		for a in across:
			var lat := (a - (across - 1) * 0.5) * (thick / across)
			for k in per:
				var u := -length * 0.5 + (k + 0.5) * step + off - (step * 0.25 if r % 2 == 1 else 0.0)
				if absf(u) > length * 0.5 - 0.1:
					continue
				var tan := Color(0.52 + rng.randf() * 0.1, 0.43 + rng.randf() * 0.08, 0.27 + rng.randf() * 0.06)
				var yaw := rng.randf_range(-0.12, 0.12) + (0.0 if along_x else PI * 0.5)
				var pos := Vector3(cx + (u if along_x else lat), y, cz + (lat if along_x else u))
				var sc := Vector3(0.27, 0.15, 0.19 + 0.02 * rng.randf())
				g.sphere(1.0, Transform3D(Basis(Vector3.UP, yaw), pos), _kind_col(tan, 1), 0, sc, 3, 6)


static func _crate(g: Geo, mn: Vector3, mx: Vector3, rng: RandomNumberGenerator) -> void:
	var size := mx - mn
	var c := (mn + mx) * 0.5
	var col := _kind_col(Color(0.36, 0.24, 0.12) * rng.randf_range(0.85, 1.15), 2)
	var rot := Basis(Vector3.UP, rng.randf_range(-0.08, 0.08))
	g.box(size - Vector3(0.0, 0.35, 0.0) + Vector3(0, 0, 0), Transform3D(rot, Vector3(c.x, mn.y + 0.35 + (size.y - 0.35) * 0.5, c.z)), col)
	var post := Color(0.28, 0.18, 0.09, 2.0 / 8.0)
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			var p := Vector3(c.x + sx * (size.x * 0.5 - 0.03), mn.y + 0.35 + (size.y - 0.35) * 0.5, c.z + sz * (size.z * 0.5 - 0.03))
			g.box(Vector3(0.07, size.y - 0.33, 0.07), Transform3D(rot, p), post)


static func _timber(g: Geo, mn: Vector3, mx: Vector3) -> void:
	var size := mx - mn
	var c := (mn + mx) * 0.5
	g.box(size, Transform3D(Basis.IDENTITY, c), _kind_col(Color(0.35, 0.25, 0.15), 3))


static func _trees(chunks: Dictionary, w: World, rng: RandomNumberGenerator) -> void:
	var placed := 0
	var tries := 0
	while placed < 46 and tries < 600:
		tries += 1
		var x := rng.randf_range(-210.0, 210.0)
		var z := rng.randf_range(-130.0, 130.0)
		var inside := absf(x) < World.HALF_X - 6.0 and absf(z) < World.HALF_Z - 6.0
		if inside and rng.randf() < 0.85:
			continue
		if w._near_point(x, z, World.POINT_R + 5.0):
			continue
		var y := w.height_at(x, z)
		var h := rng.randf_range(3.5, 6.5)
		var lean := Vector3(rng.randf_range(-0.12, 0.12), 0.0, rng.randf_range(-0.12, 0.12))
		var base := Vector3(x, y - 0.2, z)
		var top := base + Vector3(lean.x * h, h, lean.z * h)
		var bark := Color(0.2, 0.15, 0.11)
		var g := _g(chunks, base)
		g.rod(base, top, 0.38, 0.13, _kind_col(bark, 4), 0, 8)
		for b in rng.randi_range(3, 6):
			var t := rng.randf_range(0.45, 0.95)
			var p0 := base.lerp(top, t)
			var ang := rng.randf() * TAU
			var len := rng.randf_range(1.0, 2.2) * (1.2 - t * 0.5)
			var p1 := p0 + Vector3(cos(ang) * len, rng.randf_range(0.3, 1.2), sin(ang) * len)
			g.rod(p0, p1, 0.11, 0.035, _kind_col(bark * 1.1, 4), 0, 6)
		placed += 1


static func _wire(chunks: Dictionary, w: World, rng: RandomNumberGenerator) -> void:
	# 참호 앞 철조망 울타리
	var metal := Color(0.08, 0.08, 0.08, 5.0 / 8.0)
	var post := Color(0.2, 0.14, 0.09, 4.0 / 8.0)
	for tx in World.TRENCH_X:
		var z := -80.0
		while z < 80.0:
			var cx := w.trench_center(tx, z) + (7.5 if rng.randf() < 0.5 else -7.5)
			if w._near_point(cx, z, World.POINT_R + 10.0):
				z += 9.0
				continue
			var n := rng.randi_range(4, 7)
			var prev_top := Vector3.ZERO
			for i in n:
				var pz := z + i * 2.2
				var px := cx + sin(pz * 0.3) * 0.2
				var gy := w.height_at(px, pz)
				var p0 := Vector3(px, gy - 0.05, pz)
				var g := _g(chunks, p0)
				var p1 := Vector3(px, gy + 1.15, pz)
				g.rod(p0, p1, 0.035, 0.03, post, 0, 5)
				if i > 0:
					for s in 3:
						var y := 0.35 + s * 0.35
						var a := prev_top + Vector3(0, -1.15 + y, 0)
						var b := p1 + Vector3(0, -1.15 + y, 0)
						var mid := (a + b) * 0.5 + Vector3(0, -0.07, 0)
						g.rod(a, mid, 0.006, 0.006, metal, 0, 3)
						g.rod(mid, b, 0.006, 0.006, metal, 0, 3)
				prev_top = p1
			z += n * 2.2 + rng.randf_range(10.0, 20.0)


static func flag(color: Color) -> ArrayMesh:
	var g := Geo.new()
	g.rod(Vector3(0, 0, 0), Vector3(0, 7.2, 0), 0.07, 0.045, Color(0.16, 0.11, 0.07, 4.0 / 8.0), 0, 8)
	g.sphere(0.1, Transform3D(Basis.IDENTITY, Vector3(0, 7.25, 0)), Color(0.55, 0.42, 0.18, 5.0 / 8.0), 0, Vector3.ONE, 4, 8)
	# 물결치는 깃발
	var seg := 8
	var cw := 2.6 / seg
	for i in seg:
		var wave := sin(float(i) * 0.9) * 0.09 * float(i) / seg
		g.box(Vector3(cw * 1.02, 1.5, 0.03), Transform3D(Basis(Vector3.UP, wave * 1.5), Vector3(0.08 + cw * (i + 0.5), 6.4, wave)), Color(color.r, color.g, color.b, 5.0 / 8.0))
	var mesh := ArrayMesh.new()
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/props.gdshader")
	g.commit_to(mesh, mat)
	return mesh


static func zone_disc(radius: float) -> MeshInstance3D:
	var pm := PlaneMesh.new()
	pm.size = Vector2(radius * 2.0 + 2.0, radius * 2.0 + 2.0)
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/zone.gdshader")
	mat.set_shader_parameter("radius", radius)
	var mi := MeshInstance3D.new()
	mi.mesh = pm
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi


static func beam(height: float) -> MeshInstance3D:
	var cm := CylinderMesh.new()
	cm.top_radius = 0.5
	cm.bottom_radius = 0.7
	cm.height = height
	cm.radial_segments = 10
	cm.rings = 1
	cm.cap_top = false
	cm.cap_bottom = false
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/beam.gdshader")
	mat.set_shader_parameter("height", height)
	var mi := MeshInstance3D.new()
	mi.mesh = cm
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.position.y = height * 0.5
	# 셰이더는 로컬 y(−h/2..h/2)를 쓰므로 hy 보정을 위해 메시를 위로 올려 둔다
	return mi
