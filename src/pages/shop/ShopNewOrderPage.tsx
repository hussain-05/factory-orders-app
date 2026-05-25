import { Minus, Plus, Search, ShoppingBag } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { db } from '../../lib/firebase'
import { createOrder } from '../../lib/orderService'
import { listUnlimitedProducts } from '../../lib/productService'
import type { OrderLineItem, ShopName, UnlimitedProduct } from '../../types/models'

type ProductGroup = { name: string; variants: UnlimitedProduct[] }

export function ShopNewOrderPage() {
  const { profile, user } = useAuth()
  const [catalog, setCatalog] = useState<UnlimitedProduct[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [qtys, setQtys] = useState<Record<string, number>>({})

  const refresh = useCallback(async () => {
    if (!db) return
    setLoading(true)
    setError(null)
    try {
      setCatalog(await listUnlimitedProducts(db))
    } catch {
      setError('Could not load the standard catalogue.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void refresh()
    })
  }, [refresh])

  const grouped = useMemo<ProductGroup[]>(() => {
    const map = new Map<string, UnlimitedProduct[]>()
    for (const p of catalog) {
      const name = p.name.trim()
      if (!map.has(name)) map.set(name, [])
      map.get(name)!.push(p)
    }
    return Array.from(map.entries())
      .map(([name, variants]) => ({
        name,
        variants: variants.sort((a, b) => (a.size ?? '').localeCompare(b.size ?? '')),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [catalog])

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return grouped
    return grouped.filter((g) => g.name.toLowerCase().includes(q))
  }, [grouped, query])

  function setQty(id: string, qty: number) {
    setQtys((prev) => {
      const next = { ...prev }
      const clamped = Math.max(0, Math.floor(qty))
      if (clamped === 0) {
        delete next[id]
      } else {
        next[id] = clamped
      }
      return next
    })
  }

  function stepQty(id: string, delta: number) {
    setQtys((prev) => {
      const next = { ...prev }
      const clamped = Math.max(0, (prev[id] ?? 0) + delta)
      if (clamped === 0) {
        delete next[id]
      } else {
        next[id] = clamped
      }
      return next
    })
  }

  const validLines = useMemo<OrderLineItem[]>(
    () =>
      catalog
        .filter((p) => (qtys[p.id] ?? 0) > 0)
        .map((p) => ({
          productId: p.id,
          name: p.name,
          size: p.size,
          quantity: qtys[p.id]!,
          unit: p.defaultUnit ?? 'pcs',
        })),
    [catalog, qtys],
  )

  const totalQty = useMemo(
    () => validLines.reduce((s, l) => s + l.quantity, 0),
    [validLines],
  )

  const hasItems = validLines.length > 0

  async function submit() {
    if (!db || !profile || !user) return
    if (validLines.length === 0) {
      setError('Add at least one item with a quantity.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await createOrder(db, {
        orderKind: 'unlimited',
        shopName: profile.shopName as ShopName,
        shopUserId: user.uid,
        requestorName: profile.displayName,
        requestorEmail: profile.email,
        items: validLines,
      })
      setQtys({})
      setSubmitted(true)
      setPreviewOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit order.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
          New order (standard catalogue)
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Browse the full catalogue and enter quantities for the items you need.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
          {error}
        </p>
      ) : null}

      {submitted ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 w-max max-w-[calc(100vw-2rem)]">
          <div className="flex items-center gap-3 rounded-xl bg-emerald-600 px-5 py-3 shadow-lg shadow-emerald-900/20">
            <p className="text-sm font-semibold text-white">
              Order submitted! Track it in Order history.
            </p>
            <button
              type="button"
              className="shrink-0 text-emerald-200 hover:text-white"
              onClick={() => setSubmitted(false)}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* ── Catalogue list ── */}
        <Card className="p-0">
          <div className="border-b border-slate-100 p-4 sm:p-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-10"
                placeholder="Search products…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>
                {filteredGroups.length} of {grouped.length} products
                {query ? ` matching "${query}"` : ''}
              </span>
              <Button
                variant="ghost"
                className="!px-2 !py-1 text-xs"
                onClick={() => void refresh()}
                disabled={loading}
              >
                Reload
              </Button>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="flex items-center gap-3 px-5 py-10 text-sm text-slate-500">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                Loading catalogue…
              </div>
            ) : filteredGroups.length === 0 ? (
              <p className="px-5 py-10 text-sm text-slate-500">
                No products match your search.
              </p>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.name}>
                  <div className="bg-slate-50 px-5 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {group.name}
                    </p>
                  </div>

                  {group.variants.map((v) => {
                    const qty = qtys[v.id] ?? 0
                    const active = qty > 0
                    return (
                      <div
                        key={v.id}
                        className={`flex items-center justify-between gap-4 px-5 py-3 transition-colors ${
                          active ? 'bg-emerald-50/60' : 'hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-slate-900">
                            {v.size || 'Standard'}
                          </span>
                          <span className="ml-2 text-xs text-slate-400">
                            {v.defaultUnit ?? 'pcs'}
                          </span>
                        </div>

                        <div className="flex items-center rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
                          <button
                            type="button"
                            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                            onClick={() => stepQty(v.id, -1)}
                            disabled={qty <= 0}
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <input
                            className="w-14 bg-transparent text-center text-sm font-semibold tabular-nums text-slate-900 outline-none"
                            inputMode="numeric"
                            value={qty === 0 ? '' : String(qty)}
                            placeholder="0"
                            onChange={(e) => {
                              const raw = e.target.value.trim()
                              if (raw === '') {
                                setQty(v.id, 0)
                                return
                              }
                              const n = Number(raw)
                              if (!Number.isFinite(n)) return
                              setQty(v.id, n)
                            }}
                          />
                          <button
                            type="button"
                            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                            onClick={() => stepQty(v.id, 1)}
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </Card>

        {/* ── Order summary — sticky on desktop ── */}
        <div className="space-y-4 lg:sticky lg:top-[92px] lg:self-start">
          <Card>
            <h2 className="font-display text-lg font-semibold text-slate-900">Order summary</h2>
            <p className="mt-1 text-sm text-slate-500">
              {validLines.length} items ·{' '}
              <span className="font-semibold text-slate-900">{totalQty} total qty</span>
            </p>

            <div className="mt-4 max-h-[min(45vh,400px)] space-y-2 overflow-y-auto pr-1">
              {validLines.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Set quantities above to build the order.
                </p>
              ) : (
                validLines.map((l) => (
                  <div
                    key={l.productId}
                    className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{l.name}</p>
                      <p className="text-xs text-slate-500">
                        {l.size || 'Standard'} · {l.unit}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                      ×{l.quantity}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="mt-5 flex flex-col gap-2">
              <Button
                variant="secondary"
                onClick={() => setQtys({})}
                disabled={!hasItems}
              >
                Clear all
              </Button>
              <Button onClick={() => setPreviewOpen(true)} disabled={!hasItems}>
                Preview & submit
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* ── Mobile sticky bar ── */}
      {hasItems ? (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/90 p-4 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <ShoppingBag className="h-4 w-4" />
              </span>
              <p className="text-sm font-semibold text-slate-900">
                {validLines.length} items · {totalQty} qty
              </p>
            </div>
            <Button onClick={() => setPreviewOpen(true)}>Preview & submit</Button>
          </div>
        </div>
      ) : null}
      {hasItems ? <div className="h-20 lg:h-0" /> : null}

      {/* ── Confirm modal ── */}
      <Modal
        open={previewOpen}
        title="Preview standard order"
        onClose={() => {
          if (!busy) setPreviewOpen(false)
        }}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" disabled={busy} onClick={() => setPreviewOpen(false)}>
              Keep editing
            </Button>
            <Button disabled={busy} onClick={() => void submit()}>
              {busy ? 'Submitting…' : 'Submit order'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          Submitting{' '}
          <span className="font-semibold text-slate-900">{validLines.length}</span> items,{' '}
          <span className="font-semibold text-slate-900">{totalQty}</span> total qty.
        </p>
        <div className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto">
          {validLines.map((l) => (
            <div
              key={l.productId}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
            >
              <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
                {l.name} · {l.size || 'Standard'} · {l.unit}
              </p>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                ×{l.quantity}
              </p>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}