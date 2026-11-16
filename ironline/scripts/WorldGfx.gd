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
			var vx: float = w.gx0 + i * World.GRID
			var vz: float = w.gz0 + j * World.GRID
			cols[k] = Color(1.0 - cav * 0.5, w.road_mask(vx, vz), clampf((vz - w.road_z(vx)) / 4.0, -1.0, 1.0) * 0.5 + 0.5, 1.0)
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
	for pair in [["g", "forrest_ground_01"], ["d", "forest_ground_04"], ["m", "brown_mud_03"], ["r", "mossy_rock"]]:
		mat.set_shader_parameter(pair[0] + "_d", load("res://assets/textures/%s_diff.jpg" % pair[1]))
		mat.set_shader_parameter(pair[0] + "_n", load("res://assets/textures/%s_nor.jpg" % pair[1]))
	m.surface_set_material(0, mat)
	var mi := MeshInstance3D.new()
	mi.mesh = m
	mi.name = "Terrain"
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi


static func _kind_col(base: Color, kind: int) -> Color:
	return Color(base.r, base.g, base.b, float(kind) / 16.0)


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
			2: if not ModelLib.available(): _crate(g, mn, mx, rng)
			3: _timber(g, mn, mx)
			5: if not ModelLib.available(): _barrel(g, mn, mx, rng)
			6: _tent(g, mn, mx, rng)
			7: _fieldgun(g, mn, mx, rng)
			8: _plaster(g, mn, mx, rng)
			10: _wagon(g, mn, mx, rng)
			_: _timber(g, mn, mx)
	_trees(chunks, w, rng)
	_wire(chunks, w, rng)
	_decor(chunks, w, rng)
	_foliage(chunks, w, rng)
	_poles_and_hay(chunks, w, rng)
	_rocks_and_logs(chunks, w, rng)
	var mat := prop_material()
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
	_models(root, w, rng)
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
				var tan := Color(0.33 + rng.randf() * 0.07, 0.29 + rng.randf() * 0.06, 0.21 + rng.randf() * 0.04)
				var yaw := rng.randf_range(-0.12, 0.12) + (0.0 if along_x else PI * 0.5)
				var pos := Vector3(cx + (u if along_x else lat), y, cz + (lat if along_x else u))
				var sc := Vector3(0.27, 0.15, 0.19 + 0.02 * rng.randf())
				g.sphere(1.0, Transform3D(Basis(Vector3.UP, yaw), pos), _kind_col(tan, 1), 0, sc, 3, 6)


static func _crate(g: Geo, mn: Vector3, mx: Vector3, rng: RandomNumberGenerator) -> void:
	var size := mx - mn
	var c := (mn + mx) * 0.5
	var col := _kind_col(Color(0.27, 0.19, 0.11) * rng.randf_range(0.85, 1.15), 2)
	var rot := Basis(Vector3.UP, rng.randf_range(-0.08, 0.08))
	g.box(size - Vector3(0.0, 0.35, 0.0) + Vector3(0, 0, 0), Transform3D(rot, Vector3(c.x, mn.y + 0.35 + (size.y - 0.35) * 0.5, c.z)), col)
	var post := Color(0.28, 0.18, 0.09, 2.0 / 16.0)
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
	var metal := Color(0.08, 0.08, 0.08, 5.0 / 16.0)
	var post := Color(0.2, 0.14, 0.09, 4.0 / 16.0)
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
	g.rod(Vector3(0, 0, 0), Vector3(0, 7.2, 0), 0.07, 0.045, Color(0.16, 0.11, 0.07, 4.0 / 16.0), 0, 8)
	g.sphere(0.1, Transform3D(Basis.IDENTITY, Vector3(0, 7.25, 0)), Color(0.55, 0.42, 0.18, 5.0 / 16.0), 0, Vector3.ONE, 4, 8)
	# 물결치는 깃발
	var seg := 8
	var cw := 2.6 / seg
	for i in seg:
		var wave := sin(float(i) * 0.9) * 0.09 * float(i) / seg
		g.box(Vector3(cw * 1.02, 1.5, 0.03), Transform3D(Basis(Vector3.UP, wave * 1.5), Vector3(0.08 + cw * (i + 0.5), 6.4, wave)), Color(color.r, color.g, color.b, 5.0 / 16.0))
	var mesh := ArrayMesh.new()
	var mat := prop_material()
	g.commit_to(mesh, mat)
	return mesh


static func prop_material() -> ShaderMaterial:
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/props.gdshader")
	for pair in [["brick", "red_brick_03"], ["plaster", "plaster_grey_04"], ["roof", "ceramic_roof_01"],
			["plank", "weathered_planks"], ["bark", "bark_brown_02"], ["rock", "mossy_rock"]]:
		mat.set_shader_parameter(pair[0] + "_d", load("res://assets/textures/%s_diff.jpg" % pair[1]))
		mat.set_shader_parameter(pair[0] + "_n", load("res://assets/textures/%s_nor.jpg" % pair[1]))
	return mat


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


