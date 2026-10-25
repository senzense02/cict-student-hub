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

  // A request that gets no answer at all (server or database stuck) must end in an error the person can see,
  // not an endless spinner. File uploads are given longer.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), form ? 120_000 : 30_000);
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: payload, signal: ctrl.signal });
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'The server did not answer in time. Try again in a moment.' : err.message);
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({})); // a reply that is not JSON becomes {}, so the status error below still works
  if (!res.ok) throw Object.assign(new Error(data.message || 'Request failed'), { status: res.status, data });
  return data;
}

// Downloads a protected file with the login token (a plain link cannot send it) and returns a temporary blob: URL
export async function fetchFileUrl(path) {
  const token = localStorage.getItem('cict_token');
  const res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error('Could not load the file');
  return URL.createObjectURL(await res.blob());
}
