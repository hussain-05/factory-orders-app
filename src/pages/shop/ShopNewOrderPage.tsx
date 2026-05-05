import { Plus, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { db } from '../../lib/firebase'
import { createOrder } from '../../lib/orderService'
import { listUnlimitedProducts } from '../../lib/productService'
import type { OrderLineItem, ShopName, Unit, UnlimitedProduct } from '../../types/models'

type ProductGroup = { name: string; variants: UnlimitedProduct[] }

type DraftLine = {
  id: string
  productName: string
  productId: string
  quantity: string
  unit: Unit
}

function makeLineId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const units: Unit[] = ['box', 'bag', 'pcs']

export function ShopNewOrderPage() {
  const { profile, user } = useAuth()
  const [catalog, setCatalog] = useState<UnlimitedProduct[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const [lines, setLines] = useState<DraftLine[]>([])

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
      map.get(name)?.push(p)
    }
    return Array.from(map.entries())
      .map(([name, variants]) => ({
        name,
        variants: variants.sort((a, b) => (a.size ?? '').localeCompare(b.size ?? '')),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [catalog])

  const productNames = useMemo(() => grouped.map((g) => g.name), [grouped])

  const filteredNames = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return productNames
    return productNames.filter((name) => name.toLowerCase().includes(q))
  }, [productNames, query])

  const groupByName = useMemo(() => {
    const m = new Map<string, ProductGroup>()
    for (const g of grouped) m.set(g.name, g)
    return m
  }, [grouped])

  function addLine(defaultName?: string) {
    const productName = defaultName ?? filteredNames[0] ?? productNames[0] ?? ''
    const group = groupByName.get(productName)
    const variant = group?.variants[0]
    setLines((prev) => [
      ...prev,
      {
        id: makeLineId(),
        productName,
        productId: variant?.id ?? '',
        quantity: '',
        unit: (variant?.defaultUnit ?? 'pcs') as Unit,
      },
    ])
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((x) => x.id !== id))
  }

  function updateLine(id: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  }

  const validLines = useMemo(() => {
    return lines.reduce<OrderLineItem[]>((acc, line) => {
        const qty = Number(line.quantity)
        if (!line.productId || !Number.isFinite(qty) || qty <= 0) return acc
        const group = groupByName.get(line.productName)
        const variant = group?.variants.find((v) => v.id === line.productId)
        if (!variant) return acc
        acc.push({
          productId: variant.id,
          name: variant.name,
          size: variant.size,
          quantity: Math.floor(qty),
          unit: line.unit,
        })
        return acc
      }, [])
  }, [lines, groupByName])

  async function submit() {
    if (!db || !profile || !user) return
    if (validLines.length === 0) {
      setError('Please add at least one valid line with quantity.')
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
      setLines([])
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
          Build each line with product name, size variant, quantity and unit. You can add multiple
          variants of the same product as separate lines.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-0">
          <div className="border-b border-slate-100 p-4 sm:p-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-10"
                placeholder="Search product names…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                {filteredNames.length} products available ({catalog.length} total variants)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="!px-2 !py-1 text-xs"
                  onClick={() => addLine(filteredNames[0])}
                  disabled={filteredNames.length === 0}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add line
                </Button>
                <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => void refresh()}>
                  Reload catalogue
                </Button>
              </div>
            </div>
          </div>

          <div className="max-h-[min(70vh,900px)] overflow-y-auto p-3 sm:p-4">
            {loading ? (
              <div className="flex items-center gap-3 px-3 py-10 text-sm text-slate-600">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                Loading…
              </div>
            ) : lines.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <p className="text-sm text-slate-600">No lines added yet.</p>
                <Button
                  className="mt-3"
                  onClick={() => addLine(filteredNames[0])}
                  disabled={filteredNames.length === 0}
                >
                  <Plus className="h-4 w-4" />
                  Add first line
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-12 gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <p className="col-span-12 md:col-span-4">Product name</p>
                  <p className="col-span-6 md:col-span-2">Size</p>
                  <p className="col-span-6 md:col-span-2">Qty</p>
                  <p className="col-span-6 md:col-span-2">Unit</p>
                  <p className="col-span-6 md:col-span-2 text-right">Actions</p>
                </div>

                {lines.map((line) => {
                  const group = groupByName.get(line.productName)
                  const variants = group?.variants ?? []
                  const chosenVariant = variants.find((v) => v.id === line.productId) ?? variants[0]

                  return (
                    <div
                      key={line.id}
                      className="grid grid-cols-12 items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="col-span-12 md:col-span-4">
                        <Select
                          value={line.productName}
                          onChange={(e) => {
                            const nextName = e.target.value
                            const nextGroup = groupByName.get(nextName)
                            const nextVariant = nextGroup?.variants[0]
                            updateLine(line.id, {
                              productName: nextName,
                              productId: nextVariant?.id ?? '',
                              unit: (nextVariant?.defaultUnit ?? 'pcs') as Unit,
                            })
                          }}
                        >
                          {filteredNames.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div className="col-span-6 md:col-span-2">
                        <Select
                          value={line.productId}
                          onChange={(e) => {
                            const nextId = e.target.value
                            const nextVariant = variants.find((v) => v.id === nextId)
                            updateLine(line.id, {
                              productId: nextId,
                              unit: (nextVariant?.defaultUnit ?? line.unit) as Unit,
                            })
                          }}
                          disabled={variants.length === 0}
                        >
                          {variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.size || 'Standard'}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div className="col-span-6 md:col-span-2">
                        <Input
                          inputMode="numeric"
                          value={line.quantity}
                          placeholder="0"
                          onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                        />
                      </div>

                      <div className="col-span-6 md:col-span-2">
                        <Select
                          value={line.unit}
                          onChange={(e) => updateLine(line.id, { unit: e.target.value as Unit })}
                        >
                          {units.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div className="col-span-6 flex justify-end gap-2 md:col-span-2">
                        <Button variant="secondary" className="!px-3" onClick={() => addLine(line.productName)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button variant="danger" className="!px-3" onClick={() => removeLine(line.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="col-span-12 text-xs text-slate-500">
                        Default unit for this size: {chosenVariant?.defaultUnit ?? 'pcs'}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-4 lg:sticky lg:top-[92px] lg:self-start">
          <Card>
            <h2 className="font-display text-lg font-semibold text-slate-900">Order summary</h2>
            <p className="mt-2 text-sm text-slate-600">
              {validLines.length} valid lines ·{' '}
              <span className="font-semibold text-slate-900">
                {validLines.reduce((sum, x) => sum + x.quantity, 0)} total qty
              </span>
            </p>

            <div className="mt-4 max-h-[min(45vh,460px)] space-y-2 overflow-y-auto pr-1">
              {validLines.length === 0 ? (
                <p className="text-sm text-slate-500">Add valid quantities to build the order.</p>
              ) : (
                validLines.map((l, idx) => (
                  <div
                    key={`${l.productId}-${idx}`}
                    className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-slate-900">{l.name}</p>
                    <p className="text-xs text-slate-600">
                      {l.size || 'Standard'} · {l.unit} · qty {l.quantity}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="mt-5 flex flex-col gap-2">
              <Button variant="secondary" onClick={() => setLines([])} disabled={lines.length === 0}>
                Reset order
              </Button>
              <Button onClick={() => setPreviewOpen(true)} disabled={validLines.length === 0}>
                Preview & submit
              </Button>
            </div>
          </Card>
        </div>
      </div>

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
              {busy ? 'Submitting…' : 'Submit final order'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          You are about to submit{' '}
          <span className="font-semibold text-slate-900">{validLines.length}</span> lines.
        </p>
        <div className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto">
          {validLines.map((l, idx) => (
            <div
              key={`${l.productId}-${idx}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
            >
              <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
                {l.name} ({l.size || 'Standard'}) · {l.unit}
              </p>
              <p className="text-sm font-semibold tabular-nums text-slate-900">×{l.quantity}</p>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