static func _barrel(g: Geo, mn: Vector3, mx: Vector3, rng: RandomNumberGenerator) -> void:
	var c := (mn + mx) * 0.5
	var base := Vector3(c.x, mn.y + 0.35, c.z)
	var wood := _kind_col(Color(0.30, 0.20, 0.10) * rng.randf_range(0.8, 1.15), 3)
	var steel := Color(0.07, 0.07, 0.07, 5.0 / 16.0)
	var prof := [Vector2(0.0, 0.0), Vector2(0.27, 0.0), Vector2(0.31, 0.12), Vector2(0.345, 0.5), Vector2(0.31, 0.9), Vector2(0.27, 1.02), Vector2(0.0, 1.02)]
	g.lathe(prof, 12, Transform3D(Basis.IDENTITY, base), wood)
	for hy in [0.14, 0.42, 0.6, 0.88]:
		var r := 0.31 + 0.04 * sin(hy / 1.02 * PI)
		g.cone(r + 0.006, r + 0.006, 0.035, Transform3D(Basis.IDENTITY, base + Vector3(0, hy, 0)), steel, 0, 12, false)


static func _tent(g: Geo, mn: Vector3, mx: Vector3, rng: RandomNumberGenerator) -> void:
	var size := mx - mn
	var c := (mn + mx) * 0.5
	var h := size.y - 0.35
	var canvas := _kind_col(Color(0.42, 0.38, 0.25) * rng.randf_range(0.9, 1.1), 5)
	var rot := Basis(Vector3.UP, rng.randf_range(-0.15, 0.15))
	g.prism(Vector2(size.x, size.z), Vector2(0.12, size.z), h, Transform3D(rot, Vector3(c.x, mn.y + 0.35, c.z)), canvas, 0)
	# 지지대와 밧줄 말뚝
	var post := Color(0.2, 0.14, 0.09, 4.0 / 16.0)
	for sz in [-1.0, 1.0]:
		g.rod(Vector3(c.x, mn.y + 0.3, c.z + sz * (size.z * 0.5 + 0.05)), Vector3(c.x, mn.y + 0.35 + h + 0.12, c.z + sz * (size.z * 0.5 + 0.05)), 0.04, 0.04, post, 0, 6)


static func _decor(chunks: Dictionary, w: World, rng: RandomNumberGenerator) -> void:
	var wood := _kind_col(Color(0.30, 0.21, 0.12), 3)
	var post := Color(0.2, 0.14, 0.09, 4.0 / 16.0)
	# 참호 바닥 널빤지와 벽 말뚝
	for tx in World.TRENCH_X:
		var z := -88.0
		while z < 88.0:
			var cx := w.trench_center(tx, z)
			if not w._near_point(cx, z, World.POINT_R + 3.0):
				var y := w.height_at(cx, z)
				var g := _g(chunks, Vector3(cx, y, z))
				if rng.randf() > 0.07:
					g.box(Vector3(1.9, 0.05, 0.42), Transform3D(Basis(Vector3.UP, rng.randf_range(-0.06, 0.06)), Vector3(cx, y + 0.04, z)), wood)
				if int(z) % 3 == 0 and rng.randf() < 0.85:
					for side in [-1.0, 1.0]:
						var px: float = cx + side * 1.75
						var py := w.height_at(px, z)
						g.rod(Vector3(px, py - 0.15, z), Vector3(px + side * 0.12, py + 1.0 + rng.randf() * 0.35, z), 0.055, 0.045, post, 0, 5)
			z += 0.95
	for hs in w.houses:
		_house_visual(chunks, hs, w, rng)


static func grass(w: World) -> Node3D:
	var rng := RandomNumberGenerator.new()
	rng.seed = w.seed_v * 5 + 11
	var chunks := {}
	var step := 1.6
	var x := -(World.HALF_X + 14.0)
	while x < World.HALF_X + 14.0:
		var z := -(World.HALF_Z + 14.0)
		while z < World.HALF_Z + 14.0:
			var px := x + rng.randf() * step
			var pz := z + rng.randf() * step
			z += step
			var h := w.height_at(px, pz)
			if h < -0.35:
				continue
			var near := false
			for i in 5:
				if Vector2(px - World.POINT_X[i], pz - World.POINT_Z[i]).length() < World.POINT_R + 2.0 + rng.randf() * 6.0:
					near = true
					break
			if near:
				continue
			var mask := w.detail.get_noise_2d(px * 1.6, pz * 1.6) + w.noise.get_noise_2d(px * 3.0, pz * 3.0) * 0.5
			if mask < -0.75 or rng.randf() > 0.93 or w.road_mask(px, pz) > 0.25:
				continue
			var slope := absf(w.height_at(px + 1.0, pz) - h) + absf(w.height_at(px, pz + 1.0) - h)
			if slope > 0.9:
				continue
			if w.inside_box(Vector3(px, h + 0.3, pz)):
				continue
			var key := Vector2i(int(floor(px / CHUNK)), int(floor(pz / CHUNK)))
			if not chunks.has(key):
				chunks[key] = {"v": PackedVector3Array(), "n": PackedVector3Array(), "c": PackedColorArray(), "i": PackedInt32Array()}
			_tuft(chunks[key], Vector3(px, h - 0.03, pz), rng, mask)
		x += step
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/grass.gdshader")
	var root := Node3D.new()
	root.name = "Grass"
	for key in chunks:
		var d: Dictionary = chunks[key]
		var arr := []
		arr.resize(Mesh.ARRAY_MAX)
		arr[Mesh.ARRAY_VERTEX] = d.v
		arr[Mesh.ARRAY_NORMAL] = d.n
		arr[Mesh.ARRAY_COLOR] = d.c
		arr[Mesh.ARRAY_INDEX] = d.i
		var mesh := ArrayMesh.new()
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
		mesh.surface_set_material(0, mat)
		var mi := MeshInstance3D.new()
		mi.mesh = mesh
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.visibility_range_end = 78.0
		mi.visibility_range_end_margin = 10.0
		mi.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_DISABLED
		root.add_child(mi)
	return root


