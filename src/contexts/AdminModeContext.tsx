import { createContext, useContext, useState, type ReactNode } from 'react'
import type { ShopName } from '../types/models'

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

  const setMode = (m: AdminMode) => {
    setModeState(m)
    localStorage.setItem('adminMode', JSON.stringify(m))
  }

  const setShopView = (s: ShopName) => {
    setShopViewState(s)
    localStorage.setItem('adminShopView', JSON.stringify(s))
  }

  return (
    <AdminModeContext.Provider value={{ mode, shopView, shops: SHOPS, setMode, setShopView }}>
      {children}
    </AdminModeContext.Provider>
  )
}

export function useAdminMode() {
  const ctx = useContext(AdminModeContext)
  if (!ctx) throw new Error('useAdminMode must be used inside AdminModeProvider')
  return ctx
}