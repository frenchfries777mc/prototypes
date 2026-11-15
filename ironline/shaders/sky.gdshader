shader_type sky;
// 전장 위의 하늘: 지평선 연무, 두 겹의 구름, 먼 산 능선, 태양 글레어
uniform vec3 top_col : source_color = vec3(0.20, 0.36, 0.60);
uniform vec3 mid_col : source_color = vec3(0.58, 0.67, 0.76);
uniform vec3 horizon_col : source_color = vec3(0.74, 0.72, 0.66);
uniform vec3 ground_col : source_color = vec3(0.40, 0.38, 0.34);
uniform float cloud_cover = 0.6;

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
float ridge(float x, float seed) {
	float a = 0.0;
	float amp = 0.55;
	float f = 1.0;
	for (int i = 0; i < 5; i++) {
		a += amp * (1.0 - abs(vnoise(vec2(x * f, seed + float(i) * 7.0)) * 2.0 - 1.0));
		f *= 2.1;
		amp *= 0.5;
	}
	return a;
}

void sky() {
	vec3 d = EYEDIR;
	float y = d.y;
	vec3 sun_dir = LIGHT0_DIRECTION;
	float sd = max(dot(d, sun_dir), 0.0);
	vec3 col;
	if (y >= 0.0) {
		float t = pow(1.0 - clamp(y, 0.0, 1.0), 2.4);
		col = mix(top_col, mid_col, smoothstep(0.0, 0.55, t));
		col = mix(col, horizon_col, smoothstep(0.5, 1.0, t));
		// 태양 쪽 하늘이 따뜻하게 번짐
		col += LIGHT0_COLOR * pow(sd, 6.0) * 0.18 * smoothstep(0.0, 0.5, 1.0 - y);
		// 구름: 높은 층(느림) + 낮은 층(빠름)
		vec2 uv1 = d.xz / (y + 0.20) * 0.5 + vec2(TIME * 0.003, 0.0);
		vec2 uv2 = d.xz / (y + 0.12) * 0.9 + vec2(TIME * 0.007, TIME * 0.002) + 31.0;
		float c1 = fbm(uv1 * 1.2);
		float c2 = fbm(uv2 * 1.3);
		float dens1 = smoothstep(1.0 - cloud_cover, 1.0 - cloud_cover + 0.32, c1);
		float dens2 = smoothstep(0.95 - cloud_cover, 1.0 - cloud_cover + 0.4, c2) * 0.7;
		// 태양 방향으로 밝게(가장자리 림), 반대편은 회색
		float sunward = clamp(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(sun_dir.x, 0.0, sun_dir.z))) * 0.5 + 0.5, 0.0, 1.0);
		vec3 cl_lit = mix(vec3(0.62, 0.64, 0.68), vec3(1.0, 0.96, 0.88), smoothstep(0.35, 0.8, c1) * (0.5 + 0.5 * sunward));
		vec3 cl_low = mix(vec3(0.46, 0.48, 0.52), vec3(0.9, 0.86, 0.8), smoothstep(0.35, 0.8, c2) * (0.4 + 0.6 * sunward));
		float horizon_fade = smoothstep(0.0, 0.16, y);
		col = mix(col, cl_lit, dens1 * horizon_fade * 0.92);
		col = mix(col, cl_low, dens2 * horizon_fade * 0.8);
		// 먼 산 능선 (대기 원근법으로 흐리게)
		float az = atan(d.z, d.x);
		float hf = 0.012 + 0.075 * ridge(az * 1.1 + 3.0, 2.0);
		float hn = 0.003 + 0.04 * ridge(az * 2.2 + 11.0, 9.0);
		vec3 far_c = mix(horizon_col, vec3(0.42, 0.50, 0.60), 0.55);
		vec3 near_c = mix(horizon_col, vec3(0.28, 0.34, 0.38), 0.7);
		col = mix(col, far_c, smoothstep(hf, hf - 0.004, y) * 0.95);
		col = mix(col, near_c, smoothstep(hn, hn - 0.003, y) * 0.95);
		// 해: 원반 + 코로나 + 넓은 글레어
		float disc = smoothstep(0.9993, 0.9998, sd);
		float shade = (1.0 - (dens1 * 0.8 + dens2 * 0.5) * horizon_fade);
		col += LIGHT0_COLOR * (disc * 6.0 + pow(sd, 700.0) * 3.0 + pow(sd, 30.0) * 0.35 + pow(sd, 4.0) * 0.1) * shade;
	} else {
		col = mix(horizon_col * 0.92, ground_col, smoothstep(0.0, -0.3, y));
	}
	COLOR = col;
}
