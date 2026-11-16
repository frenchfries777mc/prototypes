shader_type spatial;
render_mode diffuse_lambert, specular_disabled, cull_disabled;
// 풀 덤불: 정점 색 알파 = 끝으로 갈수록 1. 바람에 흔들리고 뿌리는 어둡게(가짜 AO).
uniform float wind = 0.22;
varying float hh;

void vertex() {
	hh = COLOR.a;
	vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float t = TIME * 1.5;
	float gust = sin(wp.x * 0.07 + t * 0.6) * 0.5 + 0.5;
	float sway = sin(wp.x * 0.45 + t) * 0.6 + sin(wp.z * 0.6 + t * 1.3) * 0.4;
	float k = hh * hh;
	VERTEX.x += sway * wind * k * (0.5 + gust);
	VERTEX.z += cos(wp.x * 0.5 + t * 0.9) * wind * 0.6 * k * (0.5 + gust);
}

void fragment() {
	ALBEDO = COLOR.rgb;
	ROUGHNESS = 1.0;
	// 역광에서 잎이 비쳐 보이는 느낌
	BACKLIGHT = vec3(0.30, 0.34, 0.10) * hh;
}