static func _tuft(d: Dictionary, c: Vector3, rng: RandomNumberGenerator, mask: float) -> void:
	var lush := clampf(0.5 + mask, 0.0, 1.0)
	var dry := Color(0.36, 0.31, 0.15)
	var green := Color(0.16, 0.22, 0.07)
	var top_col := green.lerp(dry, rng.randf() * 0.6).lerp(Color(0.25, 0.31, 0.10), lush * 0.45)
	var blades := 7
	var height := rng.randf_range(0.2, 0.5) * (0.8 + lush * 0.6)
	for b in blades:
		var a := rng.randf() * TAU
		var r := rng.randf() * 0.32
		var base := c + Vector3(cos(a) * r, 0.0, sin(a) * r)
		var wd := rng.randf_range(0.022, 0.04)
		var dir := Vector3(cos(a + 1.57), 0.0, sin(a + 1.57))
		var hh := height * rng.randf_range(0.6, 1.2)
		var lean := Vector3(cos(a), 0.0, sin(a)) * rng.randf_range(0.05, 0.26) * hh * 2.0
		# 두 마디로 휘어진 잎: 밑동 2점, 중간 2점, 끝 1점
		var mid := base + Vector3(0, hh * 0.58, 0) + lean * 0.3
		var tip := base + Vector3(0, hh, 0) + lean
		var i0: int = d.v.size()
		d.v.append(base - dir * wd)
		d.v.append(base + dir * wd)
		d.v.append(mid - dir * wd * 0.62)
		d.v.append(mid + dir * wd * 0.62)
		d.v.append(tip)
		for k in 5:
			d.n.append(Vector3.UP)
		var low := Color(top_col.r * 0.6, top_col.g * 0.6, top_col.b * 0.6, 0.0)
		var midc := Color(top_col.r * 0.9, top_col.g * 0.9, top_col.b * 0.9, 0.58)
		d.c.append(low)
		d.c.append(low)
		d.c.append(midc)
		d.c.append(midc)
		d.c.append(Color(top_col.r * 1.15, top_col.g * 1.15, top_col.b * 1.05, 1.0))
		d.i.append_array([i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2, i0 + 2, i0 + 3, i0 + 4])


