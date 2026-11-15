window.FF_EXAMPLES = {
  'Rock Dodge': `title "Rock Dodge"
background space
lives 3

player = make ship at center bottom
  control arrows
  speed 420

every 0.6 sec
  make rock from top
    move down random(150, 330)
    spin random(-90, 90)
    size random(40, 80)

every 6 sec
  make heart from top
    move down 130

every 1 sec
  score +1

when player hits rock
  rock.explode
  lives -1

when player hits heart
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

when player hits coin
  coin.sparkle
  score +10

when player hits box
  box.explode
  lives -1

when coin leaves
  lives -1

always
  if score >= 150
    win
`,
  'Star Shooter': `title "Star Shooter"
background night
lives 3

player = make ship at center bottom
  control arrows
  speed 440

when key space
  make bullet at player
    move up 700

every 0.9 sec
  make enemy from top
    move down random(70, 130)

every 4 sec
  make star from top
    move down 120

when bullet hits enemy
  enemy.explode
  bullet.remove
  score +10

when player hits enemy
  enemy.explode
  lives -1

when player hits star
  star.sparkle
  score +25

always
  if score >= 200
    win
`
};
