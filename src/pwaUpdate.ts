/**
 * Bridges vite-plugin-pwa's registerType:'prompt' update flow to a React
 * component. With 'prompt', a new service worker installs in the
 * background but never takes over on its own — onNeedRefresh() fires once
 * it's waiting, and applyUpdate() is the only thing that activates it and
 * reloads the page. This keeps a mid-edit user in control of when that
 * happens instead of losing work to a surprise reload.
 */

type Listener = () => void;

let _needRefresh = false;
let _updateFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
const _listeners = new Set<Listener>();

export function setUpdateAvailable(updateFn: (reloadPage?: boolean) => Promise<void>) {
  _updateFn = updateFn;
  _needRefresh = true;
  _listeners.forEach((l) => l());
}

export function isUpdateAvailable(): boolean {
  return _needRefresh;
}

export function applyUpdate(): void {
  _updateFn?.(true);
}

export function subscribeToUpdateAvailable(listener: Listener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}