static func _fieldgun(g: Geo, mn: Vector3, mx: Vector3, rng: RandomNumberGenerator) -> void:
	var c := (mn + mx) * 0.5
	var base_y := mn.y + 0.35
	var olive := Color(0.16, 0.17, 0.09, 5.0 / 16.0)
	var steel := Color(0.09, 0.09, 0.09, 5.0 / 16.0)
	var wood := Color(0.22, 0.15, 0.08, 3.0 / 16.0)
	var ax := Vector3(c.x, base_y, c.z)
	# 바퀴(차축 Y→X 방향으로 눕힌 원통) + 바퀴살
	for sz in [-1.0, 1.0]:
		var wc := ax + Vector3(0.0, 0.62, sz * 0.78)
		var wb := Basis(Vector3(0, 0, 1), PI * 0.5)
		g.cone(0.62, 0.62, 0.09, Transform3D(wb, wc + Vector3(0.045, 0, 0)), wood, 0, 16, true)
		g.cone(0.64, 0.64, 0.035, Transform3D(wb, wc + Vector3(0.1, 0, 0)), steel, 0, 16, false)
		g.cone(0.12, 0.12, 0.2, Transform3D(wb, wc + Vector3(0.1, 0, 0)), steel, 0, 10, true)
		for k in 6:
			var a := TAU * k / 6.0
			g.rod(wc + Vector3(0.0, 0.0, 0.0), wc + Vector3(0.0, cos(a) * 0.6, sin(a) * 0.6), 0.03, 0.03, wood, 0, 5)
	g.rod(ax + Vector3(0.0, 0.62, -0.78), ax + Vector3(0.0, 0.62, 0.78), 0.05, 0.05, steel, 0, 8)
	# 포신(약간 올려 세움)과 포미, 방패
	var tilt := Basis(Vector3(0, 0, 1), deg_to_rad(11))
	var bpos := ax + Vector3(0.0, 1.0, 0.0)
	var bb := tilt * Basis(Vector3(0, 0, 1), -PI * 0.5)
	g.cone(0.15, 0.1, 2.3, Transform3D(bb, bpos + Vector3(-0.6, 0.0, 0.0)), olive, 0, 14, true)
	g.cone(0.105, 0.105, 0.35, Transform3D(bb, bpos + Vector3(1.4, 0.18, 0.0)), steel, 0, 12, true)
	g.sphere(0.17, Transform3D(Basis.IDENTITY, bpos + Vector3(-0.72, -0.15, 0.0)), olive, 0)
	g.box(Vector3(0.05, 0.95, 1.5), Transform3D(Basis(Vector3(0, 0, 1), deg_to_rad(-6)), bpos + Vector3(0.12, 0.12, 0.0)), olive)
	g.box(Vector3(0.7, 0.03, 0.5), Transform3D(Basis.IDENTITY, bpos + Vector3(-0.05, -0.28, 0.0)), steel)
	# 포가 꼬리
	g.rod(bpos + Vector3(-0.75, -0.4, 0.0), ax + Vector3(-1.9, 0.05, 0.35), 0.06, 0.05, olive, 0, 6)
	g.rod(bpos + Vector3(-0.75, -0.4, 0.0), ax + Vector3(-1.9, 0.05, -0.35), 0.06, 0.05, olive, 0, 6)


static func _foliage(chunks: Dictionary, w: World, rng: RandomNumberGenerator) -> void:
	var leaf_kind := 7.0 / 16.0
	var bark := Color(0.2, 0.15, 0.11, 4.0 / 16.0)
	# 살아 있는 나무: 맵 가장자리 중심
	var placed := 0
	var tries := 0
	while placed < 26 and tries < 500:
		tries += 1
		var x := rng.randf_range(-215.0, 215.0)
		var z := rng.randf_range(-135.0, 135.0)
		var inside := absf(x) < World.HALF_X - 8.0 and absf(z) < World.HALF_Z - 8.0
		if inside:
			continue
		var y := w.height_at(x, z)
		var g := _g(chunks, Vector3(x, y, z))
		var h := rng.randf_range(5.0, 8.5)
		var base := Vector3(x, y - 0.3, z)
		var top := base + Vector3(rng.randf_range(-0.4, 0.4), h, rng.randf_range(-0.4, 0.4))
		g.rod(base, top, 0.42, 0.18, bark, 0, 8)
		var crown := top + Vector3(0, 0.6, 0)
		var n := rng.randi_range(5, 8)
		for k in n:
			var o := Vector3(rng.randf_range(-1.8, 1.8), rng.randf_range(-0.6, 1.5), rng.randf_range(-1.8, 1.8))
			var r := rng.randf_range(1.2, 2.2)
			var gcol := Color(0.11 + rng.randf() * 0.06, 0.17 + rng.randf() * 0.07, 0.05 + rng.randf() * 0.03, leaf_kind)
			g.sphere(r, Transform3D(Basis.IDENTITY, crown + o), gcol, 0, Vector3(1.0, 0.8, 1.0), 6, 10)
		placed += 1
	# 덤불: 필드 곳곳
	var bushes := 0
	tries = 0
	while bushes < 90 and tries < 900:
		tries += 1
		var x := rng.randf_range(-190.0, 190.0)
		var z := rng.randf_range(-105.0, 105.0)
		if w._near_point(x, z, World.POINT_R + 3.0) or w.height_at(x, z) < -0.3:
			continue
		var skip := false
		for tx in World.TRENCH_X:
			if absf(x - w.trench_center(tx, z)) < 5.0:
				skip = true
		if skip or w.inside_box(Vector3(x, w.height_at(x, z) + 0.3, z)):
			continue
		var y := w.height_at(x, z)
		var g := _g(chunks, Vector3(x, y, z))
		var n := rng.randi_range(3, 5)
		for k in n:
			var o := Vector3(rng.randf_range(-0.7, 0.7), 0.0, rng.randf_range(-0.7, 0.7))
			var r := rng.randf_range(0.35, 0.7)
			var gcol := Color(0.12 + rng.randf() * 0.07, 0.18 + rng.randf() * 0.07, 0.06 + rng.randf() * 0.03, leaf_kind)
			g.sphere(r, Transform3D(Basis.IDENTITY, Vector3(x, y + r * 0.45, z) + o), gcol, 0, Vector3(1.0, 0.7, 1.0), 4, 7)
		bushes += 1


static func _plaster(g: Geo, mn: Vector3, mx: Vector3, rng: RandomNumberGenerator) -> void:
	var c := (mn + mx) * 0.5
	var col := _kind_col(Color(0.60, 0.55, 0.46) * rng.randf_range(0.92, 1.06), 8)
	g.box(mx - mn, Transform3D(Basis.IDENTITY, c), col)


