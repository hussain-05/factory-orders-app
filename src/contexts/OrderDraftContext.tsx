import { createContext, useContext, useState, type ReactNode } from 'react'

type StandardDraft = {
  qtys: Record<string, number>
  units: Record<string, string>
}

type LimitedDraft = {
  qtys: Record<string, number>
}

type OrderDraftContextValue = {
  standardDraft: StandardDraft
  setStandardQty: (productId: string, qty: number) => void
  setStandardUnits: (units: Record<string, string>) => void
  clearStandardDraft: () => void

  limitedDraft: LimitedDraft
  setLimitedQty: (productId: string, qty: number) => void
  clearLimitedDraft: () => void
}

const OrderDraftContext = createContext<OrderDraftContextValue | null>(null)

export function OrderDraftProvider({ children }: { children: ReactNode }) {
  const [standardDraft, setStandardDraft] = useState<StandardDraft>({ qtys: {}, units: {} })
  const [limitedDraft, setLimitedDraft] = useState<LimitedDraft>({ qtys: {} })

  const setStandardQty = (productId: string, qty: number) => {
    setStandardDraft((prev) => {
      const nextQtys = { ...prev.qtys }
      if (qty <= 0) delete nextQtys[productId]
      else nextQtys[productId] = qty
      return { ...prev, qtys: nextQtys }
    })
  }

  const setStandardUnits = (units: Record<string, string>) => {
    setStandardDraft((prev) => ({ ...prev, units }))
  }

  const clearStandardDraft = () => {
    setStandardDraft({ qtys: {}, units: {} })
  }

  const setLimitedQty = (productId: string, qty: number) => {
    setLimitedDraft((prev) => {
      const nextQtys = { ...prev.qtys }
      if (qty <= 0) delete nextQtys[productId]
      else nextQtys[productId] = qty
      return { qtys: nextQtys }
    })
  }

  const clearLimitedDraft = () => {
    setLimitedDraft({ qtys: {} })
  }

  return (
    <OrderDraftContext.Provider
      value={{
        standardDraft,
        setStandardQty,
        setStandardUnits,
        clearStandardDraft,
        limitedDraft,
        setLimitedQty,
        clearLimitedDraft,
      }}
    >
      {children}
    </OrderDraftContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOrderDraft() {
  const ctx = useContext(OrderDraftContext)
  if (!ctx) throw new Error('useOrderDraft must be used within OrderDraftProvider')
  return ctx
}
