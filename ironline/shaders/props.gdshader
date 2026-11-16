shader_type spatial;
render_mode diffuse_burley, specular_schlick_ggx;
// 소품: 정점 색의 알파로 재질 종류를 고른다 (알파 = 종류/16).
//  0 벽돌  1 모래주머니  2 나무 상자  3 목재  4 나무줄기  5 천/기타  7 나뭇잎  8 회반죽+벽돌  9 기와  12 바위
// 벽돌·회반죽·기와·목재·껍질·바위는 Poly Haven CC0 PBR 텍스처(색 + 법선)를 쓴다.

uniform sampler2D brick_d : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D brick_n : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D plaster_d : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D plaster_n : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D roof_d : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D roof_n : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D plank_d : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D plank_n : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D bark_d : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D bark_n : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D rock_d : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D rock_n : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;

varying vec3 wpos;
varying vec3 wnrm;
varying vec4 vcol;

float h21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}
float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
	float a = 0.5;
	float s = 0.0;
	for (int i = 0; i < 3; i++) {
		s += a * vnoise(p);
		p = p * 2.07 + 11.0;
		a *= 0.5;
	}
	return s;
}

void vertex() {
	// 나뭇잎 뭉치는 울퉁불퉁하게 부풀리고 바람에 살짝 흔든다
	float kv = floor(COLOR.a * 16.0 + 0.5);
	if (kv > 6.5 && kv < 7.5) {
		vec3 wp0 = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
		float bn = vnoise(wp0.xz * 1.1 + wp0.y * 0.9);
		float bn2 = vnoise(wp0.xz * 3.1 - wp0.y * 2.3);
		VERTEX += NORMAL * ((bn - 0.5) * 0.8 + (bn2 - 0.5) * 0.3);
		VERTEX.x += sin(TIME * 0.9 + wp0.x * 0.25 + wp0.y * 0.6) * 0.06;
	}
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wnrm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	vcol = COLOR;
}

// 텍스처 법선(탄젠트 xy)을 면의 평면 좌표계에서 월드 방향으로 바꿔 NORMAL 에 더한다.
vec3 tex_bump(vec2 nxy, vec3 an) {
	vec3 nw;
	if (an.y > 0.75) {
		nw = vec3(nxy.x, 0.0, nxy.y);
	} else if (an.x > an.z) {
		nw = vec3(0.0, nxy.y, nxy.x);
	} else {
		nw = vec3(nxy.x, nxy.y, 0.0);
	}
	return nw;
}

