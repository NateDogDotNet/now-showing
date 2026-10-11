// r1d: r1c plus the Node timer globals it lacked (setImmediate, clearImmediate) and other Node/web globals.
// config (whose globals list lacked standard browser/Node globals). Explicit list, no imports.
const names = `window document navigator location history screen fetch Response Request Headers URL URLSearchParams
Blob File FileReader FormData Image ImageData DOMParser AbortSignal AbortController setTimeout clearTimeout setInterval
clearInterval queueMicrotask requestAnimationFrame cancelAnimationFrame requestIdleCallback console caches self clients
globalThis matchMedia innerWidth innerHeight devicePixelRatio getComputedStyle confirm alert prompt Event CustomEvent
EventTarget Option HTMLElement HTMLImageElement Node NodeList MutationObserver ResizeObserver IntersectionObserver
localStorage sessionStorage indexedDB crypto performance structuredClone TextEncoder TextDecoder atob btoa
process Buffer global Uint8Array Uint8ClampedArray WeakMap WeakRef BroadcastChannel ServiceWorkerRegistration setImmediate clearImmediate __dirname __filename module require exports Intl WebSocket EventSource Notification`.split(/\s+/);
export default [{
  files: ['**/*.js', '**/*.mjs'],
  languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: Object.fromEntries(names.map((n) => [n, 'readonly'])) },
  rules: { 'no-undef': 'error', 'no-unused-vars': 'error', 'no-unreachable': 'error', 'no-dupe-keys': 'error' },
}];
