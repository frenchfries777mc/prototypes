window.FF_EXAMPLES = {
  'Rock Dodge': `title "Rock Dodge"
background space
lives 3
music chill

player = make ship at center bottom
  control arrows
  speed 420

every 0.6 sec
  make rock from top
    move down random(150, 330) + level * 25
    spin random(-90, 90)
    size random(40, 80)

every 12 sec
  level up

every 6 sec
  make heart from top
    move down 130

every 1 sec
  score +1

if player hits rock
  rock.explode
  lives -1

if player hits heart
  heart.sparkle
  lives +1
`,
  'Coin Catcher': `title "Coin Catcher"
background sky
lives 3

player = make hero at center bottom
  control leftright
  speed 520

every 0.7 sec
  make coin from top
    move down random(160, 260)

every 1.4 sec
  make box from top
    move down random(200, 320)
    spin 60

if player hits coin
  coin.sparkle
  score +10

if player hits box
  box.explode
  lives -1

if coin leaves
  lives -1

if score >= 150
  win
`,
  'Star Shooter': `title "Star Shooter"
background night
lives 3
music action

player = make ship at center bottom
  control arrows
  speed 440

if key space
  make bullet at player
    move up 700

every 0.9 sec
  make enemy from top
    move down random(70, 130)

every 4 sec
  make star from top
    move down 120

if bullet hits enemy
  enemy.explode
  bullet.remove
  score +10

if player hits enemy
  enemy.explode
  lives -1

if player hits star
  star.sparkle
  score +25

if score >= 200
  win
`,
  'Sky Hopper': `title "Sky Hopper"
background sky
lives 3
music happy

player = make hero at 70 480
  control platformer
  speed 380

make platform at 200 430
  size 170
make platform at 440 350
  size 170
make platform at 680 270
  size 170
make platform at 860 190
  size 150

make coin at 200 385
make coin at 440 305
make coin at 680 225

make spike at 330 518
make spike at 600 518

make flag at 880 156

if player hits coin
  coin.sparkle
  score +10

if player hits spike
  lives -1
  player.x = 70
  player.y = 480
  player.vy = 0

if player hits flag
  score +50
  win
`,
  'Fruit Catch': `title "Fruit Catch"
background sky
lives 3
music chill

basket = make "🧺" at center bottom
  control leftright
  speed 600
  size 84

every 0.8 sec
  apple = make "🍎" from top
    move down 150 + level * 30

every 2 sec
  bomb = make "💣" from top
    move down 200 + level * 25

every 10 sec
  level up

if basket hits apple
  apple.sparkle
  score +10

if basket hits bomb
  bomb.explode
  lives -1

if apple leaves
  lives -1
`,
  'Tile Adventure': `title "Tile Adventure"
background sunset
lives 3
music happy
set gems to 0

map
  ....................
  ....................
  ..................F.
  ................####
  .............G......
  ...........###......
  .....C..............
  ....###.......C.....
  .P......^.....^..S..
  ####################
  ####################

if player hits spike
  remove 1 from lives
  player.x = 70
  player.y = 380
  player.vy = 0
  flash red

if player hits coin
  coin.sparkle
  add 10 to score

if player hits gem
  gem.sparkle
  add 1 to gems
  add 50 to score

if player hits star
  star.sparkle
  add 25 to score
  banner "BONUS!" 1 sec

if player hits flag
  banner "GOAL!"
  confetti
  win

label "Gems: {gems}" at left 110
`,
  'Boss Fight': `title "Boss Fight"
background grid
lives 3
music action

player = make ship at center bottom
  control arrows
  speed 440

boss = make ghost at center 130
  size 120
  health 20
  patrol 300 120

label "BOSS {boss.hp}" at center top

if key space
  make bullet at player
    move up 800

if bullet hits boss
  bullet.remove
  boss.hurt 1
  burst 6 cyan at bullet

every 1.2 sec
  make bomb at boss
    toward player 220

if player hits bomb
  bomb.explode
  remove 1 from lives

if boss.hp <= 0
  banner "YOU WIN!"
  confetti
  win
`,
  'Pixel Pets': `title "Pixel Pets"
background forest
music chill

art cat orange
  ##.....##
  ###...###
  #########
  ##k###k##
  #########
  ####m####
  .#######.

art frog green
  .##....##.
  #w#....#w#
  .########.
  ##########
  #.######.#
  ..#....#..

label "Pets: {count(cat) + count(frog)}" at center top

if click
  make cat at mouse
    wander 90
    life 25 sec

if key space
  make frog at mouse
    wander 70
    life 25 sec
    glow
`,
  'Big World': `title "Big World"
background sky
lives 3
music happy
weather petals
coins = 0
load coins

map
  ..........................................................
  .............................S............................
  ............C....................===.........C............
  ...........===...............E..............===...........
  .....C.C...................#####..........E...............
  .P.............C.C.C.......#####...............C.C..F.....
  #######...#########..##..############...###############...
  #######^^^#########^^##^^############^^^###############^^^

make platform at 420 330
  size 130
  patrol up 90 60

slime.gravity
slime.chase player 130 260

label "🪙 {coins}" at right 110

if player hits coin
  coin.sparkle
  add 10 to score
  add 1 to coins
  save coins

if player hits star
  star.sparkle
  add 50 to score
  play "C5 E5 G5" 0.08

if player hits slime
  if player.vy > 0 and player.y < slime.y - 10
    slime.explode
    player.vy = -560
    add 20 to score
  else
    remove 1 from lives
    player.x = 80
    player.y = 300

if player hits spike
  remove 1 from lives
  player.x = 80
  player.y = 300

if player hits flag
  win
`,
  'Maze Quest': `title "Maze Quest"
background grid
music chill
gems = 0

scene start
  make "🗝" at center 220
    size 90
  label "MAZE QUEST" at center 330
  label "SPACE" at center 390
  if key space
    go to maze

scene maze
  set gems to 0
  map topdown
    ####################
    #P....#.....G.....E#
    #.##..#.####.####..#
    #.#G.......#....#..#
    #.#####.##.#.##.#.##
    #.....#..#...#G....#
    ###.#.##.#####.###.#
    #G..#....E.....#..C#
    ####################
  label "💎 {gems} / 4" at left 110
  talk "요정" "보석 4개를 모아서 출구(코인)로 가요!"
  talk "요정" "유령이랑 슬라임은 가까이 가면 쫓아와요. 조심!"
  make ghost at 648 102
    size 38
    chase player 105 240
  slime.chase player 85 200
  if player hits gem
    gem.sparkle
    add 1 to gems
  if gems >= 4
    sound magic
    talk "요정" "문이 열렸어요!"
  if player hits coin
    if gems >= 4
      go to clear
    else
      player.say "보석이 모자라요"
  if player hits slime
    go to caught
  if player hits ghost
    go to caught

scene caught
  shake 14
  label "잡혔다!" at center
  after 1.5 sec
    go to maze

scene clear
  confetti
  play "C E G C5 G C5" 0.13
  label "탈출 성공!" at center
`,
  'Music Box': `title "Music Box"
background night
weather snow

piano = make "🎹" at center
  size 130

label "A  S  D  F  G  H" at center 420

if key a
  tone 262 0.4 triangle
  burst 12 red at 200 300
if key s
  tone 294 0.4 triangle
  burst 12 orange at 320 300
if key d
  tone 330 0.4 triangle
  burst 12 yellow at 440 300
if key f
  tone 392 0.4 triangle
  burst 12 green at 560 300
if key g
  tone 440 0.4 triangle
  burst 12 cyan at 680 300
if key h
  tone 523 0.4 triangle
  burst 12 purple at 800 300
if key space
  play "도 미 솔 도5 솔 미 도" 0.14
  confetti
`
};
