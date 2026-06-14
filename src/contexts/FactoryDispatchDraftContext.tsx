import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { ShopName, Unit } from '../types/models'

const DEFAULT_SHOP: ShopName = 'Seva'

type FactoryDispatchDraftContextValue = {
  selectedShop: ShopName
  setSelectedShop: (shop: ShopName) => void
  selectedShopUserId: string
  setSelectedShopUserId: Dispatch<SetStateAction<string>>
  standardQtys: Record<string, number>
  setStandardQtys: Dispatch<SetStateAction<Record<string, number>>>
  standardUnits: Record<string, Unit>
  setStandardUnits: Dispatch<SetStateAction<Record<string, Unit>>>
  limitedQtys: Record<string, number>
  setLimitedQtys: Dispatch<SetStateAction<Record<string, number>>>
  clearFactoryDispatchDraft: () => void
}

const FactoryDispatchDraftContext = createContext<FactoryDispatchDraftContextValue | null>(null)

export function FactoryDispatchDraftProvider({ children }: { children: ReactNode }) {
  const [selectedShop, setSelectedShop] = useState<ShopName>(DEFAULT_SHOP)
  const [selectedShopUserId, setSelectedShopUserId] = useState('')
  const [standardQtys, setStandardQtys] = useState<Record<string, number>>({})
  const [standardUnits, setStandardUnits] = useState<Record<string, Unit>>({})
  const [limitedQtys, setLimitedQtys] = useState<Record<string, number>>({})

  const clearFactoryDispatchDraft = () => {
    setStandardQtys({})
    setStandardUnits({})
    setLimitedQtys({})
  }

  return (
    <FactoryDispatchDraftContext.Provider
      value={{
        selectedShop,
        setSelectedShop,
        selectedShopUserId,
        setSelectedShopUserId,
        standardQtys,
        setStandardQtys,
        standardUnits,
        setStandardUnits,
        limitedQtys,
        setLimitedQtys,
        clearFactoryDispatchDraft,
      }}
    >
      {children}
    </FactoryDispatchDraftContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFactoryDispatchDraft() {
  const ctx = useContext(FactoryDispatchDraftContext)
  if (!ctx) throw new Error('useFactoryDispatchDraft must be used within FactoryDispatchDraftProvider')
  return ctx
}
