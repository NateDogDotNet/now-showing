// The error every source adapter throws, and the kinds it carries. Its own module so that js/sources/index.js and each
// adapter import it without importing each other.

/** The kinds a SourceError carries: the five an adapter's requests end in, and 'config' for a setting that names no adapter. */
export const KINDS = ['network', 'timeout', 'auth', 'http', 'parse', 'config'];

export class SourceError extends Error {
  constructor(message, { status = 0, kind = 'network' } = {}) {
    super(message);
    this.name = 'SourceError';
    this.status = status;
    this.kind = kind;
  }
}