static func _house_visual(chunks: Dictionary, hs: Dictionary, w: World, rng: RandomNumberGenerator) -> void:
	var cx: float = hs.cx
	var cz: float = hs.cz
	var hw: float = hs.hw
	var hd: float = hs.hd
	var gy: float = hs.gy
	var top: float = gy + hs.h
	var ridge: float = top + 2.0
	var g := _g(chunks, Vector3(cx, gy, cz))
	var wood := _kind_col(Color(0.24, 0.17, 0.10), 3)
	var wood2 := _kind_col(Color(0.30, 0.21, 0.12), 3)
	var plaster := _kind_col(Color(0.60, 0.55, 0.46), 8)
	var tile := _kind_col(Color(0.34, 0.14, 0.09), 9)
	var brick := _kind_col(Color(0.40, 0.2, 0.14), 0)
	# 바닥 널
	g.box(Vector3(hw * 2.0 - 0.7, 0.06, hd * 2.0 - 0.7), Transform3D(Basis.IDENTITY, Vector3(cx, gy + 0.03, cz)), wood2)
	# 탁자와 의자
	g.box(Vector3(1.2, 0.06, 0.72), Transform3D(Basis.IDENTITY, Vector3(cx - 1.2, gy + 0.78, cz + 0.6)), wood2)
	for lx in [-0.5, 0.5]:
		for lz in [-0.3, 0.3]:
			g.box(Vector3(0.06, 0.76, 0.06), Transform3D(Basis.IDENTITY, Vector3(cx - 1.2 + lx, gy + 0.38, cz + 0.6 + lz)), wood)
	g.box(Vector3(0.4, 0.04, 0.4), Transform3D(Basis(Vector3.UP, 0.6), Vector3(cx - 0.2, gy + 0.46, cz + 1.4)), wood2)
	# 박공지붕: 서까래 + 기와(한쪽은 온전, 반대쪽은 군데군데 무너짐)
	var intact := rng.randi_range(0, 1)
	var wrecked: int = hs.wrecked
	for side in [0, 1]:
		var sgn := 1.0 if side == 0 else -1.0
		var eave := Vector3(cx, top - 0.15, cz + sgn * (hd + 0.55))
		var rid := Vector3(cx, ridge, cz)
		var dir := (rid - eave)
		var len := dir.length()
		var n := 7
		var x := cx - hw
		while x <= cx + hw + 0.01:
			if rng.randf() < 0.9:
				g.rod(Vector3(x, eave.y, eave.z), Vector3(x, rid.y, rid.z), 0.055, 0.05, wood, 0, 5)
			x += 1.2
		for k in n:
			var keep: bool = side == intact or rng.randf() < 0.32
			if wrecked >= 2 and side != intact:
				keep = rng.randf() < 0.18
			if not keep:
				continue
			var t0 := (float(k) + 0.5) / n
			var pos := eave.lerp(rid, t0) + Vector3(0, 0.05, 0)
			var basis := Basis.looking_at(dir.normalized(), Vector3.UP)
			g.box(Vector3(hw * 2.0 + 1.2, 0.08, len / n * 1.06), Transform3D(basis, pos), tile)
		g.rod(Vector3(cx - hw - 0.5, eave.y + 0.02, eave.z), Vector3(cx + hw + 0.5, eave.y + 0.02, eave.z), 0.06, 0.06, wood, 0, 5)
	g.rod(Vector3(cx - hw - 0.6, ridge, cz), Vector3(cx + hw + 0.6, ridge, cz), 0.1, 0.1, wood, 0, 6)
	# 박공벽(삼각형)
	if wrecked != 2:
		g.prism(Vector2(0.5, hd * 2.0 - 0.4), Vector2(0.5, 0.12), ridge - top, Transform3D(Basis.IDENTITY, Vector3(cx - hw, top, cz)), plaster)
	if wrecked != 3:
		g.prism(Vector2(0.5, hd * 2.0 - 0.4), Vector2(0.5, 0.12), ridge - top, Transform3D(Basis.IDENTITY, Vector3(cx + hw, top, cz)), plaster)
	# 굴뚝
	var chx := cx + hw - 1.4
	g.box(Vector3(0.85, ridge - gy + 0.9, 0.85), Transform3D(Basis.IDENTITY, Vector3(chx, gy + (ridge - gy + 0.9) * 0.5, cz + 0.9)), brick)
	g.box(Vector3(1.0, 0.14, 1.0), Transform3D(Basis.IDENTITY, Vector3(chx, ridge + 0.95, cz + 0.9)), brick)
	# 문·창 틀, 덧문, 열린 문짝
	for o in hs.open:
		var u: float = o.u
		var wd: float = o.w
		var y0: float = o.y0
		var y1: float = o.y1
		var t: float = o.t
		var fixed: float = o.fixed
		var mid := gy + (y0 + y1) * 0.5
		var hgt := y1 - y0
		var pc := Vector3(u, mid, fixed) if o.along_x else Vector3(fixed, mid, u)
		var sx := (t + 0.12) if not o.along_x else wd + 0.24
		var sz := (wd + 0.24) if not o.along_x else (t + 0.12)
		g.box(Vector3(sx, 0.13, sz), Transform3D(Basis.IDENTITY, pc + Vector3(0, hgt * 0.5 + 0.06, 0)), wood)
		var jx := Vector3(wd * 0.5 + 0.05, 0, 0) if o.along_x else Vector3(0, 0, wd * 0.5 + 0.05)
		var jsz := Vector3(0.1, hgt, t + 0.1) if o.along_x else Vector3(t + 0.1, hgt, 0.1)
		g.box(jsz, Transform3D(Basis.IDENTITY, pc + jx), wood)
		g.box(jsz, Transform3D(Basis.IDENTITY, pc - jx), wood)
		if y0 > 0.05:
			var ssz := Vector3(wd + 0.28, 0.08, t + 0.22) if o.along_x else Vector3(t + 0.22, 0.08, wd + 0.28)
			g.box(ssz, Transform3D(Basis.IDENTITY, pc + Vector3(0, -hgt * 0.5 - 0.04, 0)), wood)
			# 덧문: 절반쯤 달려 있고 비스듬히 매달림
			if rng.randf() < 0.55:
				var out := -1.0 if ((o.along_x and fixed < cz) or ((not o.along_x) and fixed < cx)) else 1.0
				var lp := pc + (Vector3(-wd * 0.62, 0, out * (t * 0.5 + 0.1)) if o.along_x else Vector3(out * (t * 0.5 + 0.1), 0, -wd * 0.62))
				var lsz := Vector3(wd * 0.5, hgt, 0.05) if o.along_x else Vector3(0.05, hgt, wd * 0.5)
				g.box(lsz, Transform3D(Basis(Vector3.UP, rng.randf_range(-0.5, 0.5)), lp), wood2)
		elif o.along_x:
			# 문짝: 한 장은 떨어져 비스듬히 기대 있음
			var leaf := Transform3D(Basis(Vector3.UP, -1.15), Vector3(u - wd * 0.5 + 0.3, gy + hgt * 0.5, fixed - 0.5))
			g.box(Vector3(0.06, hgt - 0.1, 0.72), leaf, wood2)
			g.box(Vector3(1.9, 0.14, 0.75), Transform3D(Basis.IDENTITY, Vector3(u, gy + 0.07, fixed - 0.55)), brick)


