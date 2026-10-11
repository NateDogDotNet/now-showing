// r1b: replaces round--eslint.config.mjs, whose hand-written globals list lacked standard
// browser/Node globals (URLSearchParams, localStorage) and produced false no-undef hits.
import globals from '/opt/node-tools/node_modules/globals/index.js';
export default [{
  files: ['**/*.js', '**/*.mjs'],
  languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser, ...globals.node, ...globals.serviceworker } },
  rules: { 'no-undef': 'error', 'no-unused-vars': 'error', 'no-unreachable': 'error', 'no-dupe-keys': 'error' },
}];
