shader_type spatial;
render_mode diffuse_burley, specular_schlick_ggx;
// 소품: 정점 색의 알파로 재질 종류를 고른다. 0 석조(벽돌) 1 모래주머니 2 나무 상자 3 목재 4 나무줄기 5 천/기타

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

void fragment() {
	float kind = floor(vcol.a * 16.0 + 0.5);
	vec3 base = vcol.rgb;
	vec3 an = abs(wnrm);
	vec2 q = an.y > 0.75 ? wpos.xz : (an.x > an.z ? wpos.zy : wpos.xy);
	vec3 col = base;
	float rough = 0.9;
	float grime = fbm(wpos.xz * 0.9 + wpos.y * 0.7);

	if (kind < 0.5) {
		// 벽돌: 줄눈과 벽돌마다 다른 색
		float rowh = 0.2;
		float r = floor(q.y / rowh);
		float off = mod(r, 2.0) * 0.2;
		vec2 b = vec2((q.x + off) / 0.4, q.y / rowh);
		vec2 cell = floor(b);
		vec2 f = fract(b);
		float mortar = step(f.x, 0.05) + step(f.y, 0.09);
		mortar = clamp(mortar, 0.0, 1.0);
		float v = h21(cell + floor(wpos.y * 0.0));
		col = base * (0.78 + 0.4 * v);
		col = mix(col, vec3(0.42, 0.40, 0.36), mortar * 0.8);
		col *= 0.65 + 0.5 * grime;
		// 아래쪽이 그을리고 젖어 어두움
		col *= 0.8 + 0.2 * clamp((wpos.y + 0.5) * 0.5, 0.0, 1.0);
		// 총탄 자국
		float sc = step(0.985, h21(floor(q * 6.0)));
		col *= 1.0 - sc * 0.5;
		rough = 0.95;
	} else if (kind < 1.5) {
		// 모래주머니: 올이 보이는 거친 천
		float weave = 0.5 + 0.5 * sin(q.x * 90.0) * sin(q.y * 90.0);
		col = base * (0.8 + 0.3 * grime) * (0.9 + 0.12 * weave);
		rough = 1.0;
	} else if (kind < 2.5) {
		// 나무 상자: 세로 판자
		float pl = fract(q.x / 0.18);
		float gap = step(pl, 0.05);
		float grain = vnoise(vec2(q.x * 20.0, q.y * 2.0));
		col = base * (0.7 + 0.5 * grain) * (1.0 - gap * 0.45);
		float edge = max(step(fract(q.y / 0.9), 0.07), step(0.93, fract(q.y / 0.9)));
		col = mix(col, base * 0.55, edge * 0.5);
		col *= 0.75 + 0.35 * grime;
		rough = 0.8;
	} else if (kind < 3.5) {
		// 목재 판자
		float pl = fract(q.x / 0.22);
		float gap = step(pl, 0.04);
		float grain = vnoise(vec2(q.x * 6.0, q.y * 28.0));
		col = base * (0.65 + 0.6 * grain) * (1.0 - gap * 0.55);
		col *= 0.7 + 0.4 * grime;
		rough = 0.85;
	} else if (kind < 4.5) {
		// 나무 줄기: 세로 갈라진 껍질
		float bark = vnoise(vec2(wpos.x * 18.0 + wpos.z * 18.0, wpos.y * 3.0));
		col = base * (0.55 + 0.7 * bark);
		rough = 0.95;
	} else if (kind > 7.5 && kind < 8.5) {
		// 회반죽 벽: 벗겨진 곳엔 벽돌이 드러난다
		float m = fbm(q * 1.5 + 3.0);
		float flake = smoothstep(0.50, 0.60, m + (grime - 0.5) * 0.4);
		float rowh2 = 0.2;
		float r2 = floor(q.y / rowh2);
		vec2 b2 = vec2((q.x + mod(r2, 2.0) * 0.2) / 0.4, q.y / rowh2);
		vec2 f2 = fract(b2);
		float mort2 = clamp(step(f2.x, 0.05) + step(f2.y, 0.09), 0.0, 1.0);
		vec3 brickc = vec3(0.36, 0.17, 0.12) * (0.75 + 0.5 * h21(floor(b2)));
		brickc = mix(brickc, vec3(0.5, 0.47, 0.42), mort2 * 0.8);
		vec3 plaster = base * (0.8 + 0.3 * vnoise(q * 9.0)) * (0.7 + 0.45 * grime);
		col = mix(plaster, brickc, flake);
		col *= 0.78 + 0.22 * clamp((wpos.y + 1.0) * 0.6, 0.0, 1.0);
		rough = 0.95;
	} else if (kind > 11.5 && kind < 12.5) {
		// 바위: 덩어리진 노이즈 + 이끼 + 풍화된 줄무늬
		float rn = fbm(wpos.xz * 2.2 + wpos.y * 2.7);
		float rn2 = vnoise(wpos.xz * 9.0 + wpos.y * 7.0);
		col = base * (0.55 + 0.85 * rn) * (0.88 + 0.24 * rn2);
		float moss = smoothstep(0.55, 0.9, wnrm.y) * smoothstep(0.35, 0.7, rn);
		col = mix(col, vec3(0.16, 0.22, 0.08), moss * 0.55);
		rough = 0.95;
	} else if (kind > 8.5 && kind < 9.5) {
		// 기와
		vec2 uv = vec2(wpos.x / 0.26, wpos.z / 0.34);
		float rw = floor(uv.y);
		uv.x += mod(rw, 2.0) * 0.5;
		vec2 ft = fract(uv);
		float edge = smoothstep(0.0, 0.14, ft.x) * smoothstep(1.0, 0.86, ft.x) * smoothstep(0.0, 0.2, ft.y);
		float tv = h21(floor(uv));
		col = base * (0.7 + 0.55 * tv) * (0.62 + 0.38 * edge) * (0.8 + 0.3 * grime);
		rough = 0.85;
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
	// 바닥 근처 흙먼지
	col = mix(col, vec3(0.30, 0.24, 0.17), clamp(0.5 - wpos.y * 0.15, 0.0, 0.0));
	ALBEDO = col;
	ROUGHNESS = rough;
}