static func _wagon(g: Geo, mn: Vector3, mx: Vector3, rng: RandomNumberGenerator) -> void:
	# 부서진 보급 마차: 짐칸, 한쪽만 남은 바퀴, 꺾인 끌채, 찢어진 천막
	var c := (mn + mx) * 0.5
	var y0 := mn.y + 0.35
	var wood := _kind_col(Color(0.20, 0.14, 0.08), 3)
	var wood2 := _kind_col(Color(0.27, 0.19, 0.11), 3)
	var iron := Color(0.07, 0.07, 0.07, 5.0 / 16.0)
	var canvas := _kind_col(Color(0.36, 0.33, 0.24), 5)
	var tilt := Basis(Vector3(1, 0, 0), deg_to_rad(rng.randf_range(-7, 7)))
	g.box(Vector3(3.2, 0.12, 1.5), Transform3D(tilt, Vector3(c.x, y0 + 0.78, c.z)), wood2)
	for sz in [-1.0, 1.0]:
		g.box(Vector3(3.2, 0.5, 0.07), Transform3D(tilt, Vector3(c.x, y0 + 1.05, c.z + sz * 0.72)), wood)
	g.box(Vector3(0.07, 0.5, 1.5), Transform3D(tilt, Vector3(c.x - 1.56, y0 + 1.05, c.z)), wood)
	# 바퀴(뒤 한 쪽만 온전, 앞 한 쪽은 부서져 바닥에 누움)
	var wb := Basis(Vector3(1, 0, 0), PI * 0.5)
	g.cone(0.62, 0.62, 0.07, Transform3D(wb, Vector3(c.x - 0.9, y0 + 0.62, c.z + 0.82)), wood, 0, 16, false)
	g.cone(0.64, 0.64, 0.04, Transform3D(wb, Vector3(c.x - 0.9, y0 + 0.62, c.z + 0.82)), iron, 0, 16, false)
	for k in 6:
		var a := TAU * k / 6.0
		var wc := Vector3(c.x - 0.9, y0 + 0.62, c.z + 0.82)
		g.rod(wc, wc + Vector3(cos(a) * 0.6, sin(a) * 0.6, 0), 0.03, 0.03, wood, 0, 5)
	g.cone(0.58, 0.58, 0.07, Transform3D(Basis(Vector3.UP, 0.4) * Basis(Vector3(1, 0, 0), deg_to_rad(80)), Vector3(c.x + 1.0, y0 + 0.2, c.z - 1.3)), wood, 0, 14, false)
	g.rod(Vector3(c.x + 1.5, y0 + 0.78, c.z), Vector3(c.x + 3.0, y0 + 0.25, c.z + 0.5), 0.07, 0.06, wood, 0, 6)
	# 천막 활대와 찢어진 천
	for k in 3:
		var x := c.x - 1.1 + k * 1.05
		g.rod(Vector3(x, y0 + 0.95, c.z - 0.7), Vector3(x, y0 + 1.55, c.z), 0.03, 0.03, wood, 0, 5)
		g.rod(Vector3(x, y0 + 1.55, c.z), Vector3(x, y0 + 0.95, c.z + 0.7), 0.03, 0.03, wood, 0, 5)
	g.box(Vector3(1.1, 0.04, 0.95), Transform3D(Basis(Vector3(1, 0, 0), 0.7), Vector3(c.x - 0.5, y0 + 1.28, c.z - 0.37)), canvas)


