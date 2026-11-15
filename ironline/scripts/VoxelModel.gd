class_name VoxelModel
extends RefCounted
## 복셀 메시 생성기. 보이는 면만 만들고, 면 방향별 음영을 정점 색에 구워 넣는다.
## (조명 계산이 필요 없어 저사양 웹에서도 가볍고, 3D 픽셀 느낌이 일정하게 난다)

# +x, -x, +y, -y, +z, -z
const FACE_SHADE := [0.82, 0.70, 1.0, 0.50, 0.88, 0.76]
const DIRS := [
	Vector3i(1, 0, 0), Vector3i(-1, 0, 0),
	Vector3i(0, 1, 0), Vector3i(0, -1, 0),
	Vector3i(0, 0, 1), Vector3i(0, 0, -1),
]
const CORNERS := [
	[Vector3(1, 0, 0), Vector3(1, 1, 0), Vector3(1, 1, 1), Vector3(1, 0, 1)],
	[Vector3(0, 0, 1), Vector3(0, 1, 1), Vector3(0, 1, 0), Vector3(0, 0, 0)],
	[Vector3(0, 1, 0), Vector3(0, 1, 1), Vector3(1, 1, 1), Vector3(1, 1, 0)],
	[Vector3(0, 0, 1), Vector3(0, 0, 0), Vector3(1, 0, 0), Vector3(1, 0, 1)],
	[Vector3(1, 0, 1), Vector3(1, 1, 1), Vector3(0, 1, 1), Vector3(0, 0, 1)],
	[Vector3(0, 0, 0), Vector3(0, 1, 0), Vector3(1, 1, 0), Vector3(1, 0, 0)],
]

var cells := {}
var verts := PackedVector3Array()
var cols := PackedColorArray()


static func hash3(x: int, y: int, z: int) -> float:
	var h: int = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791)
	h = (h ^ (h >> 13)) * 1274126177
	return float(h & 0xFFFF) / 65535.0


static func tint(c: Color, f: float) -> Color:
	return Color(clampf(c.r * f, 0.0, 1.0), clampf(c.g * f, 0.0, 1.0), clampf(c.b * f, 0.0, 1.0), 1.0)


## 정수 격자 상자(양끝 포함)를 채운다.
func box(a: Vector3i, b: Vector3i, color: Color, jitter: float = 0.06) -> void:
	for x in range(a.x, b.x + 1):
		for y in range(a.y, b.y + 1):
			for z in range(a.z, b.z + 1):
				var f := 1.0 + (hash3(x, y, z) - 0.5) * 2.0 * jitter
				cells[Vector3i(x, y, z)] = tint(color, f)


func quad(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, c: Color) -> void:
	verts.append(p0)
	verts.append(p1)
	verts.append(p2)
	verts.append(p0)
	verts.append(p2)
	verts.append(p3)
	for i in 6:
		cols.append(c)


## cells 에 쌓인 복셀을 메시 정점으로 바꾼다. vs = 복셀 한 변 길이(미터).
func build_cells(vs: float, offset: Vector3 = Vector3.ZERO) -> void:
	for key in cells:
		var c: Color = cells[key]
		for f in 6:
			if cells.has(key + DIRS[f]):
				continue
			var cn: Array = CORNERS[f]
			var col := tint(c, FACE_SHADE[f])
			var k := Vector3(key)
			quad((k + cn[0]) * vs + offset, (k + cn[1]) * vs + offset,
				(k + cn[2]) * vs + offset, (k + cn[3]) * vs + offset, col)


## 월드 좌표 상자의 겉면을 cell 크기 격자로 쪼개 색을 흩뿌린다(건물 벽·모래주머니 등).
func box_faces(bmin: Vector3, bmax: Vector3, color: Color, cell: float, jitter: float = 0.08,
		skip_bottom: bool = true, salt: int = 0) -> void:
	var size := bmax - bmin
	for axis in 3:
		for sgn in [-1, 1]:
			if axis == 1 and sgn == -1 and skip_bottom:
				continue
			var ua := (axis + 1) % 3
			var va := (axis + 2) % 3
			var nu := maxi(1, int(ceil(size[ua] / cell - 0.001)))
			var nv := maxi(1, int(ceil(size[va] / cell - 0.001)))
			var w: float = bmax[axis] if sgn > 0 else bmin[axis]
			var shade: float = FACE_SHADE[axis * 2 + (0 if sgn > 0 else 1)]
			for i in nu:
				var u0: float = bmin[ua] + size[ua] * float(i) / nu
				var u1: float = bmin[ua] + size[ua] * float(i + 1) / nu
				for j in nv:
					var v0: float = bmin[va] + size[va] * float(j) / nv
					var v1: float = bmin[va] + size[va] * float(j + 1) / nv
					var f := 1.0 + (hash3(i + salt * 31, j * 7 + axis, sgn + salt) - 0.5) * 2.0 * jitter
					var col := tint(color, shade * f)
					var p0 := Vector3()
					var p1 := Vector3()
					var p2 := Vector3()
					var p3 := Vector3()
					p0[axis] = w
					p1[axis] = w
					p2[axis] = w
					p3[axis] = w
					p0[ua] = u0
					p0[va] = v0
					p1[ua] = u1
					p1[va] = v0
					p2[ua] = u1
					p2[va] = v1
					p3[ua] = u0
					p3[va] = v1
					quad(p0, p1, p2, p3, col)


func commit() -> ArrayMesh:
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_COLOR] = cols
	var m := ArrayMesh.new()
	if verts.size() > 0:
		m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
		m.surface_set_material(0, material())
	return m


static var _mat: StandardMaterial3D = null

static func material() -> StandardMaterial3D:
	if _mat == null:
		_mat = StandardMaterial3D.new()
		_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_mat.vertex_color_use_as_albedo = true
		_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	return _mat
