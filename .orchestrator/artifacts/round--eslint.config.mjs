export default [{
  files: ['**/*.js', '**/*.mjs'],
  languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: {
    window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly', fetch: 'readonly', Response: 'readonly', Request: 'readonly', URL: 'readonly', Blob: 'readonly', Image: 'readonly', DOMParser: 'readonly', AbortSignal: 'readonly', AbortController: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', console: 'readonly', caches: 'readonly', self: 'readonly', globalThis: 'readonly', matchMedia: 'readonly', innerWidth: 'readonly', innerHeight: 'readonly', devicePixelRatio: 'readonly', requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly', confirm: 'readonly', Event: 'readonly', Option: 'readonly', process: 'readonly', Uint8ClampedArray: 'readonly', WeakMap: 'readonly' } },
  rules: { 'no-undef': 'error', 'no-unused-vars': 'error', 'no-unreachable': 'error', 'no-dupe-keys': 'error' },
}];
