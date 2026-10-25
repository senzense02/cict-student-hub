// Holds the signed-in user. The token and user are mirrored in localStorage so a page refresh, or a phone
// with no internet, stays signed in.
import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    // Blocked storage or a broken saved value just means starting signed out
    try {
      return JSON.parse(localStorage.getItem('cict_user'));
    } catch {
      return null;
    }
  });

  const signIn = ({ token, user }) => {
    localStorage.setItem('cict_token', token);
    localStorage.setItem('cict_user', JSON.stringify(user));
    setUser(user);
  };

  // For when the server reports something new about the user (e.g. an admin linked their card)
  const updateUser = (next) => {
    localStorage.setItem('cict_user', JSON.stringify(next));
    setUser(next);
  };

  const signOut = () => {
    localStorage.removeItem('cict_token');
    localStorage.removeItem('cict_user');
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, signIn, signOut, updateUser }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
