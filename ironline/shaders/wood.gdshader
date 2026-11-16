shader_type spatial;
render_mode diffuse_burley, specular_schlick_ggx;
// 총기 목재: 길이 방향 나뭇결 + 니스 광택
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
	float across = lp.x * 110.0 + lp.y * 140.0;
	float warp = vnoise(vec2(lp.z * 9.0, across * 0.05)) * 6.0;
	float grain = vnoise(vec2(lp.z * 5.0, across + warp));
	float fine = vnoise(vec2(lp.z * 60.0, across * 4.0));
	float streak = smoothstep(0.55, 0.75, vnoise(vec2(lp.z * 2.5, across * 0.6 + warp)));
	vec3 col = COLOR.rgb * (0.62 + 0.75 * grain) * (0.9 + 0.2 * fine);
	col = mix(col, COLOR.rgb * 0.45, streak * 0.55);
	ALBEDO = col;
	ROUGHNESS = 0.38 + 0.25 * grain;
	SPECULAR = 0.55;
	RIM = 0.15;
	RIM_TINT = 0.6;
}
