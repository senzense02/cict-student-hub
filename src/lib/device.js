// The key that lets THIS browser sign in by tapping the ID card without a password.
// A card's serial number is not secret, so the server also wants this random key, which it only hands the
// browser's trust to after the student confirmed with their password. It survives logging out on purpose.
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
