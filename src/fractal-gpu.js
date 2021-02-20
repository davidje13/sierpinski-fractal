const GL = WebGL2RenderingContext;

function makeShader(gl, type, source) {
	const shader = gl.createShader(type);
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, GL.COMPILE_STATUS)) {
		const info = gl.getShaderInfoLog(shader);
		gl.deleteShader(shader);
		throw new Error(info);
	}
	return shader;
}

function makeProgram(gl, shaders, feedback) {
	const prog = gl.createProgram();
	shaders.forEach((shader) => gl.attachShader(prog, shader));
	if (feedback) {
		gl.transformFeedbackVaryings(prog, feedback, GL.INTERLEAVED_ATTRIBS);
	}
	gl.linkProgram(prog);
	if (!gl.getProgramParameter(prog, GL.LINK_STATUS)) {
		const info = gl.getProgramInfoLog(prog);
		gl.deleteProgram(prog);
		throw new Error(info);
	}
	return prog;
}

const vsDisplay = `#version 300 es
out highp vec2 uv;

void main() {
	vec2 pos = vec2(gl_VertexID % 2, gl_VertexID / 2) * 2.0 - 1.0;
	uv = pos * vec2(1.0, -0.5) + vec2(0.0, 0.5);
	gl_Position = vec4(pos, 0.0, 1.0);
}
`;

const fsDisplay = `#version 300 es
uniform lowp sampler2D palette;
uniform highp sampler2D buckets;

in highp vec2 uv;
out lowp vec4 col;

void main() {
	// TODO: dynamic range based on max value
	// TODO: make centre seam 1px not 2px
	col = texture(palette, vec2(texture(buckets, uv).r / 256.0, 0));
}
`;

const vsAgentDraw = `#version 300 es
uniform highp sampler2D agents;

in highp vec4 proj; // mat2 takes 2 attribute slots

void main() {
	int agentsW = int(textureSize(agents, 0).x);
	vec2 pos = texelFetch(agents, ivec2(gl_VertexID % agentsW, gl_VertexID / agentsW), 0).xy;

	vec2 p = pos.x * proj.xz + pos.y * proj.yw; // hand-cranked matrix mult
	gl_Position = vec4(abs(p.x) * 2.0 - 1.0, p.y, 0.0, 1.0);
	gl_PointSize = 1.0;
}
`;

const fsAgentDraw = `#version 300 es
out lowp float col;

void main() {
	col = 1.0;
}
`;

const vsAgentStep = `#version 300 es
uniform highp vec2 randomShift;
out highp vec2 uv;

void main() {
	vec2 pos = vec2(gl_VertexID % 2, gl_VertexID / 2) * 2.0 - 1.0;
	uv = pos * 0.5 + randomShift;
	gl_Position = vec4(pos, 0.0, 1.0);
}
`;

const fsAgentStep = `#version 300 es
uniform highp sampler2D vertices;
uniform highp usampler2D noise;
uniform highp uint randomSeed;
in highp vec2 uv;
out highp vec4 vertex;

void main() {
	uint x = randomSeed ^ texture(noise, uv).x;
	uint vertexCount = uint(textureSize(vertices, 0).x);
	vertex = texelFetch(vertices, ivec2(x % vertexCount, 0), 0);
}
`;

const states = new Map();

