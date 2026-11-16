shader_type spatial;
render_mode diffuse_burley, specular_schlick_ggx;
// 병사 천/가죽: 올 무늬, 아래로 갈수록 진흙, 가장자리 림 라이트
uniform float dirt_amount = 1.0;
varying vec3 lp;

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

void vertex() {
	lp = VERTEX;
}

void fragment() {
	vec3 base = COLOR.rgb;
	float weave = 0.5 + 0.5 * sin(lp.x * 190.0 + lp.z * 31.0) * sin(lp.y * 190.0);
	float n = vnoise(lp.xy * 38.0 + lp.z * 21.0);
	float n2 = vnoise(lp.xz * 9.0 + lp.y * 6.0);
	float dirt = smoothstep(0.6, 0.0, lp.y) * dirt_amount;
	vec3 col = base * (0.86 + 0.24 * n) * (0.96 + 0.06 * weave);
	col *= 0.9 + 0.2 * n2;
	col = mix(col, vec3(0.12, 0.09, 0.06), dirt * (0.35 + 0.45 * n));
	ALBEDO = col;
	ROUGHNESS = 0.88;
	RIM = 0.12 * (0.35 + 0.65 * dirt_amount);
	RIM_TINT = 0.55;
	SPECULAR = 0.2;
}
