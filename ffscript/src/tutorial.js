window.FF_TUTORIAL = [
 {
  "title": "우주선 띄우기",
  "text": "화면의 제목과 배경, 그리고 내 우주선을 만들어요. make 로 만들고, 아래 줄에 한 칸 들여써서 조종 방법을 정해요. 방향키로 움직여 보세요!",
  "code": "title \"My First Game\"\nbackground space\n\nplayer = make ship at center bottom\n  control arrows\n  speed 420\n"
 },
 {
  "title": "바위 떨어뜨리기",
  "text": "every 1 sec 은 1초마다 반복이에요. 그 아래에 make rock from top 으로 위에서 바위가 나오게 하고, move down 으로 아래로 떨어뜨려요.",
  "code": "title \"My First Game\"\nbackground space\n\nplayer = make ship at center bottom\n  control arrows\n  speed 420\n\nevery 0.8 sec\n  make rock from top\n    move down random(150, 320)\n    spin random(-90, 90)\n"
 },
 {
  "title": "부딪히면 어떻게 될까?",
  "text": "if player hits rock 은 닿았을 때 실행돼요. lives 3 으로 목숨을 정하고, 닿으면 바위를 터뜨리고 목숨을 하나 깎아요. 목숨이 0이 되면 게임 오버예요.",
  "code": "title \"My First Game\"\nbackground space\nlives 3\n\nplayer = make ship at center bottom\n  control arrows\n  speed 420\n\nevery 0.8 sec\n  make rock from top\n    move down random(150, 320)\n    spin random(-90, 90)\n\nif player hits rock\n  rock.explode\n  remove 1 from lives\n"
 },
 {
  "title": "점수와 글자",
  "text": "add 1 to score 로 점수를 올려요. label 안에 {변수}를 쓰면 값이 실시간으로 바뀌어 보여요.",
  "code": "title \"My First Game\"\nbackground space\nlives 3\nset coins to 0\n\nplayer = make ship at center bottom\n  control arrows\n  speed 420\n\nevery 0.8 sec\n  make rock from top\n    move down random(150, 320)\n    spin random(-90, 90)\n\nevery 3 sec\n  make coin from top\n    move down 150\n\nif player hits rock\n  rock.explode\n  remove 1 from lives\n\nif player hits coin\n  coin.sparkle\n  add 10 to score\n  add 1 to coins\n\nlabel \"Coins: {coins}\" at left 110\n"
 },
 {
  "title": "점점 어려워지게",
  "text": "level up 으로 레벨을 올리고, level 값을 속도에 더하면 갈수록 빨라져요. 12초마다 레벨이 올라가요.",
  "code": "title \"My First Game\"\nbackground space\nlives 3\nmusic chill\n\nplayer = make ship at center bottom\n  control arrows\n  speed 420\n\nevery 0.7 sec\n  make rock from top\n    move down random(150, 320) + level * 30\n    spin random(-90, 90)\n\nevery 12 sec\n  level up\n\nif player hits rock\n  rock.explode\n  remove 1 from lives\n"
 },
 {
  "title": "총 쏘기",
  "text": "if key space 는 스페이스를 눌렀을 때예요. make bullet at player 로 내 위치에서 총알을 만들어 위로 보내요. 총알이 바위에 닿으면 둘 다 없애고 점수를 줘요.",
  "code": "title \"My First Game\"\nbackground night\nlives 3\n\nplayer = make ship at center bottom\n  control arrows\n  speed 420\n\nevery 0.7 sec\n  make rock from top\n    move down random(150, 320)\n    spin random(-90, 90)\n\nif key space\n  make bullet at player\n    move up 700\n\nif bullet hits rock\n  rock.explode\n  bullet.remove\n  add 10 to score\n\nif player hits rock\n  rock.explode\n  remove 1 from lives\n"
 },
 {
  "title": "보스 만들기",
  "text": "health 로 체력을 주고, hurt 로 깎아요. patrol 은 좌우로 왕복해요. 체력 막대는 자동으로 나와요. 체력이 0이 되면 알아서 터져요.",
  "code": "title \"My First Game\"\nbackground grid\nlives 3\nmusic action\n\nplayer = make ship at center bottom\n  control arrows\n  speed 440\n\nboss = make ghost at center 130\n  size 120\n  health 15\n  patrol 300 120\n\nlabel \"BOSS {boss.hp}\" at center top\n\nif key space\n  make bullet at player\n    move up 800\n\nif bullet hits boss\n  bullet.remove\n  boss.hurt 1\n  burst 6 cyan at bullet\n\nevery 1.2 sec\n  make bomb at boss\n    toward player 220\n\nif player hits bomb\n  bomb.explode\n  remove 1 from lives\n\nif boss.hp <= 0\n  banner \"YOU WIN!\"\n  confetti\n  win\n"
 },
 {
  "title": "내 그림과 내 지도",
  "text": "art 아래에 글자로 그림을 그리면 나만의 모양이 생겨요. (# 는 기본 색, r o y g b p 는 색깔) map 은 글자로 지도를 그려요. (# 땅, C 코인, P 플레이어, F 깃발, ^ 가시) 직접 바꿔 보세요!",
  "code": "title \"My Map\"\nbackground sunset\nlives 3\nmusic happy\n\nart cat orange\n  ##.....##\n  ###...###\n  #########\n  ##k###k##\n  #########\n  ####m####\n  .#######.\n\nmap\n  ....................\n  ....................\n  ..................F.\n  ................####\n  .............G......\n  ...........###......\n  .....C..............\n  ....###.......C.....\n  .P......^.....^..S..\n  ####################\n  ####################\n\nmake cat at 700 100\n  wander 80\n  gravity 1900\n\nif player hits spike\n  remove 1 from lives\n  player.x = 70\n  player.y = 380\n  player.vy = 0\n\nif player hits coin\n  coin.sparkle\n  add 10 to score\n\nif player hits gem\n  gem.sparkle\n  add 50 to score\n\nif player hits flag\n  banner \"GOAL!\"\n  confetti\n  win\n"
 }
];
