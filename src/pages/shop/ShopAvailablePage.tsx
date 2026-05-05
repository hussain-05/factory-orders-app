import { Minus, Plus, ShoppingBag } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { db } from '../../lib/firebase'
import { createOrder } from '../../lib/orderService'
import { listLimitedProducts } from '../../lib/productService'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ImageLightbox } from '../../components/ui/ImageLightbox'
import { Modal } from '../../components/ui/Modal'
import type { LimitedProduct, OrderLineItem, ShopName } from '../../types/models'

type Line = { product: LimitedProduct; quantity: number }

export function ShopAvailablePage() {
  const { profile, user } = useAuth()
  const [items, setItems] = useState<LimitedProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cart, setCart] = useState<Record<string, Line>>({})
  const [previewOpen, setPreviewOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [imageView, setImageView] = useState<{ url: string; title: string } | null>(null)

  const refresh = useCallback(async () => {
    if (!db) return
    setLoading(true)
    setError(null)
    try {
      setItems(await listLimitedProducts(db))
    } catch {
      setError('Could not load products.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void refresh()
    })
  }, [refresh])

  const lines = useMemo(() => Object.values(cart).filter((l) => l.quantity > 0), [cart])

  function setQty(product: LimitedProduct, qty: number) {
    setCart((prev) => {
      const next = { ...prev }
      if (qty <= 0) {
        delete next[product.id]
        return next
      }
      const clamped = Math.min(qty, product.stock)
      next[product.id] = { product, quantity: clamped }
      return next
    })
  }

  function openImage(product: LimitedProduct) {
    setImageView({ url: product.photoUrl, title: `${product.name} (${product.size})` })
  }

  async function submit() {
    if (!db || !profile || !user) return
    const payload: OrderLineItem[] = lines.map((l) => ({
      productId: l.product.id,
      name: l.product.name,
      size: l.product.size,
      quantity: l.quantity,
      rate: l.product.rate,
    }))
    setBusy(true)
    setError(null)
    try {
      await createOrder(db, {
        orderKind: 'limited',
        shopName: profile.shopName as ShopName,
        shopUserId: user.uid,
        requestorName: profile.displayName,
        requestorEmail: profile.email,
        items: payload,
      })
      setCart({})
      setPreviewOpen(false)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit order.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            Available products
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Limited-stock items currently at the factory. Add quantities to your cart and submit a
            single multi-item order.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void refresh()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          Loading catalogue…
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => {
            const line = cart[p.id]
            const qty = line?.quantity ?? 0
            return (
              <Card key={p.id} className="overflow-hidden p-0">
                <div className="aspect-[4/3] w-full bg-slate-100">
                  {p.photoUrl ? (
                    <button
                      type="button"
                      className="h-full w-full"
                      onClick={() => openImage(p)}
                      onTouchEnd={() => openImage(p)}
                    >
                      <img
                        src={p.photoUrl}
                        alt={p.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-500">
                      No photo
                    </div>
                  )}
                </div>
                <div className="space-y-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-500">Size: {p.size}</p>
                    </div>
                    <Badge tone={p.stock > 5 ? 'success' : p.stock > 0 ? 'warning' : 'danger'}>
                      Stock {p.stock}
                    </Badge>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">₹{p.rate.toFixed(2)}</p>

                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                      <button
                        type="button"
                        className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"
                        onClick={() => setQty(p, qty - 1)}
                        disabled={qty <= 0}
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <input
                        className="w-20 rounded-lg border border-transparent bg-transparent px-2 py-1 text-center text-sm font-semibold tabular-nums outline-none focus:border-slate-300 focus:bg-white"
                        inputMode="numeric"
                        value={qty === 0 ? '' : String(qty)}
                        placeholder="0"
                        onChange={(e) => {
                          const raw = e.target.value.trim()
                          if (raw === '') {
                            setQty(p, 0)
                            return
                          }
                          const n = Number(raw)
                          if (!Number.isFinite(n)) return
                          setQty(p, Math.max(0, Math.floor(n)))
                        }}
                      />
                      <button
                        type="button"
                        className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"
                        onClick={() => setQty(p, qty + 1)}
                        disabled={p.stock <= 0 || qty >= p.stock}
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <Button variant="secondary" onClick={() => setQty(p, qty > 0 ? 0 : 1)}>
                      {qty > 0 ? 'Clear' : 'Add'}
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {lines.length > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/90 p-4 backdrop-blur lg:static lg:z-0 lg:border-0 lg:bg-transparent lg:p-0">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/40 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-sm text-slate-700">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                <ShoppingBag className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-slate-900">{lines.length} products selected</p>
                <p className="text-xs text-slate-500">Review before sending to the factory.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setCart({})}>
                Clear cart
              </Button>
              <Button onClick={() => setPreviewOpen(true)}>Preview order</Button>
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        open={previewOpen}
        title="Confirm limited-stock order"
        onClose={() => {
          if (!busy) setPreviewOpen(false)
        }}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" disabled={busy} onClick={() => setPreviewOpen(false)}>
              Back
            </Button>
            <Button disabled={busy} onClick={() => void submit()}>
              {busy ? 'Submitting…' : 'Submit order'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {lines.map((l) => (
            <div
              key={l.product.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{l.product.name}</p>
                <p className="text-xs text-slate-500">
                  {l.product.size} · ₹{l.product.rate.toFixed(2)} × {l.quantity}
                </p>
              </div>
              <p className="text-sm font-semibold tabular-nums text-slate-900">
                ₹{(l.product.rate * l.quantity).toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      </Modal>
      <ImageLightbox
        open={Boolean(imageView)}
        imageUrl={imageView?.url ?? ''}
        title={imageView?.title}
        onClose={() => setImageView(null)}
      />

      {lines.length > 0 ? <div className="h-24 lg:h-0" /> : null}
    </div>
  )
}
