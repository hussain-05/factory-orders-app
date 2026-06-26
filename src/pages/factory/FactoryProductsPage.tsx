import { AlertTriangle } from 'lucide-react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import Fuse from 'fuse.js'
import { db, storage } from '../../lib/firebase'
import {
  createLimitedProductWithPhoto,
  createUnlimitedProduct,
  deleteLimitedProductWithPhoto,
  deleteUnlimitedProduct,
  replaceUnlimitedCatalogue,
  updateLimitedProduct,
  updateUnlimitedProduct,
  uploadLimitedProductPhoto,
  subscribeLimitedProducts,
  subscribeAllUnlimitedForFactory,
} from '../../lib/productService'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ImageLightbox } from '../../components/ui/ImageLightbox'
import { Input } from '../../components/ui/Input'
import type { LimitedProduct, Unit, UnlimitedProduct } from '../../types/models'
import * as XLSX from 'xlsx'

type Tab = 'limited' | 'catalog'

export function FactoryProductsPage() {
  const [tab, setTab] = useState<Tab>('limited')
  const [limited, setLimited] = useState<LimitedProduct[]>([])
  const [catalog, setCatalog] = useState<UnlimitedProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [lName, setLName] = useState('')
  const [lSize, setLSize] = useState('')
  const [lStock, setLStock] = useState('0')
  const [lRate, setLRate] = useState('0')
  const [lDescription, setLDescription] = useState('')
  const [lFile, setLFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const [edit, setEdit] = useState<LimitedProduct | null>(null)

  const [cName, setCName] = useState('')
  const [cSize, setCSize] = useState('')
  const [cUnit, setCUnit] = useState<'box' | 'bag' | 'pcs'>('pcs')
  const [catalogFile, setCatalogFile] = useState<File | null>(null)
  const [imageView, setImageView] = useState<{ url: string; title: string } | null>(null)

  const fuse = useMemo(
    () =>
      new Fuse(limited, {
        keys: ['name', 'size', 'stock', 'rate', 'description'],
        threshold: 0.4,
      }),
    [limited],
  )

  const filteredLimited = useMemo(() => {
    const q = searchQuery.trim()
    if (!q) return limited
    return fuse.search(q).map((res) => res.item)
  }, [limited, searchQuery, fuse])

  useEffect(() => {
    if (!db) return
    setLoading(true)
    setError(null)
    const unsubLimited = subscribeLimitedProducts(
      db,
      (l) => {
        setLimited(l)
        setLoading(false)
      },
      () => {
        setError('Could not load limited products.')
        setLoading(false)
      }
    )
    const unsubCatalog = subscribeAllUnlimitedForFactory(
      db,
      (c) => {
        setCatalog(c)
        setLoading(false)
      },
      () => {
        setError('Could not load catalogue.')
        setLoading(false)
      }
    )
    return () => {
      unsubLimited()
      unsubCatalog()
    }
  }, [])

  const tabs = useMemo(
    () =>
      [
        { id: 'limited' as const, label: 'Limited stock' },
        { id: 'catalog' as const, label: 'Standard catalogue' },
      ] satisfies { id: Tab; label: string }[],
    [],
  )

  async function addLimited(e: React.FormEvent) {
    e.preventDefault()
    if (!db || !storage) return
    if (!lFile) {
      setError('Please choose a product photo.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await createLimitedProductWithPhoto(db, storage, lFile, {
        name: lName,
        size: lSize,
        stock: Number(lStock),
        rate: Number(lRate),
        description: lDescription,
      })
      setLName('')
      setLSize('')
      setLStock('0')
      setLRate('0')
      setLDescription('')
      setLFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save product.')
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!db || !edit) return
    setBusy(true)
    setError(null)
    try {
      let photoUrl = edit.photoUrl
      if (lFile && storage) {
        photoUrl = await uploadLimitedProductPhoto(storage, lFile, edit.id)
      }
      await updateLimitedProduct(db, edit.id, {
        name: edit.name,
        size: edit.size,
        stock: Number(edit.stock),
        rate: Number(edit.rate),
        description: edit.description ?? '',
        photoUrl,
      })
      setEdit(null)
      setLFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update product.')
    } finally {
      setBusy(false)
    }
  }

  async function addCatalogLine(e: React.FormEvent) {
    e.preventDefault()
    if (!db) return
    if (!cName.trim()) return
    setBusy(true)
    setError(null)
    try {
      await createUnlimitedProduct(db, { name: cName, size: cSize, defaultUnit: cUnit })
      setCName('')
      setCSize('')
      setCUnit('pcs')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add line.')
    } finally {
      setBusy(false)
    }
  }

  async function replaceCatalogFromExcel() {
    if (!db || !catalogFile) {
      setError('Please choose an Excel file first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const data = await catalogFile.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

      let lastName = ''
      let sort = 10
      const parsed = rows.map((row) => {
        const rawName = String(
          row['PRODUCT NAME'] ?? row['Product Name'] ?? row['product name'] ?? '',
        ).trim()
        if (rawName) lastName = rawName
        const name = rawName || lastName
        const size = String(row['SIZE'] ?? row['Size'] ?? row['size'] ?? '').trim()
        const defaultUnit = String(
          row['DEFAULT UNIT'] ?? row['Default Unit'] ?? row['default unit'] ?? 'pcs',
        )
          .trim()
          .toLowerCase() as Unit
        const item = {
          name,
          size,
          defaultUnit,
          sortIndex: sort,
        }
        sort += 10
        return item
      })

      await replaceUnlimitedCatalogue(db, parsed)
      setCatalogFile(null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not parse/import Excel. Check column names.',
      )
    } finally {
      setBusy(false)
    }
  }

  function downloadCatalogueTemplate() {
    const headers = ['S NO.', 'PRODUCT NAME', 'SIZE', 'DEFAULT UNIT', 'STOCK']
    const sampleRows = [
      [1, 'Fabric Wash', '500ml', 'box', 'Unlimited'],
      [2, '', '1ltr', 'box', 'Unlimited'],
      [3, '', '5ltr', 'pcs', 'Unlimited'],
      [4, 'Seva Liquid', '495gm', 'box', 'Unlimited'],
      [5, 'Comfort loose', '1ltr', 'bag', 'Unlimited'],
    ]
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...sampleRows])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Standard Catalogue')
    XLSX.writeFile(workbook, 'standard-catalogue-template.xlsx')
  }

  function openImage(product: LimitedProduct) {
    setImageView({ url: product.photoUrl, title: `${product.name} (${product.size})` })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className="space-y-6"
    >
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 dark:from-slate-100 dark:to-slate-400 transition-colors duration-200">Products</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400 transition-colors duration-200">
          Maintain limited-stock items with photography, and keep the always-available standard
          catalogue up to date for shopkeepers.
        </p>
      </div>

      <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800/50 bg-white dark:bg-slate-900 transition-colors duration-200 p-1 shadow-sm">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${ tab === t.id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-50' }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 px-4 py-3 ring-1 ring-rose-200 dark:ring-rose-800/50">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <p className="text-sm text-rose-800 dark:text-rose-300">{error}
        </p>
        </div>
      ) : null}

      {tab === 'limited' ? (
        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Card>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-200">Add limited item</h2>
            <form className="mt-4 space-y-3" onSubmit={addLimited}>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200">Photo</label>
                <label className="mt-1 flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/50 px-3 py-2 hover:bg-slate-100 transition-colors">
                  <span className="shrink-0 rounded-lg bg-white dark:bg-slate-900 transition-colors duration-200 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 ring-1 ring-slate-200 shadow-sm">
                    Choose photo
                  </span>
                  <span className="truncate text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">
                    {lFile ? lFile.name : 'No photo selected'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => setLFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200">Name</label>
                <Input className="mt-1" value={lName} onChange={(e) => setLName(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200">Size / pack</label>
                <Input className="mt-1" value={lSize} onChange={(e) => setLSize(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200">
                  Description <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-800/50 dark:bg-slate-900 dark:text-slate-100 sm:text-sm"
                  placeholder="Short note visible to shopkeepers"
                  value={lDescription}
                  onChange={(e) => setLDescription(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200">Stock</label>
                  <Input
                    className="mt-1 tabular-nums"
                    inputMode="numeric"
                    value={lStock}
                    onChange={(e) => setLStock(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200">Rate (₹)</label>
                  <Input
                    className="mt-1 tabular-nums"
                    inputMode="decimal"
                    value={lRate}
                    onChange={(e) => setLRate(e.target.value)}
                    required
                  />
                </div>
              </div>
              <Button className="w-full" type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Publish item'}
              </Button>
            </form>
          </Card>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-200">Inventory</h2>
            </div>
            {loading ? (
              <div className="flex items-center gap-3 p-5 text-sm text-slate-600 dark:text-slate-400 transition-colors duration-200">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-900 dark:border-slate-100 border-t-transparent transition-colors duration-200" />
                Loading…
              </div>
            ) : (
              <div className="p-5">
                <div className="mb-6 relative max-w-md">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search limited stock products..."
                    className={`w-full rounded-xl border border-slate-200 dark:border-slate-800/50 bg-white dark:bg-slate-900 px-3 py-2 text-base sm:text-sm text-slate-900 dark:text-slate-100 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 ${searchQuery ? 'pr-10' : ''}`}
                  />
                  {searchQuery.trim() && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {filteredLimited.length === 0 && limited.length > 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <p className="font-display text-base font-semibold text-slate-700 dark:text-slate-300">
                      No products found
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Try a different product name, size, stock, or rate.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredLimited.map((p) => (
                  <Card key={p.id} className="overflow-hidden p-0">
                    <div className="aspect-[4/3] bg-slate-100 dark:bg-slate-800 transition-colors duration-200">
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
                      ) : null}
                    </div>
                    <div className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-200">{p.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">{p.size}</p>
                          {p.description ? (
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400 transition-colors duration-200">
                              {p.description}
                            </p>
                          ) : null}
                        </div>
                        <Badge tone="neutral">₹{p.rate.toFixed(2)}</Badge>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 transition-colors duration-200">Stock: {p.stock}</p>
                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={() => {
                          setLFile(null)
                          setEdit(p)
                        }}
                      >
                        Edit
                      </Button>
                    </div>
                  </Card>
                    ))}
                  </div>
                )}
                {!loading && limited.length === 0 && !searchQuery ? (
                  <p className="mt-5 text-sm text-slate-600 dark:text-slate-400 transition-colors duration-200">No limited items yet.</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Card>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-200">Add catalogue line</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 transition-colors duration-200">
              These items are treated as always available for the frequent “New order” workflow.
            </p>
            <form className="mt-4 space-y-3" onSubmit={addCatalogLine}>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200">Product name</label>
                <Input className="mt-1" value={cName} onChange={(e) => setCName(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200">Size</label>
                <Input className="mt-1" value={cSize} onChange={(e) => setCSize(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200">Default unit</label>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800/50 bg-white dark:bg-slate-900 transition-colors duration-200 px-3 py-2.5 text-base sm:text-sm text-slate-900 dark:text-slate-100 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  value={cUnit}
                  onChange={(e) => setCUnit(e.target.value as 'box' | 'bag' | 'pcs')}
                >
                  <option value="box">box</option>
                  <option value="bag">bag</option>
                  <option value="pcs">pcs</option>
                </select>
              </div>
              <Button className="w-full" type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Add to catalogue'}
              </Button>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/50 p-3 transition-colors duration-200">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200">Replace from Excel</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">
                  Upload an Excel file with columns PRODUCT NAME, SIZE, DEFAULT UNIT. This fully
                  replaces all existing standard catalogue products.
                </p>
                <Input
                  className="mt-2"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setCatalogFile(e.target.files?.[0] ?? null)}
                />
                <Button
                  variant="secondary"
                  className="mt-3 w-full"
                  type="button"
                  onClick={downloadCatalogueTemplate}
                >
                  Download Excel template
                </Button>
                <Button
                  variant="danger"
                  className="mt-3 w-full"
                  type="button"
                  disabled={busy || !catalogFile}
                  onClick={() => void replaceCatalogFromExcel()}
                >
                  Replace entire catalogue from file
                </Button>
              </div>
            </form>
          </Card>

          <Card className="p-0">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/50 px-5 py-4 transition-colors duration-200">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-200">Lines</h2>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/50 transition-colors duration-200">
              {catalog.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-200">{p.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">
                      Size: {p.size || '—'} · Unit: {p.defaultUnit ?? 'pcs'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        if (!db) return
                        await updateUnlimitedProduct(db, p.id, { active: !p.active })
                      }}
                    >
                      {p.active ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={async () => {
                        if (!db) return
                        if (!confirm(`Delete “${p.name}”?`)) return
                        await deleteUnlimitedProduct(db, p.id)
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
              {catalog.length === 0 ? (
                <p className="px-5 py-10 text-sm text-slate-600 dark:text-slate-400 transition-colors duration-200">No catalogue lines yet.</p>
              ) : null}
            </div>
          </Card>
        </div>
      )}

      {edit ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 sm:items-center">
          <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
            <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-200">Edit limited item</h3>
            <form className="mt-4 space-y-3" onSubmit={saveEdit}>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200">Replace photo (optional)</label>
                <label className="mt-1 flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/50 px-3 py-2 hover:bg-slate-100 transition-colors">
                  <span className="shrink-0 rounded-lg bg-white dark:bg-slate-900 transition-colors duration-200 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 ring-1 ring-slate-200 shadow-sm">
                    Choose photo
                  </span>
                  <span className="truncate text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">
                    {lFile ? lFile.name : 'No new photo selected'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => setLFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200">Name</label>
                <Input
                  className="mt-1"
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200">Size / pack</label>
                <Input
                  className="mt-1"
                  value={edit.size}
                  onChange={(e) => setEdit({ ...edit, size: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200">
                  Description <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-800/50 dark:bg-slate-900 dark:text-slate-100 sm:text-sm"
                  value={edit.description ?? ''}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200">Stock</label>
                  <Input
                    className="mt-1 tabular-nums"
                    inputMode="numeric"
                    value={String(edit.stock)}
                    onChange={(e) => setEdit({ ...edit, stock: Number(e.target.value) })}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200">Rate (₹)</label>
                  <Input
                    className="mt-1 tabular-nums"
                    inputMode="decimal"
                    value={String(edit.rate)}
                    onChange={(e) => setEdit({ ...edit, rate: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="danger"
                  disabled={busy}
                  onClick={async () => {
                    if (!db || !storage || !edit) return
                    if (!confirm(`Delete limited product “${edit.name} (${edit.size})”?`)) return
                    setBusy(true)
                    setError(null)
                    try {
                      await deleteLimitedProductWithPhoto(db, storage, {
                        id: edit.id,
                        photoUrl: edit.photoUrl,
                      })
                      setEdit(null)
                      setLFile(null)
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Could not delete product.')
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  Delete product
                </Button>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => setEdit(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
      <ImageLightbox
        open={Boolean(imageView)}
        imageUrl={imageView?.url ?? ''}
        title={imageView?.title}
        onClose={() => setImageView(null)}
      />
    </motion.div>
  )
}