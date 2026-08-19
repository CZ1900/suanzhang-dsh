const { readFileSync } = require('node:fs');
const path = require('node:path');
try {
  const here = __dirname; // scripts/
  const code = readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8');
  const factories = new Map();
  global.window = {
    __ModuleLoader__: {
      load: (spec) => {
        if (factories.has(spec.id)) throw new Error('dup: ' + spec.id);
        factories.set(spec.id, spec.factory);
      }
    }
  };
  const fakeReact = { createElement: () => ({}), useState: (v) => [v, () => {}], useEffect: () => {}, useMemo: () => null, Fragment: 'Fragment' };
  const req = (id) => { if (id === 'react') return fakeReact; throw new Error('unknown require: ' + id); };
  (0, eval)(code);
  const id = 'suanzhang-dsh';
  console.log('registered:', factories.has(id));
  const factory = factories.get(id);
  // 真实加载器只传一个 require 参数（materialize: registered(this.makeRequire(edges))）
  const exports = factory(req);
  console.log('exports keys:', Object.keys(exports));
  console.log('typeof apply:', typeof exports.apply);
  console.log('name:', exports.name);
  console.log('inject:', JSON.stringify(exports.inject));
} catch (e) {
  console.error('VERIFY ERROR:', e && e.stack ? e.stack : e);
  process.exit(1);
}
