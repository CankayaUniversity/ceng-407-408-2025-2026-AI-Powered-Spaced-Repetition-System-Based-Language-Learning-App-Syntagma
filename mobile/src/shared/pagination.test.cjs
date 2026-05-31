const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const babel = require('@babel/core');
const transformModulesCommonJS = require('@babel/plugin-transform-modules-commonjs');
const originalJsLoader = require.extensions['.js'];

require.extensions['.js'] = (module, filename) => {
  if (!filename.includes(`${process.cwd()}\\src\\`) && !filename.includes(`${process.cwd()}/src/`)) {
    return originalJsLoader(module, filename);
  }

  const source = fs.readFileSync(filename, 'utf8');
  const { code } = babel.transformSync(source, {
    filename,
    babelrc: false,
    configFile: false,
    plugins: [transformModulesCommonJS],
  });
  module._compile(code, filename);
};

const { collectPagedContent } = require('./pagination.js');

test('collects paged content until the backend reports last page', async () => {
  const calls = [];
  const items = await collectPagedContent(async (page) => {
    calls.push(page);
    return {
      content: [`item-${page}`],
      last: page === 2,
      totalPages: 3,
    };
  });

  assert.deepEqual(calls, [0, 1, 2]);
  assert.deepEqual(items, ['item-0', 'item-1', 'item-2']);
});

test('uses maxPages as a safety cap above the old 20-page limit', async () => {
  const calls = [];
  const items = await collectPagedContent(async (page) => {
    calls.push(page);
    return {
      content: [page],
      last: page === 24,
      totalPages: 25,
    };
  }, { maxPages: 100 });

  assert.equal(calls.length, 25);
  assert.equal(items.length, 25);
});
