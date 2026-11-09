import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import path from 'node:path'

const BUILD_FILE = path.resolve('src/build-flavour.ts')

/** One bundle per plugin: src/build-flavour.ts is swapped for the plugin's name (see src/flavour.ts). */
const flavour = (name) => ({
	name: 'flavour',
	load: (id) => (path.normalize(id) === BUILD_FILE ? `export const BUILD = '${name}'\n` : null),
})

const bundle = (name, dir) => ({
	input: 'src/plugin.ts',
	output: { file: `${dir}/bin/plugin.js`, format: 'es', sourcemap: true },
	plugins: [
		flavour(name),
		typescript({ outDir: `${dir}/bin`, declaration: false }),
		nodeResolve({ preferBuiltins: true, exportConditions: ['node'] }),
		commonjs(),
	],
	external: [/^node:/],
})

export default [bundle('obs', 'com.haeunga0822.obs-browser-click.sdPlugin'), bundle('freecshot', 'com.haeunga0822.freecshot-audio.sdPlugin')]
