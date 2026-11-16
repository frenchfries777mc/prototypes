shader_type canvas_item;
// 후처리: 색수차·색보정·블룸·햇살 빛줄기(god rays)·샤프닝·비네트·그레인·피격 효과
uniform sampler2D screen_tex : hint_screen_texture, filter_linear;
uniform float hurt = 0.0;
uniform float low_hp = 0.0;
uniform float vignette = 0.30;
uniform float grain = 0.022;
uniform float bloom = 0.55;
uniform vec2 sun_uv = vec2(0.5, 0.2);
uniform float sun_vis = 0.0;
uniform float fx_level = 2.0;
uniform vec2 cam_motion = vec2(0.0);

float h21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

void fragment() {
	vec2 uv = SCREEN_UV;
	vec2 px = vec2(1.0) / vec2(textureSize(screen_tex, 0));
	vec2 dir = uv - 0.5;
	vec3 c0 = texture(screen_tex, uv).rgb;
	if (fx_level > 1.5 && dot(cam_motion, cam_motion) > 1e-8) {
		// 카메라 회전 방향으로 아주 약한 모션 블러
		vec3 acc = c0;
		for (int i = 1; i <= 4; i++) {
			acc += texture(screen_tex, uv - cam_motion * (float(i) * 0.25)).rgb;
		}
		c0 = acc / 5.0;
	}
	vec3 c = c0;
	if (fx_level > 0.5) {
		// 가장자리 색수차
		float ca = dot(dir, dir) * 0.007;
		c = vec3(texture(screen_tex, uv + dir * ca).r, c0.g, texture(screen_tex, uv - dir * ca).b);
		// 샤프닝(언샤프 마스크)
		vec3 blur = (texture(screen_tex, uv + vec2(px.x, 0.0)).rgb + texture(screen_tex, uv - vec2(px.x, 0.0)).rgb
			+ texture(screen_tex, uv + vec2(0.0, px.y)).rgb + texture(screen_tex, uv - vec2(0.0, px.y)).rgb) * 0.25;
		c += (c0 - blur) * 0.45;
		// 블룸: 두 반경의 고리 샘플
		vec3 glow = vec3(0.0);
		for (int i = 0; i < 8; i++) {
			float a = float(i) * 0.785398;
			vec2 d = vec2(cos(a), sin(a));
			glow += max(texture(screen_tex, uv + d * px * 7.0).rgb - 0.66, vec3(0.0));
			glow += max(texture(screen_tex, uv + d * px * 18.0).rgb - 0.58, vec3(0.0)) * 0.8;
		}
		c += glow * (bloom * 0.14);
	}
	if (fx_level > 1.5 && sun_vis > 0.01) {
		// 태양 방향 방사형 블러로 햇살 빛줄기
		vec2 delta = (sun_uv - uv) / 18.0 * 0.85;
		vec2 p = uv;
		float illum = 1.0;
		vec3 rays = vec3(0.0);
		for (int i = 0; i < 18; i++) {
			p += delta;
			vec3 s = texture(screen_tex, p).rgb;
			float m = smoothstep(0.80, 1.05, dot(s, vec3(0.3, 0.59, 0.11)));
			rays += s * m * illum;
			illum *= 0.94;
		}
		c += rays * 0.055 * sun_vis * vec3(1.0, 0.93, 0.8);
	}
	if (fx_level > 1.5 && sun_vis > 0.05) {
		// 렌즈 플레어: 해와 화면 중심을 잇는 선 위의 고스트 고리들
		vec2 axis = vec2(0.5) - sun_uv;
		vec3 fl = vec3(0.0);
		for (int i = 0; i < 4; i++) {
			float k = 0.35 + float(i) * 0.5;
			vec2 gp = sun_uv + axis * k;
			float r = 0.045 + 0.02 * float(i);
			float d = length((uv - gp) * vec2(1.0, 0.56));
			float ring = smoothstep(r, r - 0.012, d) - smoothstep(r - 0.012, r - 0.03, d);
			fl += ring * mix(vec3(1.0, 0.7, 0.4), vec3(0.5, 0.7, 1.0), float(i) / 3.0) * (0.07 - 0.012 * float(i));
		}
		c += fl * sun_vis;
	}
	// 색보정: 따뜻한 그림자 / 차가운 하이라이트 + 채도 + 가벼운 S커브
	float l = dot(c, vec3(0.299, 0.587, 0.114));
	c = mix(vec3(l), c, 1.04);
	// 그늘은 청록 쪽, 밝은 곳은 호박색 쪽으로 (영화풍 분리 톤)
	c = mix(c * vec3(0.90, 1.0, 1.08), c * vec3(1.06, 1.0, 0.92), smoothstep(0.12, 0.75, l));
	c = mix(c, c * c * (3.0 - 2.0 * c), 0.28);
	float v = smoothstep(0.85, 0.2, length(dir * vec2(1.0, 0.85)));
	c *= mix(1.0 - vignette, 1.0, v);
	float edge = smoothstep(0.25, 0.75, length(dir * vec2(1.15, 1.0)));
	c = mix(c, vec3(0.65, 0.03, 0.02), edge * (hurt * 0.7 + low_hp * 0.35));
	c = mix(c, vec3(l) * 0.8, low_hp * 0.35);
	c += (h21(uv * 900.0 + TIME) - 0.5) * grain;
	COLOR = vec4(c, 1.0);
}
