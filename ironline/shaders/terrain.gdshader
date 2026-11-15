shader_type spatial;
render_mode diffuse_burley, specular_disabled;
// 지형: 고도·경사·노이즈로 풀/마른 풀/흙/진흙/바위를 섞는다. 텍스처 없이 셰이더 노이즈만 쓴다.

uniform vec3 grass_a : source_color = vec3(0.24, 0.31, 0.12);
uniform vec3 grass_b : source_color = vec3(0.40, 0.42, 0.18);
uniform vec3 dry     : source_color = vec3(0.50, 0.44, 0.26);
uniform vec3 dirt    : source_color = vec3(0.27, 0.21, 0.15);
uniform vec3 mud     : source_color = vec3(0.17, 0.13, 0.10);
uniform vec3 rock    : source_color = vec3(0.34, 0.32, 0.29);
uniform vec2 points[5];

varying vec3 wpos;
varying vec3 wnrm;
varying float ao;

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
	for (int i = 0; i < 4; i++) {
		s += a * vnoise(p);
		p = p * 2.03 + 17.0;
		a *= 0.5;
	}
	return s;
}

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wnrm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	ao = COLOR.r;
}

void fragment() {
	vec2 p = wpos.xz;
	float n1 = fbm(p * 0.045);
	float n2 = fbm(p * 0.22 + 7.0);
	float n3 = vnoise(p * 1.7);
	float n4 = vnoise(p * 6.0);
	float slope = 1.0 - clamp(wnrm.y, 0.0, 1.0);

	vec3 col = mix(grass_a, grass_b, smoothstep(0.25, 0.75, n1 * 0.7 + n2 * 0.5));
	col = mix(col, dry, smoothstep(0.55, 0.85, n2 * 0.6 + n1 * 0.4) * 0.8);
	// 풀 결 느낌의 미세 변화
	col *= 0.82 + 0.36 * n3;
	col *= 0.92 + 0.16 * n4;

	// 거점 주변은 밟혀서 흙이 드러남
	float pd = 1e9;
	for (int i = 0; i < 5; i++) {
		pd = min(pd, length(p - points[i]));
	}
	float trod = 1.0 - smoothstep(6.0, 15.0, pd + (n2 - 0.5) * 9.0);
	col = mix(col, dirt * (0.8 + 0.5 * n3), trod * 0.8);

	// 참호·포탄 구덩이 바닥은 진흙
	float low = smoothstep(-0.2, -1.5, wpos.y);
	col = mix(col, mud * (0.7 + 0.6 * n3), low * 0.9);
	col = mix(col, dirt, smoothstep(0.1, 0.45, slope) * 0.6);
	col = mix(col, rock * (0.7 + 0.6 * n4), smoothstep(0.5, 0.8, slope));

	ALBEDO = col * ao;
	ROUGHNESS = 0.95;
	// 가짜 요철: 노이즈 기울기로 법선을 살짝 흔든다
	vec3 bump = vec3(n3 - 0.5, 0.0, n4 - 0.5) * 0.35;
	NORMAL = normalize(NORMAL + (VIEW_MATRIX * vec4(bump, 0.0)).xyz);
}
