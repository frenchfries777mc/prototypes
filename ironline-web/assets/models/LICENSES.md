# 3D 모델 추가분 (모두 CC0)

아래 두 묶음은 모두 **CC0 1.0 (퍼블릭 도메인)** 이라 저작자 표시 의무가 없다. 그래도 출처를 남긴다.
게임에서는 `Geo.add_model` 로 소품 청크 메시에 정점 색으로 구워 넣는다(`WorldGfx._extras_cc0` 등). 충돌 없는 장식이다.

## Kenney — Nature Kit 2.1 (`kenney/` 폴더, 54개)

- 제작: [Kenney](https://kenney.nl) · 라이선스: Creative Commons Zero (동봉된 `kenney/License.txt` 참고)
- 받은 곳: OpenGameArt 의 "Nature Kit" 게시물(<https://opengameart.org/content/nature-kit>), GLTF 형식 중 아래 모델만 골라 담았다. 모델 자체는 수정하지 않았다.
- 쓰임: 나무 15종(맵 가장자리), 덤불 5종, 바위·돌 16종, 통나무·그루터기 7종, 울타리 3종, 들꽃 5종, 버섯 2종, 모닥불 장작 1종.
- 원본의 파스텔 색은 전장 색조에 맞도록 실행 중에 올리브·갈색 쪽으로 섞는다. 바위·껍질·판자는 기존 Poly Haven 텍스처 셰이더로 입힌다.

## Poly Haven — 소품 16종 (폴더 이름 = 모델 이름)

[Poly Haven](https://polyhaven.com) 모델이다. 웹 용량·정점 색 굽기에 맞춰 법선·ARM 텍스처를 빼고 알베도만 256px JPG 로 줄여 담았다. 형상은 그대로다.

| 폴더 | 이름 | 작가 | 쓰임 |
|---|---|---|---|
| `wooden_ladder_02` | Wooden Ladder 02 | JN_3DPRINTINGNERD | 참호 사다리 |
| `wooden_bucket_01` | Wooden Bucket 01 | James Ray Cock | 참호 양동이 |
| `picke_dirty_01` | Picke Dirty 01 | Dennis Halbeck | 참호의 곡괭이 |
| `wooden_axe_02` | Wooden Axe 02 | Ulan Cabanilla | 참호의 도끼 |
| `crowbar_01` | Crowbar 01 | Alexander Otterbeck | 참호의 쇠지렛대 |
| `cross_pein_hammer` | Cross Pein Hammer | Tics | 참호의 망치 |
| `oil_tin` | Oil Tin | Niklas | 참호의 기름통 |
| `can_rusted` | Can Rusted | Rahul Chaudhary | 참호의 녹슨 깡통 |
| `russian_food_cans_01` | Russian Food Cans 01 | Kosan Aziz | 참호의 통조림 |
| `medical_box` | Medical Box | Ulan Cabanilla | 참호의 구급상자 |
| `old_tyre` | Old Tyre | MP | 참호의 낡은 타이어 |
| `stone_fire_pit` | Stone Fire Pit | Sebastian Platen | 천막 옆 돌 화덕 |
| `painted_wooden_chair_01` | Painted Wooden Chair 01 | Kuutti Siitonen | 집 안 의자 |
| `painted_wooden_shelves` | Painted Wooden Shelves | Kirill Sannikov | 집 안 벽 선반 |
| `painted_wooden_stool` | Painted Wooden Stool | Kirill Sannikov | 야영지 걸상 |
| `jug_01` | Jug 01 | Kuutti Siitonen | 집 안 탁자 위 항아리 |

원본: `https://polyhaven.com/a/<폴더 이름>` · 라이선스 원문: https://polyhaven.com/license

---

# 서드파티 에셋

모든 3D 모델은 [Poly Haven](https://polyhaven.com) 의 **CC0 1.0 (퍼블릭 도메인)** 자산이다. 저작자 표시 의무는 없지만 출처를 남긴다.
텍스처는 웹 용량을 줄이려고 1k → 512px 로 줄였다. 모델 자체는 수정하지 않았다.

| 폴더 | 이름 | 작가 | 라이선스 |
|---|---|---|---|
| `barrel_03` | Barrel 03 | Serhii Khromov | CC0 1.0 |
| `wooden_crate_02` | Wooden Crate 02 | James Ray Cock, Jurita Burger | CC0 1.0 |
| `ammo_box` | Ammo Box | DanKit | CC0 1.0 |
| `old_military_crate` | Old Military Crate | Jack Mava | CC0 1.0 |
| `metal_jerrycan_green` | Metal Jerrycan Green | Ulan Cabanilla | CC0 1.0 |

라이선스 원문: https://polyhaven.com/license ("CC0"), https://creativecommons.org/publicdomain/zero/1.0/

---

# Objaverse 출처 모델 (CC-BY 4.0)

아래 모델은 [Objaverse](https://objaverse.allenai.org/) 데이터셋에 올라온 Sketchfab 모델이며, 각 모델의 라이선스는 **CC Attribution 4.0** 이다
(<https://creativecommons.org/licenses/by/4.0/>). 작가를 밝히는 것이 조건이다. 원본에서 바꾼 점: 텍스처를 최대 128px 로 줄여(정점 색으로 굽는 데만 쓴다) 재압축했고,
게임 안에서 크기를 맞추고 일부(턱끈)를 잘라 썼으며, 병사 철모는 팀 색으로 색을 섞어 입혔다. 형상은 그대로다.

| 폴더 | 모델 이름 | 작가 | Objaverse/Sketchfab uid | 쓰임 |
|---|---|---|---|---|
| imperial_helmet | Low Poly Imperial War Helmet | Yanez Designs | a0d0b01f22d346629306bf316d539714 | A팀 병사 철모 |
| hsat_helmet | HSAT Mk. III | simcardo | 7e5de66b10694898ae9b60cb1927a361 | B팀 병사 철모 |
| stahlhelm | Stahlhelm M16 (remake) | Vasikle | 3ec38868fa9947328e2d0f80a8be51db | 전장 소품 |
| lebel | Lebel 1886 Great War Weapon | FedeOde | d96b4536148d44fe9fc8e947088e215b | 참호 바닥의 소총 |
| old_shovel | Old Shovel | Aki_Kato | 50ec3232e4ee4100a5f1ccf4acc4018c | 참호 둔덕의 야전삽 |
| petrol_lamp | Petrol Lamp | Escoly | 416f4870df6449dfaf9533be8aa18701 | 참호의 석유 랜턴 |
| binoculars | Soviet binoculars | Artkalsin | e158ee130ac54392b4be7c09fb7557de | 상자 위 쌍안경 |

uid 로 `https://sketchfab.com/3d-models/<uid>` 에서 원본 페이지를 찾을 수 있다. 라이선스 표시는 Objaverse 메타데이터(`license: by`)를 따랐다.
