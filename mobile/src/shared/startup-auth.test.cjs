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

const { resolveInitialRouteFromAuthError } = require('./startup-auth.js');

test('no stored auth token routes to Login', () => {
  assert.equal(resolveInitialRouteFromAuthError(false, null), 'Login');
});

test('stored auth + network failure routes to MainTabs', () => {
  assert.equal(resolveInitialRouteFromAuthError(true, undefined), 'MainTabs');
});

test('stored auth + 401 routes to Login', () => {
  assert.equal(resolveInitialRouteFromAuthError(true, 401), 'Login');
});

test('stored auth + 403 routes to Login', () => {
  assert.equal(resolveInitialRouteFromAuthError(true, 403), 'Login');
});
