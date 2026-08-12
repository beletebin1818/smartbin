// Client-side auth header patcher
// This module is imported once from the top-level layout to ensure the
// axios apiClient used by the admin app has the Authorization header set
// from localStorage. Kept minimal to avoid touching the central api client
// file structure.

import { apiClient } from './client';

function attachToken() {
  if (typeof window === 'undefined') return;
  try {
    const token = localStorage.getItem('auth_token');
    if (token) {
      (apiClient.defaults.headers as any).Authorization = 'Bearer ' + token; `Bearer ${token}`;
    } else {
      if (apiClient.defaults.headers) delete (apiClient.defaults.headers as any).Authorization;
    }
  } catch (err) {
    // no-op
    // eslint-disable-next-line no-console
    console.warn('[patchAuth] failed to attach token', err);
  }
}

// Attach immediately (on module import)
attachToken();

// Also attach on storage events so if another tab updates the token, the header is updated
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === 'auth_token') attachToken();
  });
}

export { attachToken };
