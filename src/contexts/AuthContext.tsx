import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { auth, db, firebaseReady } from '../lib/firebase'
import { fetchUserProfile, saveUserProfile } from '../lib/userService'
import type { ShopName, UserProfile, UserRole } from '../types/models'

type AuthState = {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  error: string | null
}

type AuthContextValue = AuthState & {
  firebaseReady: boolean
  signInEmail: (email: string, password: string) => Promise<void>
  signUpEmail: (input: {
    email: string
    password: string
    displayName: string
    role: UserRole
    shopName?: ShopName
  }) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(() => firebaseReady)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!firebaseReady || !auth || !db) return

    return onAuthStateChanged(auth, async (u) => {
      setError(null)
      setUser(u)
      if (!u) {
        setProfile(null)
        setLoading(false)
        return
      }
      if (!db) {
        setProfile(null)
        setLoading(false)
        return
      }
      try {
        const p = await fetchUserProfile(db, u.uid)
        setProfile(p)
      } catch {
        setProfile(null)
        setError('Could not load your profile from the database.')
      } finally {
        setLoading(false)
      }
    })
  }, [])

  const signInEmail = useCallback(async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase is not configured.')
    setError(null)
    await signInWithEmailAndPassword(auth, email.trim(), password)
  }, [])

  const signUpEmail = useCallback(
    async (input: {
      email: string
      password: string
      displayName: string
      role: UserRole
      shopName?: ShopName
    }) => {
      if (!auth || !db) throw new Error('Firebase is not configured.')
      setError(null)
      if (input.role === 'shop' && !input.shopName) throw new Error('Select your shop.')

      const cred = await createUserWithEmailAndPassword(
        auth,
        input.email.trim(),
        input.password,
      )
      await saveUserProfile(db, {
        uid: cred.user.uid,
        email: input.email.trim(),
        displayName: input.displayName.trim(),
        role: input.role,
        shopName: input.shopName,
      })
    },
    [],
  )

  const logout = useCallback(async () => {
    if (!auth) return
    setError(null)
    await signOut(auth)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      error,
      firebaseReady,
      signInEmail,
      signUpEmail,
      logout,
    }),
    [user, profile, loading, error, signInEmail, signUpEmail, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// `useAuth` is intentionally co-located with the provider for a single import surface.
// eslint-disable-next-line react-refresh/only-export-components -- hook is stable; provider is primary export
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