function getState(target) {
	if (states.has(target)) {
		return states.get(target);
	}

	const state = {};
	states.set(target, state);
	const gl = state.gl = target.getContext('webgl2');

	gl.getExtension('EXT_color_buffer_float');
	state.progDisplay = makeProgram(gl, [
		makeShader(gl, GL.VERTEX_SHADER, vsDisplay),
		makeShader(gl, GL.FRAGMENT_SHADER, fsDisplay),
	]);
	state.progDisplayPalette = gl.getUniformLocation(state.progDisplay, 'palette');
	state.progDisplayBuckets = gl.getUniformLocation(state.progDisplay, 'buckets');
	state.progAgentDraw = makeProgram(gl, [
		makeShader(gl, GL.VERTEX_SHADER, vsAgentDraw),
		makeShader(gl, GL.FRAGMENT_SHADER, fsAgentDraw),
	]);
	state.progAgentDrawAgents = gl.getUniformLocation(state.progAgentDraw, 'agents');
	state.progAgentDrawProj = gl.getAttribLocation(state.progAgentDraw, 'proj');
	state.progAgentStep = makeProgram(gl, [
		makeShader(gl, GL.VERTEX_SHADER, vsAgentStep),
		makeShader(gl, GL.FRAGMENT_SHADER, fsAgentStep),
	]);
	state.progAgentStepVertices = gl.getUniformLocation(state.progAgentStep, 'vertices');
	state.progAgentStepNoise = gl.getUniformLocation(state.progAgentStep, 'noise');
	state.progAgentStepRandomSeed = gl.getUniformLocation(state.progAgentStep, 'randomSeed');
	state.progAgentStepRandomShift = gl.getUniformLocation(state.progAgentStep, 'randomShift');

	state.palette = gl.createTexture();
	gl.bindTexture(GL.TEXTURE_2D, state.palette);
	gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE);
	gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);
	gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.LINEAR);
	gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.LINEAR);

	state.buckets = gl.createTexture();
	gl.bindTexture(GL.TEXTURE_2D, state.buckets);
	gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.MIRRORED_REPEAT);
	gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);
	gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST);
	gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST);
	gl.texImage2D(
		GL.TEXTURE_2D,
		0,
		GL.R32F, // ideally R32UI but cannot blend (i.e. add) with integer targets
		Math.floor(target.width / 2) + 1,
		target.height,
		0,
		GL.RED,
		GL.FLOAT,
		null,
	);
	state.bucketsFB = gl.createFramebuffer();
	gl.bindFramebuffer(GL.FRAMEBUFFER, state.bucketsFB);
	gl.framebufferTexture2D(GL.FRAMEBUFFER, GL.COLOR_ATTACHMENT0, GL.TEXTURE_2D, state.buckets, 0);

	state.vertices = gl.createTexture();
	gl.bindTexture(GL.TEXTURE_2D, state.vertices);
	gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.REPEAT);
	gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.REPEAT);
	gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST);
	gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST);

	state.agents = gl.createTexture();
	gl.bindTexture(GL.TEXTURE_2D, state.agents);
	gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.REPEAT);
	gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.REPEAT);
	gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST);
	gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST);
	state.agentsFB = gl.createFramebuffer();
	gl.bindFramebuffer(GL.FRAMEBUFFER, state.agentsFB);
	gl.framebufferTexture2D(GL.FRAMEBUFFER, GL.COLOR_ATTACHMENT0, GL.TEXTURE_2D, state.agents, 0);

	const noise = new Uint32Array(1024 * 1024);
	const noiseBlockSize = 4096;
	for (let i = 0; i < noise.byteLength; i += noiseBlockSize) {
		crypto.getRandomValues(new Uint8Array(noise.buffer, i, noiseBlockSize));
	}
	state.noise = gl.createTexture();
	gl.bindTexture(GL.TEXTURE_2D, state.noise);
	gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.REPEAT);
	gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.REPEAT);
	gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST);
	gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST);
	gl.texImage2D(
		GL.TEXTURE_2D,
		0,
		GL.R32UI,
		1024,
		1024,
		0,
		GL.RED_INTEGER,
		GL.UNSIGNED_INT,
		noise,
	);

	state.projectionsBuf = gl.createBuffer();

	return state;
}

