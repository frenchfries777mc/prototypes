shader_type sky;
// 전장 위의 흐린 하늘: 지평선 연무 + 구름 + 해
uniform vec3 top_col : source_color = vec3(0.26, 0.40, 0.60);
uniform vec3 mid_col : source_color = vec3(0.62, 0.68, 0.74);
uniform vec3 horizon_col : source_color = vec3(0.84, 0.78, 0.68);
uniform vec3 ground_col : source_color = vec3(0.42, 0.40, 0.35);
uniform float cloud_cover = 0.55;

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
	for (int i = 0; i < 5; i++) {
		s += a * vnoise(p);
		p = p * 2.02 + 5.3;
		a *= 0.5;
	}
	return s;
}

void sky() {
	vec3 d = EYEDIR;
	float y = d.y;
	vec3 col;
	if (y >= 0.0) {
		float t = pow(1.0 - clamp(y, 0.0, 1.0), 2.2);
		col = mix(top_col, mid_col, smoothstep(0.0, 0.55, t));
		col = mix(col, horizon_col, smoothstep(0.55, 1.0, t));
		// 구름 층
		vec2 uv = d.xz / (y + 0.22) * 0.55 + TIME * 0.004;
		float c = fbm(uv * 1.3);
		float dens = smoothstep(1.0 - cloud_cover, 1.0 - cloud_cover + 0.35, c);
		vec3 cloud = mix(vec3(0.55, 0.57, 0.60), vec3(0.95, 0.93, 0.88), smoothstep(0.35, 0.8, c));
		col = mix(col, cloud, dens * smoothstep(0.0, 0.18, y) * 0.9);
		// 해
		vec3 sun_dir = LIGHT0_DIRECTION;
		float sd = max(dot(d, sun_dir), 0.0);
		col += LIGHT0_COLOR * (pow(sd, 700.0) * 4.0 + pow(sd, 18.0) * 0.28 + pow(sd, 3.0) * 0.08) * (1.0 - dens * 0.85);
	} else {
		col = mix(horizon_col * 0.9, ground_col, smoothstep(0.0, -0.25, y));
	}
	COLOR = col;
}
