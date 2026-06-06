import { Minus, Plus, ShoppingBag } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { db } from '../../lib/firebase'
import { getFactoryWhatsappNumber } from '../../lib/adminService'
import { createOrder } from '../../lib/orderService'
import { listLimitedProducts } from '../../lib/productService'
import { whatsappLink } from '../../utils/whatsapp'
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
  const [submitted, setSubmitted] = useState(false)
  const [lastOrderNumber, setLastOrderNumber] = useState('')
  const [lastItemCount, setLastItemCount] = useState(0)
  const [factoryNumber, setFactoryNumber] = useState('')
  const [imageView, setImageView] = useState<{ url: string; title: string } | null>(null)

  const refresh = useCallback(async () => {
    if (!db) return
    setLoading(true)
    setError(null)
    try {
      const [products, factNum] = await Promise.all([
        listLimitedProducts(db),
        getFactoryWhatsappNumber(db),
      ])
      setItems(products)
      setFactoryNumber(factNum)
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
      const { orderNumber } = await createOrder(db, {
        orderKind: 'limited',
        shopName: profile.shopName as ShopName,
        shopUserId: user.uid,
        requestorName: profile.displayName,
        requestorEmail: profile.email,
        shopWhatsappNumber: profile.whatsappNumber,
        items: payload,
      })
      setLastItemCount(lines.length)
      setCart({})
      setLastOrderNumber(orderNumber)
      setSubmitted(true)
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
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 transition-colors duration-200">
            Available products
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400 transition-colors duration-200">
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

      {submitted ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 w-max max-w-[calc(100vw-2rem)]">
          <div className="flex items-center gap-3 rounded-xl bg-emerald-600 px-5 py-3 shadow-lg shadow-emerald-900/20">
            <p className="text-sm font-semibold text-white">
              Order submitted!
            </p>
            {factoryNumber && (
              <a
                href={whatsappLink(factoryNumber, `Hi, I've placed a new order:\nOrder number: ${lastOrderNumber}\nShop: ${profile?.shopName}\nNo of items: ${lastItemCount}\nRequestor: ${profile?.displayName}\nType: Limited Stock`)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg bg-[#25D366] dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#1ebe5d] dark:hover:bg-slate-800 transition-colors duration-200"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Notify factory
              </a>
            )}
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

      {loading ? (
        <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400 transition-colors duration-200">
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
                <div className="aspect-[4/3] w-full bg-slate-100 dark:bg-slate-800 transition-colors duration-200">
                  {p.photoUrl ? (
                    <button
                      type="button"
                      className="h-full w-full"
                      onClick={() => openImage(p)}
                    >
                      <img
                        src={p.photoUrl}
                        alt={p.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">
                      No photo
                    </div>
                  )}
                </div>
                <div className="space-y-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-200">{p.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">Size: {p.size}</p>
                    </div>
                    <Badge tone={p.stock > 5 ? 'success' : p.stock > 0 ? 'warning' : 'danger'}>
                      Stock {p.stock}
                    </Badge>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-200">₹{p.rate.toFixed(2)}</p>

                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/50 p-1 transition-colors duration-200">
                      <button
                        type="button"
                        className="rounded-lg p-2 text-slate-700 dark:text-slate-300 hover:bg-white disabled:opacity-40 transition-colors duration-200"
                        onClick={() => setQty(p, qty - 1)}
                        disabled={qty <= 0}
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <input
                        className="w-20 rounded-lg border border-transparent bg-transparent px-2 py-1 text-center text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100 outline-none focus:border-slate-300 focus:bg-white dark:focus:border-slate-700 dark:focus:bg-slate-800 transition-colors duration-200"
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
                        className="rounded-lg p-2 text-slate-700 dark:text-slate-300 hover:bg-white disabled:opacity-40 transition-colors duration-200"
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
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 dark:border-slate-800/50 bg-white/90 dark:bg-slate-900/90 p-4 backdrop-blur lg:static lg:z-0 lg:border-0 lg:bg-transparent lg:p-0 transition-colors duration-200">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 rounded-2xl border border-slate-200 dark:border-slate-800/50 bg-white dark:bg-slate-900 transition-colors duration-200 p-4 shadow-lg shadow-slate-200/40 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300 transition-colors duration-200">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                <ShoppingBag className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-200">{lines.length} products selected</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">Review before sending to the factory.</p>
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
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/50 px-3 py-2 transition-colors duration-200"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-200">{l.product.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">
                  {l.product.size} · qty {l.quantity}
                </p>
              </div>
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