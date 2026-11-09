import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

const DIR = 'com.haeunga0822.obs-browser-click.sdPlugin'

export default {
	input: 'src/plugin.ts',
	output: { file: `${DIR}/bin/plugin.js`, format: 'es', sourcemap: true },
	plugins: [
		typescript({ outDir: `${DIR}/bin`, declaration: false }),
		nodeResolve({ preferBuiltins: true, exportConditions: ['node'] }),
		commonjs(),
	],
	external: [/^node:/],
}
