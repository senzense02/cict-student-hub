// The API lives on the same domain as the site (/api), so there is no CORS and no URL to configure.
// VITE_API_URL is optional and only needed if you ever host the API somewhere else.
const BASE = import.meta.env.VITE_API_URL || '/api';

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = localStorage.getItem('cict_token');
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) payload = form; // FormData: browser sets the multipart header
  else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

// Downloads a protected file with the login token and returns a temporary blob: URL
export async function fetchFileUrl(path) {
  const token = localStorage.getItem('cict_token');
  const res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error('Could not load the file');
  return URL.createObjectURL(await res.blob());
}
