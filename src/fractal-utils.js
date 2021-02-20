function makeVertices(sides) {
	const vertices = new Float32Array(sides * 2);
	for (let i = 0; i < sides; ++i) {
		const angle = Math.PI * 2 * i / sides;
		const cc = Math.cos(angle);
		const ss = Math.sin(angle);
		vertices[i * 2    ] = ss;
		vertices[i * 2 + 1] = -cc;
	}
	return vertices;
}

function makeProjections(sides, scale) {
	const projections = new Float32Array(sides * 4);
	for (let i = 0; i < sides; ++i) {
		const angle = Math.PI * 2 * i / sides;
		const cc = Math.cos(angle);
		const ss = Math.sin(angle);
		projections[i * 4    ] = cc * scale;
		projections[i * 4 + 1] = -ss * scale;
		projections[i * 4 + 2] = ss * scale;
		projections[i * 4 + 3] = cc * scale;
	}
	return projections;
}

function makeAgents(maxAgents, vertices, fraction) {
	const points = vertices.length / 2;
	const ifraction = 1.0 - fraction;
	let agents = new Float32Array(2);
	agents[0] = vertices[0];
	agents[1] = vertices[1];
	if (points <= 2) {
		return agents;
	}
	let count = 1;
	if ((points & 1) && (points - 1) / 2 < maxAgents) {
		// for an odd number of agents, begin by only moving towards one half (symmetry)
		const next = new Float32Array(points - 1);
		const x = agents[0];
		const y = agents[1];
		for (let i = 2; i < points; i += 2) {
			next[i - 2] = x * ifraction + vertices[i    ] * fraction;
			next[i - 1] = y * ifraction + vertices[i + 1] * fraction;
		}
		agents = next;
		count = (points - 1) / 2;
	}
	while (count * points < maxAgents) {
		const next = new Float32Array(count * points * 2);
		for (let a = 0; a < count; ++ a) {
			const x = agents[a * 2    ];
			const y = agents[a * 2 + 1];
			for (let i = 0; i < points; ++i) {
				const p = (a * points + i) * 2;
				next[p    ] = x * ifraction + vertices[i * 2    ] * fraction;
				next[p + 1] = y * ifraction + vertices[i * 2 + 1] * fraction;
			}
		}
		agents = next;
		count *= points;
	}
	return agents;
}

function makeScale(sampleCount, powR, powG, powB) {
	const scale = new Uint32Array(sampleCount);
	const scaleRGBA = new Uint8ClampedArray(scale.buffer);
	for (let i = 0; i < sampleCount - 1; ++ i) {
		const v = i / (sampleCount - 2);
		scaleRGBA[i * 4    ] = (1 - Math.pow(v, powR)) * 256;
		scaleRGBA[i * 4 + 1] = (1 - Math.pow(v, powG)) * 256;
		scaleRGBA[i * 4 + 2] = (1 - Math.pow(v, powB)) * 256;
		scaleRGBA[i * 4 + 3] = 255;
	}
	scaleRGBA[3] = 0;
	scale[sampleCount - 1] = scale[sampleCount - 2];
	return scale;
}
