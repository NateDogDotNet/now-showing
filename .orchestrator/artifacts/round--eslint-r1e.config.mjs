// r1e: r1d plus the browser Cache/Stream/DOM-event globals it lacked (Cache, CacheStorage, …).
// config (whose globals list lacked standard browser/Node globals). Explicit list, no imports.
const names = `window document navigator location history screen fetch Response Request Headers URL URLSearchParams
Blob File FileReader FormData Image ImageData DOMParser AbortSignal AbortController setTimeout clearTimeout setInterval
clearInterval queueMicrotask requestAnimationFrame cancelAnimationFrame requestIdleCallback console caches self clients
globalThis matchMedia innerWidth innerHeight devicePixelRatio getComputedStyle confirm alert prompt Event CustomEvent
EventTarget Option HTMLElement HTMLImageElement Node NodeList MutationObserver ResizeObserver IntersectionObserver
localStorage sessionStorage indexedDB crypto performance structuredClone TextEncoder TextDecoder atob btoa
process Buffer global Uint8Array Uint8ClampedArray WeakMap WeakRef BroadcastChannel ServiceWorkerRegistration setImmediate clearImmediate __dirname __filename module require exports Intl WebSocket EventSource Notification Cache CacheStorage ReadableStream WritableStream TransformStream PointerEvent KeyboardEvent MouseEvent TouchEvent FocusEvent InputEvent ErrorEvent PromiseRejectionEvent DOMException Element SVGElement HTMLDialogElement HTMLInputElement HTMLSelectElement HTMLButtonElement DocumentFragment Range Selection CSS CSSStyleDeclaration ScreenOrientation WakeLockSentinel Worker MessageChannel MessagePort StorageEvent ExtendableEvent FetchEvent`.split(/\s+/);
export default [{
  files: ['**/*.js', '**/*.mjs'],
  languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: Object.fromEntries(names.map((n) => [n, 'readonly'])) },
  rules: { 'no-undef': 'error', 'no-unused-vars': 'error', 'no-unreachable': 'error', 'no-dupe-keys': 'error' },
}];
