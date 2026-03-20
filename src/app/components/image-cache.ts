/**
 * ImageCache — global singleton that holds decoded image data outside React state.
 *
 * Layers store a lightweight `imageRef` string (a cache key) instead of multi-MB
 * base64 data URLs. The actual pixel data lives here as pre-decoded HTMLImageElement
 * objects, and the raw data URL is retained for serialisation (project save / export).
 *
 * This avoids:
 *  1. Copying huge base64 strings through React state on every update.
 *  2. Re-decoding images that haven't changed.
 *  3. Bloating undo history with duplicate image blobs.
 */

let _counter = 0;

/** Generate a unique cache key. */
export function generateImageRef(): string {
  return `imgref-${Date.now()}-${++_counter}`;
}

interface CacheEntry {
  /** Pre-decoded HTMLImageElement (ready to drawImage). */
  element: HTMLImageElement;
  /** Original base64 data URL (for serialisation). */
  dataUrl: string;
}

const _cache = new Map<string, CacheEntry>();

/** Listeners notified whenever cache changes (for React integration). */
type CacheListener = () => void;
const _listeners = new Set<CacheListener>();

function _notify() {
  _listeners.forEach((fn) => fn());
}

export const imageCache = {
  /**
   * Store an image in the cache. Returns a Promise that resolves once the
   * HTMLImageElement has finished loading (i.e. is ready to draw).
   * If `ref` is provided, uses that key; otherwise generates a new one.
   */
  async put(dataUrl: string, ref?: string): Promise<string> {
    const key = ref ?? generateImageRef();
    // If the entry already exists with the same dataUrl, skip re-decode
    const existing = _cache.get(key);
    if (existing && existing.dataUrl === dataUrl) return key;

    const element = new Image();
    await new Promise<void>((resolve, reject) => {
      element.onload = () => resolve();
      element.onerror = () => reject(new Error(`Failed to decode image for ${key}`));
      element.src = dataUrl;
    });

    _cache.set(key, { element, dataUrl });
    _notify();
    return key;
  },

  /**
   * Synchronous put — starts loading but doesn't wait.
   * Useful during deserialization when you want to proceed immediately.
   */
  putSync(dataUrl: string, ref?: string): string {
    const key = ref ?? generateImageRef();
    const existing = _cache.get(key);
    if (existing && existing.dataUrl === dataUrl) return key;

    const element = new Image();
    element.onload = () => {
      _cache.set(key, { element, dataUrl });
      _notify();
    };
    element.src = dataUrl;
    // Temporarily store with the element (may not be decoded yet)
    _cache.set(key, { element, dataUrl });
    return key;
  },

  /** Get the decoded HTMLImageElement (may not be complete if putSync was used). */
  getElement(ref: string): HTMLImageElement | undefined {
    return _cache.get(ref)?.element;
  },

  /** Get the original base64 data URL (for serialisation / export). */
  getDataUrl(ref: string): string | undefined {
    return _cache.get(ref)?.dataUrl;
  },

  /** Check if a key exists. */
  has(ref: string): boolean {
    return _cache.has(ref);
  },

  /** Remove a single entry. */
  delete(ref: string): void {
    _cache.delete(ref);
    _notify();
  },

  /** Remove all entries. */
  clear(): void {
    _cache.clear();
    _notify();
  },

  /** Number of cached images. */
  get size(): number {
    return _cache.size;
  },

  /** Subscribe to cache changes (for React hooks). Returns unsubscribe fn. */
  subscribe(fn: CacheListener): () => void {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },

  /**
   * Garbage-collect: remove entries whose keys are NOT in the provided set.
   * Call this after project load or layer cleanup.
   */
  gc(activeRefs: Set<string>): void {
    let changed = false;
    _cache.forEach((_, key) => {
      if (!activeRefs.has(key)) {
        _cache.delete(key);
        changed = true;
      }
    });
    if (changed) _notify();
  },
};

