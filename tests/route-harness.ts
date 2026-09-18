import { build } from 'esbuild'
import { createRequire } from 'node:module'
import path from 'node:path'

/** Bundle the actual route with only external side effects replaced; core review code stays real. */
export async function loadRoute(file: string, mocks: Record<string, Record<string, unknown>>) {
  const key = `route-test-${crypto.randomUUID()}`
  const registry = globalThis as unknown as Record<string, unknown>
  registry[key] = mocks
  const bundled = await build({ entryPoints: [file], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    plugins: [{ name: 'route-side-effects', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        const normalized = args.path.startsWith('.') ? path.relative(process.cwd(), path.resolve(path.dirname(args.importer), args.path)).replace(/\\/g, '/') : args.path.replace(/^@\//, '')
        if (mocks[normalized]) return { path: normalized, namespace: 'test-mock' }
      })
      builder.onLoad({ filter: /.*/, namespace: 'test-mock' }, args => ({ contents: Object.keys(mocks[args.path]).map(name => `export const ${name} = globalThis[${JSON.stringify(key)}][${JSON.stringify(args.path)}][${JSON.stringify(name)}];`).join('\n'), loader: 'js' }))
    } }],
  })
  const routeModule = { exports: {} as Record<string, any> }
  const filename = path.resolve(file)
  new Function('require', 'module', 'exports', '__filename', '__dirname', bundled.outputFiles[0].text)(createRequire(filename), routeModule, routeModule.exports, filename, path.dirname(filename))
  return { route: routeModule.exports, dispose: () => { delete registry[key] } }
}
