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
`
};
