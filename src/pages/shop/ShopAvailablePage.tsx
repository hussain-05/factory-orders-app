import { AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import Fuse from "fuse.js";
import { useAuth } from "../../contexts/AuthContext";
import { useAdminMode } from "../../contexts/AdminModeContext";
import { useOrderDraft } from "../../contexts/OrderDraftContext";
import { db } from "../../lib/firebase";
import { getFactoryWhatsappNumber } from "../../lib/adminService";
import { createOrder } from "../../lib/orderService";
import { subscribeLimitedProducts } from "../../lib/productService";
import { whatsappLink } from "../../utils/whatsapp";

import { Button } from "../../components/ui/Button";
import { ProductGridSkeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { Card } from "../../components/ui/Card";
import { ImageLightbox } from "../../components/ui/ImageLightbox";
import { Modal } from "../../components/ui/Modal";
import { triggerHaptic } from "../../utils/haptic";
import { useToast } from "../../contexts/ToastContext";
import type {
  LimitedProduct,
  OrderLineItem,
} from "../../types/models";

type Line = { product: LimitedProduct; quantity: number };

function stockBarClass(stock: number) {
  if (stock <= 10) return "bg-rose-500 animate-pulse";
  if (stock >= 21 && stock <= 70) return "bg-amber-400";
  if (stock > 100) return "bg-emerald-500";
  return "bg-slate-300 dark:bg-slate-700";
}

export function ShopAvailablePage() {
  const location = useLocation();
  const { profile, user } = useAuth();
  const { shopView } = useAdminMode();
  const { showToast } = useToast();
  const [items, setItems] = useState<LimitedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { limitedDraft, setLimitedQty, clearLimitedDraft } = useOrderDraft();
  const cartQtys = limitedDraft.qtys;

  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [searchQuery, setSearchQuery] = useState(() => {
    return (location.state as any)?.searchQuery ?? "";
  });
  const [lastOrderNumber, setLastOrderNumber] = useState("");
  const [lastItemCount, setLastItemCount] = useState(0);
  const [factoryNumber, setFactoryNumber] = useState("");
  const [imageView, setImageView] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  // Real-time subscription for limited products — stock updates live
  useEffect(() => {
    if (!db) return;
    setLoading(true);
    setError(null);
    getFactoryWhatsappNumber(db).then(setFactoryNumber).catch(() => {})
    const unsub = subscribeLimitedProducts(
      db,
      (products) => {
        setItems(products);
        setLoading(false);
      },
      () => {
        setError("Could not load products.");
        setLoading(false);
      },
    );
    return unsub;
  }, []);



  const lines = useMemo(() => {
    return Object.entries(cartQtys)
      .map(([id, qty]) => {
        const product = items.find((p) => p.id === id);
        return product ? { product, quantity: Number(qty) } : null;
      })
      .filter((l): l is Line => l !== null && l.quantity > 0);
  }, [cartQtys, items]);

  const fuse = useMemo(
    () =>
      new Fuse(items, {
        keys: ["name", "size", "rate", "description"],
        threshold: 0.4,
      }),
    [items],
  );

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return items;
    return fuse.search(q).map((res) => res.item);
  }, [items, searchQuery, fuse]);

  function setQty(product: LimitedProduct, qty: number) {
    triggerHaptic('light')
    if (qty <= 0) {
      setLimitedQty(product.id, 0);
    } else {
      const clamped = Math.min(qty, product.stock);
      setLimitedQty(product.id, clamped);
    }
  }

  function openImage(product: LimitedProduct) {
    setImageView({
      url: product.photoUrl,
      title: `${product.name} (${product.size})`,
    });
  }

  async function submit() {
    if (!db || !profile || !user) return;
    const payload: OrderLineItem[] = lines.map((l) => ({
      productId: l.product.id,
      name: l.product.name,
      size: l.product.size,
      quantity: l.quantity,
      rate: l.product.rate,
    }));
    setBusy(true);
    setError(null);

    if (!navigator.onLine) {
      try {
        const tempOrderNumber = 'OFFLINE-' + Math.floor(100000 + Math.random() * 900000)
        const offlineOrder = {
          id: tempOrderNumber,
          timestamp: Date.now(),
          orderKind: 'limited',
          shopName: shopView,
          shopUserId: user.uid,
          requestorName: profile.displayName,
          requestorEmail: profile.email,
          shopWhatsappNumber: profile.whatsappNumber,
          items: payload,
        }
        const currentOffline = JSON.parse(localStorage.getItem('seva_offline_orders') ?? '[]')
        currentOffline.push(offlineOrder)
        localStorage.setItem('seva_offline_orders', JSON.stringify(currentOffline))

        setLastItemCount(lines.length);
        clearLimitedDraft();
        setLastOrderNumber(tempOrderNumber);
        setSubmitted(true);
        setPreviewOpen(false);
        showToast("Order queued (Offline) — Auto-syncing when online!", "info");
      } catch (e) {
        setError('Failed to queue order offline.');
        showToast("Failed to queue order offline.", "error");
      } finally {
        setBusy(false);
      }
      return
    }

    try {
      const { orderNumber } = await createOrder(db, {
        orderKind: "limited",
        shopName: shopView,
        shopUserId: user.uid,
        requestorName: profile.displayName,
        requestorEmail: profile.email,
        shopWhatsappNumber: profile.whatsappNumber,
        items: payload,
      });
      setLastItemCount(lines.length);
      clearLimitedDraft();
      setLastOrderNumber(orderNumber);
      setSubmitted(true);
      setPreviewOpen(false);
      showToast("Order submitted successfully!", "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit order.");
      showToast("Could not submit order.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className="space-y-6 pb-28"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 dark:from-slate-100 dark:to-slate-400 transition-colors duration-200">
            Available products
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400 transition-colors duration-200">
            Limited-stock items currently at the factory. Add quantities to your
            cart and submit a single multi-item order.
          </p>
        </div>

      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 px-4 py-3 ring-1 ring-rose-200 dark:ring-rose-800/50">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <p className="text-sm text-rose-800 dark:text-rose-300">{error}</p>
        </div>
      ) : null}

      {submitted ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 w-max max-w-[calc(100vw-2rem)]">
          <div className="flex items-center gap-3 rounded-xl bg-emerald-600 px-5 py-3 shadow-lg shadow-emerald-900/20">
            <p className="text-sm font-semibold text-white">
              {lastOrderNumber.startsWith('OFFLINE-')
                ? 'Order queued (Offline) — Auto-syncing when online!'
                : 'Order submitted!'}
            </p>
            {factoryNumber && (
              <a
                href={whatsappLink(
                  factoryNumber,
                  `Hi, I've placed a new order:\nOrder number: ${lastOrderNumber}\nShop: ${shopView}\nNo of items: ${lastItemCount}\nRequestor: ${profile?.displayName}\nType: Limited Stock`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg bg-[#25D366] dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#1ebe5d] dark:hover:bg-slate-800 transition-colors duration-200"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
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
        <ProductGridSkeleton count={6} />
      ) : (
        <>
          <div className="mb-6 max-w-md relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search limited stock products..."
              className={`w-full rounded-xl border border-slate-200 dark:border-slate-800/50 bg-white dark:bg-slate-900 px-3 py-2 text-base sm:text-sm text-slate-900 dark:text-slate-100 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 ${searchQuery ? "pr-10" : ""}`}
            />
            {searchQuery.trim() && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <EmptyState
              title="No products available"
              description="There are no limited stock products listed at the moment."
              variant="warehouse"
            />
          ) : filteredItems.length === 0 ? (
            <EmptyState
              title="No products found"
              description="Try a different product name, size, description, or rate."
              variant="search"
              actionLabel="Clear search"
              onAction={() => setSearchQuery("")}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map((p) => {
                const qty = cartQtys[p.id] ?? 0;
                return (
                  <Card
                    key={p.id}
                    className="overflow-hidden p-0 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-default relative"
                  >
                    {p.stock === 0 && (
                      <div className="absolute top-3 left-3 z-10 rounded-lg bg-rose-100/90 px-2.5 py-1 text-xs font-semibold text-rose-700 shadow-sm backdrop-blur-sm dark:bg-rose-900/80 dark:text-rose-300">
                        Out of stock
                      </div>
                    )}
                    <div
                      className={`aspect-[4/3] w-full bg-slate-100 dark:bg-slate-800 transition-colors duration-200 ${p.stock === 0 ? "opacity-60 grayscale-[0.8]" : ""}`}
                    >
                      {p.photoUrl && !imageErrors[p.id] ? (
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
                            onError={() => setImageErrors((prev) => ({ ...prev, [p.id]: true }))}
                          />
                        </button>
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 transition-colors duration-200 p-4 text-center">
                          <svg viewBox="0 0 24 24" className="h-6 w-6 stroke-current fill-none opacity-50 shrink-0" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                          </svg>
                          <span className="font-medium text-[10px] uppercase tracking-wider">Photo Unavailable</span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-4 p-5">
                      <div>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-200">
                              {p.name}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">
                              Size: {p.size}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20">
                                ₹{p.rate.toFixed(2)}
                              </span>
                            </div>
                            {p.description ? (
                              <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400 transition-colors duration-200">
                                {p.description}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-3">
                          <div className="mb-1.5 flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-600 dark:text-slate-400 transition-colors duration-200">
                              Stock level
                            </span>
                            <span
                              className={`font-semibold transition-colors duration-200 ${p.stock <= 10 ? "text-rose-600 dark:text-rose-300" : p.stock >= 21 && p.stock <= 70 ? "text-amber-600 dark:text-amber-300" : p.stock > 100 ? "text-emerald-600 dark:text-emerald-300" : "text-slate-700 dark:text-slate-300"}`}
                            >
                              {p.stock} units
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 transition-colors duration-200">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${stockBarClass(p.stock)}`}
                              style={{
                                width: `${Math.min(100, Math.max(0, (p.stock / 100) * 100))}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>

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
                            className="w-20 rounded-lg border border-transparent bg-transparent px-2 py-1 text-center text-base sm:text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100 outline-none focus:border-slate-300 focus:bg-white dark:focus:border-slate-700 dark:focus:bg-slate-800 transition-colors duration-200"
                            inputMode="numeric"
                            value={qty === 0 ? "" : String(qty)}
                            placeholder="0"
                            onChange={(e) => {
                              const raw = e.target.value.trim();
                              if (raw === "") {
                                setQty(p, 0);
                                return;
                              }
                              const n = Number(raw);
                              if (!Number.isFinite(n)) return;
                              setQty(p, Math.max(0, Math.floor(n)));
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
                        <Button
                          variant="secondary"
                          onClick={() => setQty(p, qty > 0 ? 0 : 1)}
                        >
                          {qty > 0 ? "Clear" : "Add"}
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {lines.length > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 dark:border-slate-800/50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-3 sm:p-4 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] transition-colors duration-200">
          <div className="mx-auto flex max-w-6xl flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 text-sm text-slate-700 dark:text-slate-300 transition-colors duration-200">
              <span className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                <ShoppingBag className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-sm sm:text-base text-slate-900 dark:text-slate-100 transition-colors duration-200 line-clamp-1">
                  {lines.length} items
                </p>
                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200 line-clamp-1">
                  Review order
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="secondary"
                onClick={clearLimitedDraft}
                className="px-2.5 py-2 text-xs sm:px-4 sm:py-2 sm:text-sm"
              >
                Clear all
              </Button>
              <Button
                onClick={() => setPreviewOpen(true)}
                className="px-2.5 py-2 text-xs sm:px-4 sm:py-2 sm:text-sm whitespace-nowrap"
              >
                Preview order
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        open={previewOpen}
        title="Confirm limited-stock order"
        onClose={() => {
          if (!busy) setPreviewOpen(false);
        }}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setPreviewOpen(false)}
            >
              Back
            </Button>
            <Button disabled={busy} onClick={() => void submit()}>
              {busy ? "Submitting…" : "Submit order"}
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
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-200">
                  {l.product.name}
                </p>
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
        imageUrl={imageView?.url ?? ""}
        title={imageView?.title}
        onClose={() => setImageView(null)}
      />


    </motion.div>
  );
}
