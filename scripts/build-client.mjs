// 构建 dsh 客户端 bundle：把 ESM 源码 (src/client.js) 用 esbuild 打包成
// `window.__ModuleLoader__.load({ id, factory })` 包裹的 CJS 格式 (lib/client.js)。
// 这是 dsh 客户端模块系统要求的插件 bundle 格式（非 ESM，需显式注册）。
// 参考：@deepseek-ai/dsh-client-ui-cordis 等官方插件的 client.js 均为该格式。
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const entry = fileURLToPath(new URL('src/client.js', root));
const tmp = fileURLToPath(new URL('.tmp-suanzhang-client.cjs', root));

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2019'],
  external: ['react'],
  outfile: tmp,
  logLevel: 'info',
});

const code = readFileSync(tmp, 'utf8');
const out =
  'window.__ModuleLoader__.load({\n' +
  '  id: "suanzhang-dsh",\n' +
  '  factory: function (require, module, exports) {\n' +
  code +
  '\n    return module.exports;\n' +
  '  }\n' +
  '});\n';

writeFileSync(fileURLToPath(new URL('lib/client.js', root)), out);
try { unlinkSync(tmp); } catch {} // 删除失败不影响产物（可能被安全拦截）
console.log('[build-client] lib/client.js written (' + out.length + ' bytes)');
