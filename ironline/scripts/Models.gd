class_name Models
extends RefCounted
## 코드로 만드는 복셀 모델: 병사, 1인칭 총, 깃발.
## 병사는 키 ~1.85m = 34복셀 (복셀 한 변 5.4cm) 라서 가까이서 봐도 도트가 정교하다.

const VS := 0.054

const PALETTE := [
	# 팀 A: 북부 연합 (회청색)
	{"coat": Color("#5f7a99"), "pants": Color("#45586f"), "helmet": Color("#8794a1"),
	 "accent": Color("#d6dee6"), "flag": Color("#5b8bd6")},
	# 팀 B: 남부 동맹 (카키)
	{"coat": Color("#8f7d4d"), "pants": Color("#6f6238"), "helmet": Color("#6a6640"),
	 "accent": Color("#e6d9a8"), "flag": Color("#d6b650")},
]
const SKIN := Color("#d9a679")
const LEATHER := Color("#4a3523")
const WOOD := Color("#6b4a2b")
const METAL := Color("#33363a")
const BOOT := Color("#2a211a")


static func soldier(team: int) -> ArrayMesh:
	var p: Dictionary = PALETTE[team]
	var v := VoxelModel.new()
	# 다리와 군화
	v.box(Vector3i(-4, 3, -2), Vector3i(-1, 13, 1), p.pants)
	v.box(Vector3i(0, 3, -2), Vector3i(3, 13, 1), p.pants)
	v.box(Vector3i(-4, 0, -3), Vector3i(-1, 2, 1), BOOT)
	v.box(Vector3i(0, 0, -3), Vector3i(3, 2, 1), BOOT)
	# 몸통, 허리띠, 단추
	v.box(Vector3i(-5, 14, -3), Vector3i(4, 25, 2), p.coat)
	v.box(Vector3i(-5, 14, -3), Vector3i(4, 15, 2), LEATHER)
	v.box(Vector3i(-1, 17, -3), Vector3i(-1, 24, -3), p.accent)
	v.box(Vector3i(-5, 22, -3), Vector3i(4, 22, -3), LEATHER, 0.02)
	# 어깨와 팔
	v.box(Vector3i(-8, 17, -2), Vector3i(-6, 24, 1), p.coat)
	v.box(Vector3i(5, 17, -2), Vector3i(7, 24, 1), p.coat)
	v.box(Vector3i(1, 18, -9), Vector3i(4, 20, -2), p.coat)
	v.box(Vector3i(-5, 18, -12), Vector3i(-2, 20, -2), p.coat)
	v.box(Vector3i(1, 18, -11), Vector3i(4, 20, -10), SKIN)
	v.box(Vector3i(-5, 18, -14), Vector3i(-2, 20, -13), SKIN)
	# 소총
	v.box(Vector3i(-1, 18, -20), Vector3i(0, 19, -10), METAL, 0.04)
	v.box(Vector3i(-1, 18, -9), Vector3i(0, 19, 2), WOOD, 0.08)
	# 머리
	v.box(Vector3i(-3, 26, -3), Vector3i(2, 30, 2), SKIN)
	v.box(Vector3i(-2, 28, -3), Vector3i(-2, 28, -3), METAL, 0.0)
	v.box(Vector3i(1, 28, -3), Vector3i(1, 28, -3), METAL, 0.0)
	if team == 0:
		# 철모 + 장식
		v.box(Vector3i(-4, 30, -4), Vector3i(3, 32, 3), p.helmet)
		v.box(Vector3i(-3, 33, -3), Vector3i(2, 33, 2), p.helmet)
		v.box(Vector3i(-1, 34, -1), Vector3i(0, 35, 0), p.accent, 0.0)
	else:
		# 챙 있는 군모
		v.box(Vector3i(-4, 30, -4), Vector3i(3, 31, 3), p.helmet)
		v.box(Vector3i(-4, 32, -3), Vector3i(3, 33, 3), p.helmet)
		v.box(Vector3i(-3, 30, -6), Vector3i(2, 30, -5), p.helmet)
	# 배낭과 담요 말이
	v.box(Vector3i(-4, 15, 3), Vector3i(3, 22, 5), LEATHER)
	v.box(Vector3i(-5, 23, 3), Vector3i(4, 24, 5), p.accent)
	v.build_cells(VS)
	return v.commit()


## 1인칭 총기. 카메라 앞 오른쪽 아래에 붙인다. 총구는 -z 방향.
static func viewmodel(weapon: int) -> ArrayMesh:
	var v := VoxelModel.new()
	var sleeve := Color("#5f7a99")
	match weapon:
		0:  # 볼트액션 소총
			v.box(Vector3i(-1, 0, -44), Vector3i(1, 2, -24), METAL, 0.04)
			v.box(Vector3i(-1, 0, -23), Vector3i(1, 3, -6), WOOD, 0.08)
			v.box(Vector3i(-1, 3, -16), Vector3i(1, 3, -12), METAL)
			v.box(Vector3i(2, 2, -12), Vector3i(3, 3, -11), METAL)
			v.box(Vector3i(-1, -2, -5), Vector3i(1, 2, 6), WOOD, 0.08)
		1:  # 기관단총
			v.box(Vector3i(-1, 0, -30), Vector3i(1, 2, -18), METAL, 0.04)
			v.box(Vector3i(-2, -1, -17), Vector3i(2, 3, -2), METAL, 0.04)
			v.box(Vector3i(-1, -9, -10), Vector3i(1, -2, -7), METAL)
			v.box(Vector3i(-1, -1, -1), Vector3i(1, 2, 6), WOOD, 0.08)
		_:  # 경기관총
			v.box(Vector3i(-1, 0, -46), Vector3i(1, 2, -20), METAL, 0.04)
			v.box(Vector3i(-3, -1, -19), Vector3i(3, 4, -2), METAL, 0.04)
			v.box(Vector3i(-3, 4, -14), Vector3i(3, 6, -6), Color("#4b4f54"))
			v.box(Vector3i(-1, -2, -1), Vector3i(1, 3, 6), WOOD, 0.08)
			v.box(Vector3i(-2, -8, -40), Vector3i(-1, 0, -39), METAL)
			v.box(Vector3i(1, -8, -40), Vector3i(2, 0, -39), METAL)
	# 왼손(앞) / 오른손(뒤)과 소매
	v.box(Vector3i(-5, -3, -22), Vector3i(-2, 0, -15), SKIN)
	v.box(Vector3i(-8, -6, -14), Vector3i(-2, -2, 2), sleeve)
	v.box(Vector3i(1, -4, 2), Vector3i(4, 0, 7), SKIN)
	v.box(Vector3i(2, -7, 6), Vector3i(7, -3, 12), sleeve)
	v.build_cells(0.013)
	return v.commit()


static func flag(color: Color) -> ArrayMesh:
	var v := VoxelModel.new()
	v.box(Vector3i(0, 0, 0), Vector3i(1, 40, 1), Color("#3a2e22"), 0.05)
	v.box(Vector3i(2, 28, 0), Vector3i(17, 39, 0), color, 0.05)
	v.box(Vector3i(0, 41, 0), Vector3i(1, 41, 1), Color("#d8d0b0"), 0.0)
	v.build_cells(0.12, Vector3(-0.1, 0, -0.1))
	return v.commit()
