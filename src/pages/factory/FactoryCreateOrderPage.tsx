import {
  AlertTriangle,
  CheckCircle2,
  Minus,
  PackagePlus,
  Plus,
  Search,
  Send,
  ShoppingCart,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Fuse from "fuse.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useFactoryDispatchDraft } from "../../contexts/FactoryDispatchDraftContext";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { db } from "../../lib/firebase";
import { createFactoryDispatchOrder } from "../../lib/orderService";
import {
  listLimitedProducts,
  listUnlimitedProducts,
} from "../../lib/productService";
import { listShopUsers } from "../../lib/userService";
import type {
  LimitedProduct,
  OrderLineItem,
  ShopName,
  Unit,
  UnlimitedProduct,
  UserProfile,
} from "../../types/models";

const shops: ShopName[] = ["Seva", "Seva Mart", "Seva Super Store"];
const units: Unit[] = ["box", "bag", "pcs"];

type StandardLine = { product: UnlimitedProduct; quantity: number; unit: Unit };
type LimitedLine = { product: LimitedProduct; quantity: number };
type ActiveList = "standard" | "limited";

function clampQty(value: number, max?: number) {
  const n = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return typeof max === "number" ? Math.min(n, Math.max(0, max)) : n;
}

function productLabel(p: { name: string; size?: string }) {
  return `${p.name}${p.size ? ` (${p.size})` : ""}`;
}

export function FactoryCreateOrderPage() {
  const { profile, user } = useAuth();
  const {
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
  } = useFactoryDispatchDraft();
  const [shopkeepers, setShopkeepers] = useState<UserProfile[]>([]);
  const [catalog, setCatalog] = useState<UnlimitedProduct[]>([]);
  const [limited, setLimited] = useState<LimitedProduct[]>([]);
  const [standardQuery, setStandardQuery] = useState("");
  const [limitedQuery, setLimitedQuery] = useState("");
  const [activeList, setActiveList] = useState<ActiveList>("standard");
  const [loading, setLoading] = useState(true);
  const [shopkeeperLoading, setShopkeeperLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    setError(null);
    try {
      const [catalogRows, limitedRows] = await Promise.all([
        listUnlimitedProducts(db),
        listLimitedProducts(db),
      ]);
      setCatalog(catalogRows);
      setLimited(limitedRows);
    } catch {
      setError("Could not load products.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  useEffect(() => {
    if (!db) return;
    setShopkeeperLoading(true);
    listShopUsers(db, selectedShop)
      .then((rows) => {
        setShopkeepers(rows);
        setSelectedShopUserId((current) =>
          rows.some((row) => row.uid === current) ? current : rows[0]?.uid ?? "",
        );
      })
      .catch((err) => {
        console.error("Could not load shopkeepers:", err);
        setShopkeepers([]);
        setError(
          "Could not load shopkeepers. Please deploy the updated Firestore rules and try again.",
        );
      })
      .finally(() => setShopkeeperLoading(false));
  }, [selectedShop]);

  const selectedShopkeeper = useMemo(
    () => shopkeepers.find((u) => u.uid === selectedShopUserId) ?? null,
    [selectedShopUserId, shopkeepers],
  );

  const standardFuse = useMemo(
    () =>
      new Fuse(catalog, {
        keys: ["name", "size", "defaultUnit"],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [catalog],
  );

  const limitedFuse = useMemo(
    () =>
      new Fuse(limited, {
        keys: ["name", "size", "rate", "stock", "description"],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [limited],
  );

  const filteredStandard = useMemo(() => {
    const q = standardQuery.trim();
    const rows = q ? standardFuse.search(q).map((r) => r.item) : catalog;
    return [...rows].sort(
      (a, b) =>
        a.name.localeCompare(b.name) ||
        (a.size ?? "").localeCompare(b.size ?? ""),
    );
  }, [catalog, standardFuse, standardQuery]);

  const filteredLimited = useMemo(() => {
    const q = limitedQuery.trim();
    const rows = q ? limitedFuse.search(q).map((r) => r.item) : limited;
    return [...rows].sort(
      (a, b) =>
        a.name.localeCompare(b.name) ||
        (a.size ?? "").localeCompare(b.size ?? ""),
    );
  }, [limited, limitedFuse, limitedQuery]);

  const standardLines = useMemo<StandardLine[]>(() => {
    const rows: StandardLine[] = [];
    for (const [id, rawQuantity] of Object.entries(standardQtys)) {
      const quantity = Number(rawQuantity);
      const product = catalog.find((p) => p.id === id);
      if (!product || quantity <= 0) continue;
      rows.push({
        product,
        quantity,
        unit: standardUnits[id] ?? product.defaultUnit ?? "box",
      });
    }
    return rows;
  }, [catalog, standardQtys, standardUnits]);

  const limitedLines = useMemo<LimitedLine[]>(() => {
    const rows: LimitedLine[] = [];
    for (const [id, rawQuantity] of Object.entries(limitedQtys)) {
      const quantity = Number(rawQuantity);
      const product = limited.find((p) => p.id === id);
      if (!product || quantity <= 0) continue;
      rows.push({ product, quantity });
    }
    return rows;
  }, [limited, limitedQtys]);

  const totalLines = standardLines.length + limitedLines.length;
  const standardCount = standardLines.length;
  const limitedCount = limitedLines.length;
  const totalUnits =
    standardLines.reduce((sum, line) => sum + line.quantity, 0) +
    limitedLines.reduce((sum, line) => sum + line.quantity, 0);

  const steps = [
    { label: "Shop", done: Boolean(selectedShop) },
    { label: "Receiver", done: Boolean(selectedShopkeeper) },
    { label: "Items", done: totalLines > 0 },
    { label: "Review", done: false },
  ];

  const groupedStandard = useMemo(() => {
    const map = new Map<string, UnlimitedProduct[]>();
    for (const product of filteredStandard) {
      const rows = map.get(product.name) ?? [];
      rows.push(product);
      map.set(product.name, rows);
    }
    return Array.from(map.entries())
      .map(([name, variants]) => ({
        name,
        variants: variants.sort((a, b) => (a.size ?? "").localeCompare(b.size ?? "")),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredStandard]);

  function setStandardQty(product: UnlimitedProduct, qty: number) {
    setStandardQtys((prev) => {
      const next = { ...prev };
      const clamped = clampQty(qty);
      if (clamped <= 0) delete next[product.id];
      else next[product.id] = clamped;
      return next;
    });
    setStandardUnits((prev) => ({
      ...prev,
      [product.id]: prev[product.id] ?? product.defaultUnit ?? "box",
    }));
  }

  function setLimitedQty(product: LimitedProduct, qty: number) {
    setLimitedQtys((prev) => {
      const next = { ...prev };
      const clamped = clampQty(qty, product.stock);
      if (clamped <= 0) delete next[product.id];
      else next[product.id] = clamped;
      return next;
    });
  }

  function clearForm() {
    clearFactoryDispatchDraft();
    setSuccess(null);
    setPreviewOpen(false);
  }

  async function submit() {
    if (!db || !profile || !user || !selectedShopkeeper) return;
    if (totalLines === 0) {
      setError("Add at least one product to dispatch.");
      return;
    }

    const standardItems: OrderLineItem[] = standardLines.map(
      ({ product, quantity, unit }) => ({
        productId: product.id,
        name: product.name,
        size: product.size,
        quantity,
        unit,
        source: "standard",
      }),
    );

    const limitedItems: OrderLineItem[] = limitedLines.map(
      ({ product, quantity }) => ({
        productId: product.id,
        name: product.name,
        size: product.size,
        quantity,
        rate: product.rate,
        source: "limited",
      }),
    );

    setBusy(true);
    setError(null);
    try {
      const { orderNumber } = await createFactoryDispatchOrder(db, {
        shopName: selectedShop,
        shopUserId: selectedShopkeeper.uid,
        shopkeeperName: selectedShopkeeper.displayName,
        shopkeeperEmail: selectedShopkeeper.email,
        shopWhatsappNumber: selectedShopkeeper.whatsappNumber,
        factoryCreatedByUid: user.uid,
        factoryCreatedByName: profile.displayName,
        requestorEmail: profile.email,
        items: [...standardItems, ...limitedItems],
      });
      setSuccess(
        `Factory dispatch order #${orderNumber} created and dispatched.`,
      );
      clearForm();
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not create factory dispatch order.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (profile?.role === "factory_staff") {
    return (
      <Card>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Factory staff can view pending orders and history, but cannot create
          factory dispatch orders.
        </p>
      </Card>
    );
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
          <h1 className="font-display text-2xl font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 dark:from-slate-100 dark:to-slate-400">
            Factory dispatch
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Send extra stock in an existing vehicle. Select a shop, choose the
            receiver, add items, and dispatch immediately.
          </p>
        </div>
        <Button
          variant="secondary"
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        {steps.map((step, index) => (
          <div
            key={step.label}
            className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition-colors ${
              step.done
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
            }`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${step.done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}
            >
              {step.done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
            </span>
            <span className="font-semibold">{step.label}</span>
          </div>
        ))}
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-xl bg-rose-50 px-4 py-3 ring-1 ring-rose-200 dark:bg-rose-900/20 dark:ring-rose-800/50">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <p className="text-sm text-rose-800 dark:text-rose-300">{error}</p>
        </div>
      ) : null}

      {success ? (
        <div className="flex items-start gap-3 rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200 dark:bg-emerald-900/20 dark:ring-emerald-800/50">
          <PackagePlus className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm text-emerald-800 dark:text-emerald-300">
            {success}
          </p>
        </div>
      ) : null}

      <Card>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
          1. Select shop and receiver
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Shop
            </label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 sm:text-sm"
              value={selectedShop}
              onChange={(e) => {
                setSelectedShop(e.target.value as ShopName);
                setSelectedShopUserId("");
              }}
            >
              {shops.map((shop) => (
                <option key={shop} value={shop}>
                  {shop}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Shopkeeper receiving order
            </label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 sm:text-sm"
              value={selectedShopUserId}
              onChange={(e) => setSelectedShopUserId(e.target.value)}
              disabled={shopkeeperLoading}
            >
              {shopkeeperLoading ? (
                <option value="">Loading shopkeepers…</option>
              ) : shopkeepers.length === 0 ? (
                <option value="">No shopkeepers found</option>
              ) : (
                shopkeepers.map((shopkeeper) => (
                  <option key={shopkeeper.uid} value={shopkeeper.uid}>
                    {shopkeeper.displayName || shopkeeper.email}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 p-4 dark:border-slate-800/50 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                2. Add items
              </h2>
            </div>
            <div className="inline-flex w-full rounded-2xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950 sm:w-auto">
              <button
                type="button"
                onClick={() => setActiveList("standard")}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition sm:flex-none ${activeList === "standard" ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-300" : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"}`}
              >
                Standard ({standardCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveList("limited")}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition sm:flex-none ${activeList === "limited" ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-300" : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"}`}
              >
                Limited ({limitedCount})
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {activeList === "standard" ? (
            <motion.div
              key="standard"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <div className="border-b border-slate-100 p-4 dark:border-slate-800/50 sm:p-5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={standardQuery}
                    onChange={(e) => setStandardQuery(e.target.value)}
                    placeholder="Search standard catalogue..."
                    className="pl-9 pr-10"
                  />
                  {standardQuery.trim() ? (
                    <button
                      type="button"
                      onClick={() => setStandardQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      aria-label="Clear standard search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="max-h-[38rem] overflow-y-auto">
                {loading ? (
                  <p className="px-5 py-10 text-sm text-slate-500 dark:text-slate-400">
                    Loading catalogue…
                  </p>
                ) : groupedStandard.length === 0 ? (
                  <p className="px-5 py-10 text-sm text-slate-500 dark:text-slate-400">
                    No catalogue items found.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {groupedStandard.map((group) => (
                      <div key={group.name}>
                        <div className="bg-slate-50 px-5 py-2 dark:bg-slate-900/50">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {group.name}
                          </p>
                        </div>
                        {group.variants.map((product) => {
                          const qty = standardQtys[product.id] ?? 0;
                          const selectedUnit =
                            standardUnits[product.id] ??
                            product.defaultUnit ??
                            "box";
                          const active = qty > 0;
                          return (
                            <motion.div
                              layout
                              key={product.id}
                              className={`flex items-center justify-between gap-4 border-l-2 px-5 py-3 transition-all duration-200 ${
                                active
                                  ? "border-l-emerald-500 bg-emerald-50/60 dark:bg-emerald-900/40"
                                  : "border-l-transparent hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                    {product.size || "Standard"}
                                  </span>
                                  {active ? (
                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                                      Selected
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center">
                                <select
                                  className="mr-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition-all duration-150 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-800/50 dark:bg-slate-900 dark:text-slate-100 sm:text-sm"
                                  value={selectedUnit}
                                  onChange={(e) =>
                                    setStandardUnits((prev) => ({
                                      ...prev,
                                      [product.id]: e.target.value as Unit,
                                    }))
                                  }
                                >
                                  {units.map((unit) => (
                                    <option key={unit} value={unit}>
                                      {unit}
                                    </option>
                                  ))}
                                </select>
                                <div className="flex items-center rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm dark:border-slate-800/50 dark:bg-slate-900">
                                  <button
                                    type="button"
                                    className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"
                                    onClick={() =>
                                      setStandardQty(product, qty - 1)
                                    }
                                    disabled={qty <= 0}
                                    aria-label="Decrease quantity"
                                  >
                                    <Minus className="h-3.5 w-3.5" />
                                  </button>
                                  <input
                                    className="w-14 bg-transparent text-center text-base font-semibold tabular-nums text-slate-900 outline-none transition-colors dark:text-slate-100 sm:text-sm"
                                    inputMode="numeric"
                                    value={qty === 0 ? "" : String(qty)}
                                    placeholder="0"
                                    onChange={(e) =>
                                      setStandardQty(
                                        product,
                                        e.target.value.trim()
                                          ? Number(e.target.value)
                                          : 0,
                                      )
                                    }
                                  />
                                  <button
                                    type="button"
                                    className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                                    onClick={() =>
                                      setStandardQty(product, qty + 1)
                                    }
                                    aria-label="Increase quantity"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="limited"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <div className="border-b border-slate-100 p-4 dark:border-slate-800/50 sm:p-5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={limitedQuery}
                    onChange={(e) => setLimitedQuery(e.target.value)}
                    placeholder="Search limited stock..."
                    className="pl-9 pr-10"
                  />
                  {limitedQuery.trim() ? (
                    <button
                      type="button"
                      onClick={() => setLimitedQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      aria-label="Clear limited search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="max-h-[38rem] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/50">
                {loading ? (
                  <p className="px-5 py-10 text-sm text-slate-500 dark:text-slate-400">
                    Loading limited products…
                  </p>
                ) : filteredLimited.length === 0 ? (
                  <p className="px-5 py-10 text-sm text-slate-500 dark:text-slate-400">
                    No limited stock items found.
                  </p>
                ) : (
                  filteredLimited.map((product) => {
                    const qty = limitedQtys[product.id] ?? 0;
                    const active = qty > 0;
                    return (
                      <motion.div
                        layout
                        key={product.id}
                        className={`flex items-center justify-between gap-4 border-l-2 px-5 py-3 transition-all duration-200 ${
                          active
                            ? "border-l-emerald-500 bg-emerald-50/60 dark:bg-emerald-900/40"
                            : "border-l-transparent hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="break-words text-sm font-medium text-slate-900 dark:text-slate-100">
                              {product.name}
                            </p>
                            {active ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                                Selected
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-slate-500 dark:text-slate-400">
                              {product.size || "Standard"}
                            </span>
                            <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-700 ring-1 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20">
                              ₹{product.rate.toFixed(2)}
                            </span>
                            <span className={`font-semibold ${product.stock <= 10 ? "text-rose-600 dark:text-rose-300" : product.stock >= 21 && product.stock <= 70 ? "text-amber-600 dark:text-amber-300" : product.stock > 100 ? "text-emerald-600 dark:text-emerald-300" : "text-slate-500 dark:text-slate-400"}`}>
                              Stock {product.stock}
                            </span>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm dark:border-slate-800/50 dark:bg-slate-900">
                          <button
                            type="button"
                            className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"
                            onClick={() => setLimitedQty(product, qty - 1)}
                            disabled={qty <= 0}
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <input
                            className="w-14 bg-transparent text-center text-base font-semibold tabular-nums text-slate-900 outline-none transition-colors dark:text-slate-100 sm:text-sm"
                            inputMode="numeric"
                            value={qty === 0 ? "" : String(qty)}
                            placeholder="0"
                            onChange={(e) =>
                              setLimitedQty(
                                product,
                                e.target.value.trim()
                                  ? Number(e.target.value)
                                  : 0,
                              )
                            }
                          />
                          <button
                            type="button"
                            className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"
                            onClick={() => setLimitedQty(product, qty + 1)}
                            disabled={
                              product.stock <= 0 || qty >= product.stock
                            }
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      <AnimatePresence>
        {totalLines > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur dark:border-slate-800/50 dark:bg-slate-800/95 sm:p-4"
          >
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm sm:h-10 sm:w-10">
                  <ShoppingCart className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm font-semibold text-slate-900 dark:text-slate-100 sm:text-base">
                    {totalLines} items · {totalUnits} qty
                  </p>
                  <p className="line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">
                    {standardCount} standard · {limitedCount} limited
                    {selectedShopkeeper
                      ? ` · ${selectedShopkeeper.displayName || selectedShopkeeper.email}`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={clearForm}
                  className="px-2.5 py-2 text-xs sm:px-4 sm:py-2 sm:text-sm"
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  disabled={!selectedShopkeeper || busy}
                  className="whitespace-nowrap px-2.5 py-2 text-xs sm:px-4 sm:py-2 sm:text-sm"
                >
                  Review order
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {totalLines > 0 ? <div className="h-24 sm:h-20" /> : null}

      <Modal
        open={previewOpen}
        title="Review factory dispatch"
        onClose={() => setPreviewOpen(false)}
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-100 dark:ring-emerald-500/20">
            <p className="font-semibold">Send extra stock?</p>
            <p className="mt-1">
              This will create the order and mark it as dispatched today. The
              shopkeeper will confirm receipt from Shop History.
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
            <p>
              <span className="font-semibold">Shop:</span> {selectedShop}
            </p>
            <p>
              <span className="font-semibold">Receiver:</span>{" "}
              {selectedShopkeeper?.displayName ||
                selectedShopkeeper?.email ||
                "—"}
            </p>
            <p>
              <span className="font-semibold">Expected delivery:</span> Today
            </p>
            <p>
              <span className="font-semibold">Dispatch:</span> Created
              immediately
            </p>
          </div>

          {standardLines.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Standard catalogue
              </p>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                {standardLines.map(({ product, quantity, unit }) => (
                  <div
                    key={product.id}
                    className="flex justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="text-slate-700 dark:text-slate-300">
                      {productLabel(product)}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {quantity} {unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {limitedLines.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Limited stock
              </p>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                {limitedLines.map(({ product, quantity }) => (
                  <div
                    key={product.id}
                    className="flex justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="text-slate-700 dark:text-slate-300">
                      {productLabel(product)}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {quantity} pcs
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPreviewOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={busy || !selectedShopkeeper}
            >
              <Send className="h-4 w-4" />
              {busy ? "Creating…" : "Create and dispatch"}
            </Button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}
