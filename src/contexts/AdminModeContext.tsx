import { createContext, useContext, useState, type ReactNode, useMemo, useEffect } from 'react'
import type { ShopName } from '../types/models'
import { useAuth } from './AuthContext'

type AdminMode = 'factory' | 'shop'

const SHOPS: ShopName[] = ['Seva', 'Seva Mart', 'Seva Super Store']

interface AdminModeContextValue {
  mode: AdminMode
  shopView: ShopName
  shops: ShopName[]
  setMode: (m: AdminMode) => void
  setShopView: (s: ShopName) => void
}

const AdminModeContext = createContext<AdminModeContextValue | null>(null)

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

export function AdminModeProvider({
  children,
  defaultMode = 'factory',
}: {
  children: ReactNode
  defaultMode?: AdminMode
}) {
  const { profile } = useAuth()

  const allowedShops = useMemo<ShopName[]>(() => {
    if (!profile) return []
    if (profile.role === 'factory' || profile.role === 'factory_staff' || profile.isAdmin) {
      return SHOPS
    }
    const shopsSet = new Set<ShopName>()
    if (profile.shopName) {
      shopsSet.add(profile.shopName)
    }
    if (profile.accessibleShops) {
      profile.accessibleShops.forEach(s => shopsSet.add(s))
    }
    return Array.from(shopsSet)
  }, [profile])

  const [mode, setModeState] = useState<AdminMode>(() => {
    try {
      const v = localStorage.getItem('adminMode')
      return v ? (JSON.parse(v) as AdminMode) : defaultMode
    } catch {
      return defaultMode
    }
  })

  const [shopView, setShopViewState] = useState<ShopName>(() =>
    load<ShopName>('adminShopView', 'Seva'),
  )

  // Keep shopView synchronized and valid for the current user's allowedShops
  useEffect(() => {
    if (allowedShops.length === 0) return

    // Load user-specific active shop preference if it exists
    const storageKey = profile ? `shopView_${profile.uid}` : 'adminShopView'
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored) as ShopName
        if (allowedShops.includes(parsed)) {
          if (shopView !== parsed) {
            setShopViewState(parsed)
          }
          return
        }
      }
    } catch {}

    // Otherwise fallback to default primary shop
    if (!allowedShops.includes(shopView)) {
      const defaultShop = (profile?.shopName && allowedShops.includes(profile.shopName))
        ? profile.shopName
        : allowedShops[0]
      setShopViewState(defaultShop)
    }
  }, [allowedShops, profile, shopView])

  const setMode = (m: AdminMode) => {
    setModeState(m)
    localStorage.setItem('adminMode', JSON.stringify(m))
  }

  const setShopView = (s: ShopName) => {
    if (allowedShops.includes(s)) {
      setShopViewState(s)
      const storageKey = profile ? `shopView_${profile.uid}` : 'adminShopView'
      localStorage.setItem(storageKey, JSON.stringify(s))
    }
  }

  return (
    <AdminModeContext.Provider value={{ mode, shopView, shops: allowedShops, setMode, setShopView }}>
      {children}
    </AdminModeContext.Provider>
  )
}

export function useAdminMode() {
  const ctx = useContext(AdminModeContext)
  if (!ctx) throw new Error('useAdminMode must be used inside AdminModeProvider')
  return ctx
}