static func _poles_and_hay(chunks: Dictionary, w: World, rng: RandomNumberGenerator) -> void:
	var pole := Color(0.18, 0.13, 0.09, 4.0 / 16.0)
	var wire := Color(0.05, 0.05, 0.05, 5.0 / 16.0)
	var ins := Color(0.55, 0.62, 0.6, 5.0 / 16.0)
	var prev: Array = []
	var x := -178.0
	while x <= 178.0:
		var z := w.road_z(x) + 5.0
		var y := w.height_at(x, z)
		var g := _g(chunks, Vector3(x, y, z))
		var top := Vector3(x, y + 6.6, z)
		g.rod(Vector3(x, y - 0.3, z), top, 0.13, 0.09, pole, 0, 7)
		g.box(Vector3(0.12, 0.12, 2.1), Transform3D(Basis.IDENTITY, top + Vector3(0, -0.45, 0)), pole)
		var cur: Array = []
		for k in 3:
			var o := Vector3(0, -0.28, -0.8 + 0.8 * k)
			g.rod(top + o + Vector3(0, -0.17, 0), top + o + Vector3(0, 0.02, 0), 0.03, 0.025, ins, 0, 5)
			cur.append(top + o + Vector3(0, 0.02, 0))
		if prev.size() == 3:
			for k in 3:
				var a: Vector3 = prev[k]
				var b: Vector3 = cur[k]
				var segs := 6
				var last := a
				for sgi in range(1, segs + 1):
					var t := float(sgi) / segs
					var p := a.lerp(b, t) + Vector3(0, -sin(t * PI) * 0.9, 0)
					g.rod(last, p, 0.007, 0.007, wire, 0, 3)
					last = p
		prev = cur
		x += 34.0
	# 건초더미: 집 주변 마당
	for hs in w.houses:
		for k in 3:
			var hx: float = hs.cx + rng.randf_range(-9.0, 9.0)
			var hz: float = hs.cz + rng.randf_range(7.0, 13.0) * (1.0 if rng.randf() < 0.5 else -1.0)
			var hy := w.height_at(hx, hz)
			if w.inside_box(Vector3(hx, hy + 0.5, hz)) or w.road_mask(hx, hz) > 0.1:
				continue
			var g := _g(chunks, Vector3(hx, hy, hz))
			var straw := Color(0.55 + rng.randf() * 0.08, 0.44 + rng.randf() * 0.06, 0.2, 5.0 / 16.0)
			var prof := [Vector2(0.0, 0.0), Vector2(1.05, 0.0), Vector2(1.12, 0.35), Vector2(0.95, 0.95), Vector2(0.6, 1.5), Vector2(0.2, 1.8), Vector2(0.0, 1.85)]
			g.lathe(prof, 12, Transform3D(Basis(Vector3.UP, rng.randf() * TAU), Vector3(hx, hy - 0.05, hz)), straw, 0)