void fragment() {
	float kind = floor(vcol.a * 16.0 + 0.5);
	vec3 base = vcol.rgb;
	vec3 an = abs(wnrm);
	vec2 q = an.y > 0.75 ? wpos.xz : (an.x > an.z ? wpos.zy : wpos.xy);
	vec3 col = base;
	float rough = 0.9;
	float grime = fbm(wpos.xz * 0.9 + wpos.y * 0.7);
	vec2 bump = vec2(0.0);
	float bump_k = 0.0;

	if (kind < 0.5) {
		// 벽돌 (실사 텍스처)
		vec2 uv = q * 0.85;
		vec3 t = texture(brick_d, uv).rgb;
		col = t * (0.55 + 0.75 * grime) * mix(vec3(1.0), base * 2.3, 0.35);
		col *= 0.82 + 0.2 * clamp((wpos.y + 0.5) * 0.5, 0.0, 1.0);
		bump = texture(brick_n, uv).xy * 2.0 - 1.0;
		bump_k = 0.9;
		rough = 0.92;
	} else if (kind < 1.5) {
		// 모래주머니: 올이 보이는 거친 천
		float weave = 0.5 + 0.5 * sin(q.x * 90.0) * sin(q.y * 90.0);
		col = base * (0.8 + 0.3 * grime) * (0.9 + 0.12 * weave);
		rough = 1.0;
	} else if (kind < 2.5) {
		// 나무 상자(대체 모델이 없을 때): 세로 판자
		float pl = fract(q.x / 0.18);
		float gap = step(pl, 0.05);
		float grain = vnoise(vec2(q.x * 20.0, q.y * 2.0));
		col = base * (0.7 + 0.5 * grain) * (1.0 - gap * 0.45);
		col *= 0.75 + 0.35 * grime;
		rough = 0.8;
	} else if (kind < 3.5) {
		// 목재 판자 (실사 텍스처)
		vec2 uv = q * vec2(0.55, 0.55);
		vec3 t = texture(plank_d, uv).rgb;
		col = t * (0.7 + 0.6 * grime) * mix(vec3(1.0), base * 3.2, 0.3);
		bump = texture(plank_n, uv).xy * 2.0 - 1.0;
		bump_k = 0.7;
		rough = 0.82;
	} else if (kind < 4.5) {
		// 나무 줄기/껍질 (실사 텍스처, 세로 방향)
		vec2 uv = vec2((wpos.x + wpos.z) * 0.9, wpos.y * 0.45);
		vec3 t = texture(bark_d, uv).rgb;
		col = t * mix(vec3(1.0), base * 4.5, 0.3);
		bump = texture(bark_n, uv).xy * 2.0 - 1.0;
		bump_k = 1.0;
		rough = 0.95;
	} else if (kind > 7.5 && kind < 8.5) {
		// 회반죽 벽: 벗겨진 곳엔 벽돌이 드러난다 (둘 다 실사 텍스처)
		float m = fbm(q * 1.5 + 3.0);
		float flake = smoothstep(0.50, 0.60, m + (grime - 0.5) * 0.4);
		vec3 pl = texture(plaster_d, q * 0.55).rgb * mix(vec3(1.0), base * 1.7, 0.5) * (0.75 + 0.5 * grime);
		vec3 br = texture(brick_d, q * 0.85).rgb * (0.55 + 0.75 * grime);
		col = mix(pl, br, flake);
		col *= 0.8 + 0.2 * clamp((wpos.y + 1.0) * 0.6, 0.0, 1.0);
		vec2 np = texture(plaster_n, q * 0.55).xy * 2.0 - 1.0;
		vec2 nb = texture(brick_n, q * 0.85).xy * 2.0 - 1.0;
		bump = mix(np, nb, flake);
		bump_k = mix(0.5, 0.9, flake);
		rough = 0.95;
	} else if (kind > 8.5 && kind < 9.5) {
		// 기와 (실사 텍스처): 경사면은 위에서 본 평면 좌표로 입힌다
		vec2 uv = vec2(wpos.x * 0.7, wpos.z * 0.7);
		vec3 t = texture(roof_d, uv).rgb;
		col = t * (0.7 + 0.5 * grime) * mix(vec3(1.0), base * 2.6, 0.25);
		bump = texture(roof_n, uv).xy * 2.0 - 1.0;
		bump_k = 0.9;
		rough = 0.85;
	} else if (kind > 11.5 && kind < 12.5) {
		// 바위 (실사 텍스처) + 위쪽 면에 이끼
		vec3 t = texture(rock_d, q * 0.9).rgb;
		col = t * mix(vec3(1.0), base * 3.2, 0.3) * (0.7 + 0.5 * grime);
		bump = texture(rock_n, q * 0.9).xy * 2.0 - 1.0;
		bump_k = 1.0;
		float moss = smoothstep(0.55, 0.9, wnrm.y) * smoothstep(0.35, 0.7, grime);
		col = mix(col, vec3(0.14, 0.2, 0.07), moss * 0.5);
		rough = 0.95;
	} else if (kind > 6.5 && kind < 7.5) {
		// 나뭇잎 뭉치: 덩어리 노이즈로 명암, 아래쪽은 그늘
		float lf = vnoise(wpos.xz * 2.4 + wpos.y * 1.9);
		float lf2 = vnoise(wpos.xz * 7.0 - wpos.y * 5.0);
		col = base * (0.55 + 0.75 * lf) * (0.85 + 0.3 * lf2);
		rough = 0.9;
	} else {
		float weave = 0.5 + 0.5 * sin(q.x * 70.0) * sin(q.y * 70.0);
		col = base * (0.88 + 0.2 * grime) * (0.94 + 0.1 * weave);
		rough = 0.85;
	}
	ALBEDO = col;
	ROUGHNESS = rough;
	if (bump_k > 0.0) {
		float near = 1.0 - smoothstep(25.0, 90.0, length(VERTEX));
		NORMAL = normalize(NORMAL + (VIEW_MATRIX * vec4(tex_bump(bump, an), 0.0)).xyz * bump_k * (0.25 + 0.75 * near));
	}
}
