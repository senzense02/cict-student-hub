// A random key that lets THIS browser sign in by tapping the ID card, with no password.
// A card's serial number is not secret, so the server also checks this key. The server only trusts a key
// after the student confirmed with their password. The key is kept after logging out on purpose.
const NAME = 'cict_device';

export function deviceKey({ create = false } = {}) {
  try {
    let key = localStorage.getItem(NAME);
    if (!key && create) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      key = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      localStorage.setItem(NAME, key);
    }
    return key || '';
  } catch {
    return ''; // storage blocked: tap sign-in simply asks for the password each time
  }
}