static func _rocks_and_logs(chunks: Dictionary, w: World, rng: RandomNumberGenerator) -> void:
	var rock_kind := 12.0 / 16.0
	var bark := Color(0.2, 0.15, 0.11, 4.0 / 16.0)
	var placed := 0
	var tries := 0
	while placed < 110 and tries < 1500:
		tries += 1
		var x := rng.randf_range(-195.0, 195.0)
		var z := rng.randf_range(-110.0, 110.0)
		var y := w.height_at(x, z)
		if y < -0.4 or w._near_point(x, z, World.POINT_R + 2.0) or w.road_mask(x, z) > 0.2:
			continue
		if w.inside_box(Vector3(x, y + 0.3, z)):
			continue
		var skip := false
		for tx in World.TRENCH_X:
			if absf(x - w.trench_center(tx, z)) < 4.5:
				skip = true
		if skip:
			continue
		var g := _g(chunks, Vector3(x, y, z))
		var base := Color(0.30, 0.28, 0.25) * rng.randf_range(0.8, 1.15)
		var col := Color(base.r, base.g, base.b, rock_kind)
		var big := rng.randf() < 0.18
		var n := rng.randi_range(2, 4)
		for k in n:
			var sz := Vector3(rng.randf_range(0.25, 0.7), rng.randf_range(0.18, 0.45), rng.randf_range(0.25, 0.65)) * (1.7 if big else 1.0)
			var rb := Basis(Vector3.UP, rng.randf() * TAU) * Basis(Vector3.RIGHT, rng.randf_range(-0.4, 0.4)) * Basis(Vector3.BACK, rng.randf_range(-0.4, 0.4))
			var off := Vector3(rng.randf_range(-0.35, 0.35), 0.0, rng.randf_range(-0.35, 0.35))
			g.box(sz, Transform3D(rb, Vector3(x, y + sz.y * 0.32, z) + off), col)
		placed += 1
	# 쓰러진 통나무
	var logs := 0
	tries = 0
	while logs < 14 and tries < 400:
		tries += 1
		var x := rng.randf_range(-190.0, 190.0)
		var z := rng.randf_range(-105.0, 105.0)
		var y := w.height_at(x, z)
		if y < -0.4 or w._near_point(x, z, World.POINT_R + 3.0) or w.road_mask(x, z) > 0.2 or w.inside_box(Vector3(x, y + 0.3, z)):
			continue
		var g := _g(chunks, Vector3(x, y, z))
		var a := rng.randf() * PI
		var d := Vector3(cos(a), 0.0, sin(a)) * rng.randf_range(1.4, 2.2)
		var r := rng.randf_range(0.2, 0.3)
		var p0 := Vector3(x, y + r * 0.8, z) - d
		var p1 := Vector3(x, y + r * 0.8, z) + d
		p0.y = w.height_at(p0.x, p0.z) + r * 0.85
		p1.y = w.height_at(p1.x, p1.z) + r * 0.85
		g.rod(p0, p1, r, r * 0.8, bark, 0, 9)
		g.sphere(r * 0.82, Transform3D(Basis.IDENTITY, p1), Color(0.35, 0.27, 0.18, 4.0 / 16.0), 0, Vector3.ONE, 4, 8)
		for k in 2:
			var t := rng.randf_range(0.2, 0.8)
			var bp := p0.lerp(p1, t)
			g.rod(bp, bp + Vector3(rng.randf_range(-0.4, 0.4), rng.randf_range(0.3, 0.6), rng.randf_range(-0.4, 0.4)), 0.05, 0.02, bark, 0, 5)
		logs += 1


## 실제(스캔) CC0 모델로 통·상자·탄약 상자·제리캔을 배치한다. 충돌 상자는 그대로 두고 겉모습만 교체한다.
static func _models(root: Node3D, w: World, rng: RandomNumberGenerator) -> void:
	if not ModelLib.available():
		return
	var mr := Node3D.new()
	mr.name = "Models"
	root.add_child(mr)
	for b in w.boxes:
		var mn: Vector3 = b.mn
		var mx: Vector3 = b.mx
		var c := (mn + mx) * 0.5
		var kind: int = b.kind
		var base := Vector3(c.x, mn.y + 0.35, c.z)
		if kind == 5:
			var m := ModelLib.make("barrel_03", base, rng.randf() * TAU, mx.y - mn.y - 0.35)
			if m != null:
				ModelLib.tint(m, Color(0.55, 0.52, 0.48))
				mr.add_child(m)
		elif kind == 2:
			var sx := mx.x - mn.x
			var sz := mx.z - mn.z
			var h := mx.y - mn.y - 0.35
			var big := maxf(sx, sz) > 1.45
			var name := "old_military_crate" if big else "wooden_crate_02"
			var bb := ModelLib.bounds(name)
			var long_side := maxf(bb.size.x, bb.size.z)
			var k := maxf(sx, sz) / long_side
			var layer := bb.size.y * k
			var n := maxi(1, int(round(h / layer)))
			var yaw0 := rng.randf_range(-0.12, 0.12) + (PI * 0.5 if sx < sz else 0.0)
			for i in n:
				var m := ModelLib.make(name, base + Vector3(0, layer * i, 0), yaw0 + (0.0 if i % 2 == 0 else rng.randf_range(-0.2, 0.2)), 0.0, k)
				if m != null:
					mr.add_child(m)
		elif kind == 6:
			# 천막 옆 보급품
			for q in 2:
				var a := rng.randf() * TAU
				var off := Vector3(cos(a), 0, sin(a)) * (((mx - mn).x * 0.5) + 0.9)
				var p := Vector3(c.x + off.x, w.height_at(c.x + off.x, c.z + off.z), c.z + off.z)
				var m := ModelLib.make("ammo_box", p, rng.randf() * TAU, 0.0, 1.6) if q == 0 else ModelLib.make("metal_jerrycan_green", p, rng.randf() * TAU, 0.55)
				if m != null:
					mr.add_child(m)