function populateState(state, { vertices, projections, agents, palette }) {
	const gl = state.gl;

	gl.bindTexture(GL.TEXTURE_2D, state.palette);
	gl.texImage2D(
		GL.TEXTURE_2D,
		0,
		GL.RGBA,
		palette.length,
		1,
		0,
		GL.RGBA,
		GL.UNSIGNED_BYTE,
		new Uint8Array(palette.buffer),
	);
	gl.bindBuffer(GL.ARRAY_BUFFER, state.projectionsBuf);
	gl.bufferData(GL.ARRAY_BUFFER, projections, GL.STATIC_DRAW);
	gl.bindTexture(GL.TEXTURE_2D, state.vertices);
	gl.texImage2D(
		GL.TEXTURE_2D,
		0,
		GL.RG32F,
		vertices.length / 2,
		1,
		0,
		GL.RG,
		GL.FLOAT,
		vertices,
	);
	gl.bindTexture(GL.TEXTURE_2D, state.agents);
	state.agentsFBW = 1024;
	state.agentsFBH = Math.ceil((agents.length / 2) / 1024);
	const rectAgents = new Float32Array(state.agentsFBW * state.agentsFBH * 2);
	rectAgents.set(agents);
	gl.texImage2D(
		GL.TEXTURE_2D,
		0,
		GL.RG32F,
		state.agentsFBW,
		state.agentsFBH,
		0,
		GL.RG,
		GL.FLOAT,
		rectAgents,
	);

	gl.bindFramebuffer(GL.FRAMEBUFFER, state.bucketsFB);
	gl.clearBufferfv(GL.COLOR, 0, [0, 0, 0, 0]);
}

class Fractal {
	constructor(target, points, fraction, { maxAgents, palette }) {
		const size = target.width;
		const vertices = makeVertices(points);
		const projections = makeProjections(points, (size - 4) / size);
		const agents = makeAgents(maxAgents, vertices, fraction);

		this.state = getState(target);
		populateState(this.state, { vertices, projections, agents, palette });

		this.size = size;
		this.points = points;
		this.fraction = fraction;
		this.half = Math.floor(size / 2) + 1;
		this.agentCount = agents.length / 2;
	}

	step(steps) {
		const { gl } = this.state;

		gl.enable(GL.BLEND);
		gl.blendColor(0, 0, 0, this.fraction);

		gl.bindBuffer(GL.ARRAY_BUFFER, this.state.projectionsBuf);
		gl.enableVertexAttribArray(this.state.progAgentDrawProj);
		gl.vertexAttribPointer(this.state.progAgentDrawProj, 4, GL.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(this.state.progAgentDrawProj, 1);

		gl.activeTexture(GL.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.state.noise);
		gl.activeTexture(GL.TEXTURE0);

		for (let i = 0; i < 1; ++i) {
			gl.bindFramebuffer(GL.FRAMEBUFFER, this.state.agentsFB);
			gl.viewport(0, 0, this.state.agentsFBW, this.state.agentsFBH);
			gl.useProgram(this.state.progAgentStep);
			gl.bindTexture(gl.TEXTURE_2D, this.state.vertices);
			gl.uniform1i(this.state.progAgentStepVertices, 0);
			gl.uniform1i(this.state.progAgentStepNoise, 1);
			gl.uniform1ui(this.state.progAgentStepRandomSeed, (Math.random() * 0x100000000) >>> 0);
			gl.uniform2f(this.state.progAgentStepRandomShift, Math.random(), Math.random());
			gl.blendFunc(GL.CONSTANT_ALPHA, GL.ONE_MINUS_CONSTANT_ALPHA);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			//gl.flush();

			gl.bindFramebuffer(GL.FRAMEBUFFER, this.state.bucketsFB);
			gl.viewport(0, 0, this.half, this.size);
			gl.useProgram(this.state.progAgentDraw);
			gl.bindTexture(gl.TEXTURE_2D, this.state.agents);
			gl.uniform1i(this.state.progAgentDrawAgents, 0);
			gl.blendFunc(GL.ONE, GL.ONE);
			gl.drawArraysInstanced(GL.POINTS, 0, this.agentCount, this.points);
			//gl.flush();
		}
		// https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#always_keep_vertex_attrib_0_array-enabled
		//gl.disableVertexAttribArray(this.state.progAgentDrawProj);

		gl.disable(GL.BLEND);
	}

	render() {
		const { gl } = this.state;

		gl.bindFramebuffer(GL.FRAMEBUFFER, null);
		gl.viewport(0, 0, this.size, this.size);
		gl.useProgram(this.state.progDisplay);
		gl.activeTexture(GL.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.state.palette);
		gl.activeTexture(GL.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.state.buckets);
		gl.uniform1i(this.state.progDisplayPalette, 0);
		gl.uniform1i(this.state.progDisplayBuckets, 1);
		gl.drawArrays(GL.TRIANGLE_STRIP, 0, 4);

		return [1, 1];
	}
}
