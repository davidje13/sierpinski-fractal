window.addEventListener('DOMContentLoaded', () => {
	const size = 701;
	const dpr = window.devicePixelRatio;

	const points = document.getElementsByName('points')[0];
	const fraction = document.getElementsByName('fraction')[0];
	const fractionOut = document.getElementById('fraction-display');
	const out = document.getElementById('out');

	out.width = size * dpr;
	out.height = size * dpr;
	out.style.width = size + 'px';

	const offscreenCanvas = out.transferControlToOffscreen();

	const renderer = new Worker('render-worker.js');
	renderer.postMessage({ canvas: offscreenCanvas }, [offscreenCanvas]);
	renderer.addEventListener('message', ({ data }) => {
		if (data === 'complete') {
			console.log('done');
		}
	});

	function update() {
		const pts = Number(points.value) | 0;
		const frac = Number(fraction.value);
		fractionOut.innerText = frac.toFixed(6);

		renderer.postMessage({ points: pts, fraction: frac, agents: 10000 });
	}

	for (const o of document.getElementsByTagName('input')) {
		o.addEventListener('input', update);
	}
	update();
});
