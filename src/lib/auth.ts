// Sesión opcional: se juega sin login; el progreso se guarda solo con usuario.
import { useEffect, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithRedirect, signOut, type User } from 'firebase/auth';
import { auth } from './firebase';

export function useUser(): { user: User | null; ready: boolean } {
  const [state, setState] = useState<{ user: User | null; ready: boolean }>({ user: auth.currentUser, ready: false });
  useEffect(() => onAuthStateChanged(auth, (user) => setState({ user, ready: true })), []);
  return state;
}

export const signIn = () => signInWithRedirect(auth, new GoogleAuthProvider());
export const logOut = () => signOut(auth);
