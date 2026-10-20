import defaultConfig from '../config.default.json';

export interface AppConfig {
  apiBaseUrl: string;
}

function readQueryApiBase(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const value = new URLSearchParams(window.location.search).get('apiBase');
  if (!value) {
    return null;
  }
  return value.replace(/\/$/, '');
}

export function resolveApiBaseUrl(): string {
  const fromQuery = readQueryApiBase();
  if (fromQuery) {
    return fromQuery;
  }
  const cfg = defaultConfig as AppConfig;
  if (cfg.apiBaseUrl && cfg.apiBaseUrl.trim()) {
    return cfg.apiBaseUrl.replace(/\/$/, '');
  }
  return '';
}
