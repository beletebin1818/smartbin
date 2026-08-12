import { apiClient } from './client';

function attachToken() {
  if (typeof window === 'undefined') return;
  try {
    const token = localStorage.getItem('auth_token');
    if (token) {
      (apiClient.defaults.headers as any).Authorization = 'Bearer ' + token;
    } else if (apiClient.defaults.headers) {
      delete (apiClient.defaults.headers as any).Authorization;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[patchAuthClient] failed to attach token', err);
  }
}

attachToken();

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === 'auth_token') attachToken();
  });
}

export { attachToken };
