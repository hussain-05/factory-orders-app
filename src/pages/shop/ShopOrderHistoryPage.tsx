import { AlertTriangle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  ChevronRight,
  Filter,
  Printer,
  Search,
  Trash2,
  X,
 } from 'lucide-react';
import { useLocation } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";
import { format } from "date-fns";
import { useAuth } from "../../contexts/AuthContext";
import { useAdminMode } from "../../contexts/AdminModeContext";
import { previewOrderPdf } from "../../lib/downloadOrderPdf";
import { db } from "../../lib/firebase";
import { useUsersMap } from "../../hooks/useUsersMap";
import { VisualTimeline } from "../../components/VisualTimeline";
import {
  confirmDispatchItem,
  deleteOrder,
  subscribeOrdersForShop,
} from "../../lib/orderService";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { OrderCardsSkeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { useToast } from "../../contexts/ToastContext";
import type { Order } from "../../types/models";
import {
  formatDate,
  formatDateTime,
  fulfillmentSummary,
} from "../../utils/format";

function groupByMonth(
  orders: Order[],
): Array<{ label: string; orders: Order[] }> {
  const map = new Map<string, Order[]>();
  for (const o of orders) {
    const label = o.createdAt
      ? format(new Date(o.createdAt), "MMMM yyyy")
      : "Unknown";
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(o);
  }
  return Array.from(map.entries()).map(([label, orders]) => ({
    label,
    orders,
  }));
}

export function ShopOrderHistoryPage() {
  const usersMap = useUsersMap();
  const { user, profile } = useAuth();
  const { shopView } = useAdminMode();
  const { showToast } = useToast();
  const effectiveShopName = shopView;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loc = useLocation() as { state?: { openId?: string } };
  const [openId, setOpenId] = useState<string | null>(
    loc.state?.openId ?? null,
  );

  useEffect(() => {
    const id = loc.state?.openId;
    if (!id || loading) return;
    const t = setTimeout(() => {
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => clearTimeout(t);
  }, [loading, loc.state?.openId]);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [confirmBusyId, setConfirmBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // ── Filter state — persisted across navigation via sessionStorage ──────────
  const FILTER_KEY = 'seva_shop_history_filters'
  const loadFilters = () => {
    try { return JSON.parse(sessionStorage.getItem(FILTER_KEY) ?? '{}') } catch { return {} }
  }
  const saved = loadFilters()
  const [filterRequestor, setFilterRequestorRaw] = useState<string>(saved.requestor ?? 'all');
  const [filterKind, setFilterKindRaw] = useState<string>(saved.kind ?? 'all');
  const [filterAwaiting, setFilterAwaitingRaw] = useState<boolean>(
    (loc.state as any)?.filterAwaiting ?? saved.awaiting ?? false,
  );
  const [filterStartDate, setFilterStartDateRaw] = useState<string>(saved.startDate ?? '');
  const [filterEndDate, setFilterEndDateRaw] = useState<string>(saved.endDate ?? '');
  const [filterOpen, setFilterOpen] = useState(
    (loc.state as any)?.filterAwaiting ?? saved.awaiting ?? false,
  );
  const [orderSearch, setOrderSearch] = useState("");

  const persistFilters = (patch: Record<string, unknown>) => {
    const current = loadFilters()
    sessionStorage.setItem(FILTER_KEY, JSON.stringify({ ...current, ...patch }))
  }
  const setFilterRequestor = (v: string) => { setFilterRequestorRaw(v); persistFilters({ requestor: v }) }
  const setFilterKind = (v: string) => { setFilterKindRaw(v); persistFilters({ kind: v }) }
  const setFilterAwaiting = (v: boolean) => { setFilterAwaitingRaw(v); persistFilters({ awaiting: v }) }
  const setFilterStartDate = (v: string) => { setFilterStartDateRaw(v); persistFilters({ startDate: v }) }
  const setFilterEndDate = (v: string) => { setFilterEndDateRaw(v); persistFilters({ endDate: v }) }

  async function handleConfirmDispatch(
    orderId: string,
    dispatchId: string,
    productId: string,
  ) {
    if (!db) return;
    const key = `${dispatchId}:${productId}`;
    setConfirmBusyId(key);
    const now = Date.now();
    try {
      await confirmDispatchItem(db, orderId, dispatchId, productId);
      // Update local state directly — no full refresh, no scroll reset
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== orderId) return o;
          const updatedDispatches = (o.dispatches ?? []).map((d) => {
            if (d.id !== dispatchId) return d;
            const updatedItems = d.items.map((it) =>
              it.productId === productId ? { ...it, confirmedAt: now } : it,
            );
            const allConfirmed = updatedItems.every((it) => it.confirmedAt);
            return {
              ...d,
              items: updatedItems,
              receivedAt: allConfirmed ? (d.receivedAt ?? now) : d.receivedAt,
            };
          });
          const confirmedQty: Record<string, number> = {};
          for (const d of updatedDispatches) {
            for (const it of d.items) {
              if (it.confirmedAt)
                confirmedQty[it.productId] =
                  (confirmedQty[it.productId] ?? 0) + it.qty;
            }
          }
          const dispatchedQty: Record<string, number> = {};
          for (const d of updatedDispatches) {
            for (const it of d.items) {
              dispatchedQty[it.productId] =
                (dispatchedQty[it.productId] ?? 0) + it.qty;
            }
          }

          const allFulfilled = o.items.every((it) => {
            const conf = confirmedQty[it.productId] ?? 0;
            if (it.notAvailable) {
              const disp = dispatchedQty[it.productId] ?? 0;
              return conf >= disp;
            }
            return conf >= it.quantity;
          });
          return {
            ...o,
            dispatches: updatedDispatches,
            status: allFulfilled ? "completed" : o.status,
          };
        }),
      );
      showToast("Received dispatch confirmed!", "success");
    } catch {
      // Restore accurate state from the latest snapshot on error
      setOrders(latestOrdersRef.current)
      showToast("Failed to confirm receipt.", "error");
    } finally {
      setConfirmBusyId(null);
    }
  }

  // Real-time subscription — re-subscribes whenever the active shop changes
  const latestOrdersRef = useRef<Order[]>([])
  useEffect(() => {
    if (!db || !user) return;
    setLoading(true);
    setError(null);
    const unsub = subscribeOrdersForShop(
      db,
      effectiveShopName,
      (rows) => {
        latestOrdersRef.current = rows
        setOrders(rows);
        setLoading(false);
      },
      () => {
        setError('Could not load orders.');
        setLoading(false);
      },
    );
    return unsub;
  }, [user, effectiveShopName]);

  const requestorOptions = useMemo(
    () =>
      [
        ...new Set(
          orders
            .map((o) => usersMap[o.shopUserId]?.displayName || o.requestorName)
            .filter(Boolean),
        ),
      ].sort(),
    [orders, usersMap],
  );

  // Fuse.js full-text search index
  const fuse = useMemo(() => new Fuse(orders, {
    keys: [
      { name: 'orderNumber', weight: 2 },
      { name: 'requestorName', weight: 1.5 },
      { name: 'items.name', weight: 1 },
    ],
    threshold: 0.35,
    includeScore: true,
  }), [orders])

  const grouped = useMemo(() => {
    const needle = orderSearch.trim();
    const textMatched = needle
      ? fuse.search(needle).map(r => r.item)
      : orders
    const filtered = textMatched.filter((o) => {
      const reqName = usersMap[o.shopUserId]?.displayName || o.requestorName;
      if (filterRequestor !== "all" && reqName !== filterRequestor)
        return false;

      if (filterKind !== "all" && o.orderKind !== filterKind) return false;
      if (
        filterAwaiting &&
        !(
          o.status === "pending" &&
          (o.dispatches ?? []).some((d) =>
            d.items.some((it) => !it.confirmedAt),
          )
        )
      )
        return false;

      if (filterStartDate) {
        const [y, m, d] = filterStartDate.split("-").map(Number);
        const start = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
        if ((o.createdAt ?? 0) < start) return false;
      }

      if (filterEndDate) {
        const [ey, em, ed] = filterEndDate.split("-").map(Number);
        const end = new Date(ey, em - 1, ed, 23, 59, 59, 999).getTime();
        if ((o.createdAt ?? 0) > end) return false;
      }

      return true;
    });

    const sorted = filtered.sort(
      (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
    );
    return groupByMonth(sorted);
  }, [
    orders,
    orderSearch,
    fuse,
    filterRequestor,
    filterKind,
    filterAwaiting,
    filterStartDate,
    filterEndDate,
    usersMap,
  ]);

  const hasActiveFilters =
    filterRequestor !== "all" ||
    filterKind !== "all" ||
    filterAwaiting ||
    filterStartDate !== "" ||
    filterEndDate !== "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 dark:from-slate-100 dark:to-slate-400 transition-colors duration-200">
            Order history
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400 transition-colors duration-200">
            Track pending and completed orders, compare expected versus actual
            delivery, and print an A4-ready PDF for your records.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Live
        </div>
      </div>

      {/* ── Search + Filter bar ── */}
      <div className="sticky top-[104px] z-20 -mx-4 mb-4 border-b border-slate-200/60 bg-slate-50/80 px-4 py-3 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-950/80 sm:-mx-6 sm:px-6">
      <div className="rounded-xl border-2 border-slate-300 dark:border-slate-700/50 bg-slate-50/80 dark:bg-slate-900/80 transition-colors duration-200 shadow-sm">
        <div className="flex divide-x divide-slate-200 dark:divide-slate-800/50 transition-colors duration-200">
          {/* Filter toggle — wider */}
          <button
            type="button"
            onClick={() => setFilterOpen(!filterOpen)}
            className="flex flex-[2] items-center justify-between px-4 py-3 text-left"
          >
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400 dark:text-slate-500 transition-colors duration-200" />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300 transition-colors duration-200">
                Filters
              </span>
              {hasActiveFilters && (
                <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-xs font-semibold text-white leading-none">
                  {
                    [
                      filterRequestor !== "all",
                      filterKind !== "all",
                      filterAwaiting,
                      filterStartDate !== "",
                      filterEndDate !== "",
                    ].filter(Boolean).length
                  }
                </span>
              )}
            </div>
            <ChevronDown
              className={`h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform ${filterOpen ? "rotate-180" : ""} transition-colors duration-200`}
            />
          </button>

          {/* Full-text search */}
          <div className="relative flex flex-1 items-center px-3">
            {loading ? (
              <div className="pointer-events-none absolute left-6 h-4 w-4 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-700/50 border-t-slate-600" />
            ) : (
              <Search className="pointer-events-none absolute left-6 h-4 w-4 text-slate-400 dark:text-slate-500 transition-colors duration-200" />
            )}
            <input
              type="text"
              placeholder="Search orders, product…"
              aria-label="Search orders"
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              className="w-full bg-transparent py-3 pl-7 pr-7 text-base sm:text-sm text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none transition-colors duration-200"
            />
            {orderSearch && (
              <button
                type="button"
                onClick={() => setOrderSearch('')}
                aria-label="Clear search"
                className="absolute right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {filterOpen && (
          <div className="border-t border-slate-200 dark:border-slate-800/50 px-4 pb-4 pt-3 space-y-3 transition-colors duration-200">
            <div className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors duration-200">
                Requestor
              </span>
              <select
                value={filterRequestor}
                onChange={(e) => setFilterRequestor(e.target.value)}
                aria-label="Filter by requestor"
                className="rounded-lg border border-slate-200 dark:border-slate-800/50 bg-white dark:bg-slate-900 transition-colors duration-200 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="all">All</option>
                {requestorOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors duration-200">
                Type
              </span>
              <div className="flex gap-1.5">
                {(
                  [
                    ["all", "All"],
                    ["unlimited", "Standard"],
                    ["limited", "Limited"],
                    ["factory_dispatch", "Factory sent"],
                  ] as [string, string][]
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setFilterKind(val)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${filterKind === val ? "bg-slate-900 text-white" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-1 ring-slate-200 hover:bg-slate-100"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors duration-200">
                Status
              </span>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 transition-colors duration-200">
                <input
                  type="checkbox"
                  checked={filterAwaiting}
                  onChange={(e) => setFilterAwaiting(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700/50 text-slate-900 dark:text-slate-100 focus:ring-slate-900 transition-colors duration-200"
                />
                Awaiting confirmation
              </label>
            </div>

            <div className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors duration-200">
                Date Range
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  aria-label="Start date"
                  className="w-full sm:w-auto rounded-lg border border-slate-200 dark:border-slate-800/50 bg-white dark:bg-slate-900 transition-colors duration-200 px-2.5 py-1 text-base sm:text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                <span className="text-slate-400 dark:text-slate-500 transition-colors duration-200">
                  to
                </span>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  aria-label="End date"
                  className="w-full sm:w-auto rounded-lg border border-slate-200 dark:border-slate-800/50 bg-white dark:bg-slate-900 transition-colors duration-200 px-2.5 py-1 text-base sm:text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            {hasActiveFilters && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setFilterRequestor("all");
                    setFilterKind("all");
                    setFilterAwaiting(false);
                    setFilterStartDate("");
                    setFilterEndDate("");
                  }}
                  className="text-xs font-medium text-rose-600 hover:text-rose-700"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 px-4 py-3 ring-1 ring-rose-200 dark:ring-rose-800/50">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <p className="text-sm text-rose-800 dark:text-rose-300">{error}
        </p>
        </div>
      ) : null}

      {loading ? (
        <OrderCardsSkeleton count={3} />
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description="Place your first order in the 'New Order' tab to start your history!"
          variant="warehouse"
        />
      ) : grouped.length === 0 ? (
        <EmptyState
          title="No matching orders"
          description="No orders match your current filters. Try adjusting search parameters or clearing filters."
          variant="search"
          actionLabel="Clear all filters"
          onAction={() => {
            setFilterRequestor("all");
            setFilterKind("all");
            setFilterAwaiting(false);
            setFilterStartDate("");
            setFilterEndDate("");
            setOrderSearch("");
          }}
        />
      ) : (
        <div className="space-y-8">
          {grouped.map(({ label, orders: groupOrders }) => (
            <div key={label}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 transition-colors duration-200">
                  {label}
                </h2>
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400 transition-colors duration-200">
                  {groupOrders.length}
                </span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <div className="space-y-3">
                {groupOrders.map((o) => {
                  const open = openId === o.id;
                  return (
                    <Card
                      key={o.id}
                      id={o.id}
                      className={`p-0 ${o.status === "pending" && (o.dispatches ?? []).some((d) => d.items.some((it) => !it.confirmedAt)) ? "border-l-4 !border-l-rose-500" : ""}`}
                    >
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                        onClick={() => setOpenId(open ? null : o.id)}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-200">
                              {o.orderKind === "factory_dispatch"
                                ? "Factory-sent order"
                                : o.orderKind === "limited"
                                  ? "Limited stock"
                                  : "Standard catalogue"}
                            </p>
                            {o.orderNumber && (
                              <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-mono font-semibold text-slate-600 dark:text-slate-400 transition-colors duration-200">
                                #{o.orderNumber}
                              </span>
                            )}
                            <Badge
                              tone={
                                o.status === "completed" ? "success" : "warning"
                              }
                            >
                              {o.status === "completed"
                                ? "Completed"
                                : "Pending"}
                            </Badge>
                            {(usersMap[o.shopUserId]?.displayName ||
                              o.requestorName) && (
                              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
                                {
                                  (
                                    usersMap[o.shopUserId]?.displayName ||
                                    o.requestorName
                                  ).split(" ")[0]
                                }
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">
                            Placed {formatDateTime(o.createdAt)} ·{" "}
                            {o.items.length} lines
                          </p>
                        </div>
                        {open ? (
                          <ChevronDown className="h-5 w-5 shrink-0" />
                        ) : (
                          <ChevronRight className="h-5 w-5 shrink-0" />
                        )}
                      </button>

                      <AnimatePresence initial={false}>
                        {open && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="space-y-4 border-t border-slate-100 dark:border-slate-800/50 px-4 py-3 transition-colors duration-200">
                              {/* Timeline */}
                              <VisualTimeline order={o} usersMap={usersMap} />

                          {/* Dispatches */}
                          {(o.dispatches ?? []).length > 0 && (
                            <div className="rounded-xl border border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/50 p-4 space-y-2 transition-colors duration-200">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3 transition-colors duration-200">
                                Dispatches
                              </p>
                              {(o.dispatches ?? []).map((d, i) => (
                                <div
                                  key={d.id}
                                  className="rounded-lg border border-slate-200 dark:border-slate-800/50 bg-white dark:bg-slate-900 transition-colors duration-200 p-3 space-y-2"
                                >
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200">
                                      Dispatch {i + 1} ·{" "}
                                      {format(d.dispatchedAt, "dd MMM yyyy")}
                                    </span>
                                    {d.receivedAt ? (
                                      <span className="text-emerald-600 font-medium">
                                        ✓ All received
                                      </span>
                                    ) : (
                                      <span className="text-amber-600 font-medium">
                                        Confirm items below
                                      </span>
                                    )}
                                  </div>
                                  {d.items.map((it) => {
                                    const key = `${d.id}:${it.productId}`;
                                    const originalItem = o.items.find((oi) => oi.productId === it.productId);
                                    const unit = (originalItem as any)?.unit || ((originalItem as any)?.source === 'limited' || o.orderKind === 'limited' ? 'pcs' : 'box');
                                    return (
                                      <div
                                        key={it.productId}
                                        className="flex items-center justify-between gap-3 text-xs"
                                      >
                                        <div className="min-w-0">
                                          <span className="font-medium text-slate-800 dark:text-slate-200 transition-colors duration-200">
                                            {it.name}
                                            {it.size ? ` · ${it.size}` : ""}
                                          </span>
                                          <span className="ml-2 font-semibold tabular-nums text-slate-600 dark:text-slate-400 transition-colors duration-200">
                                            ×{it.qty} {unit}
                                          </span>
                                        </div>
                                        {it.confirmedAt ? (
                                          <span className="shrink-0 text-emerald-600 font-medium">
                                            ✓ Received{" "}
                                            {format(it.confirmedAt, "dd MMM")}
                                          </span>
                                        ) : (
                                          <Button
                                            variant="secondary"
                                            className="!py-1 !text-base sm:!text-xs shrink-0"
                                            disabled={confirmBusyId === key}
                                            onClick={() =>
                                              void handleConfirmDispatch(
                                                o.id,
                                                d.id,
                                                it.productId,
                                              )
                                            }
                                          >
                                            {confirmBusyId === key
                                              ? "Confirming…"
                                              : "Confirm receipt"}
                                          </Button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Delivery info */}
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 p-3 transition-colors duration-200">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 transition-colors duration-200">
                                Requestor
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-200">
                                {usersMap[o.shopUserId]?.displayName ||
                                  o.requestorName}
                              </p>
                              <p className="text-xs text-slate-600 dark:text-slate-400 transition-colors duration-200">
                                {o.requestorEmail}
                              </p>
                            </div>
                            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 p-3 transition-colors duration-200">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 transition-colors duration-200">
                                Delivery
                              </p>
                              <p className="mt-1 text-sm text-slate-900 dark:text-slate-100 transition-colors duration-200">
                                Expected:{" "}
                                <span className="font-semibold">
                                  {formatDate(o.expectedDeliveryDate)}
                                </span>
                              </p>
                              <p className="text-sm text-slate-900 dark:text-slate-100 transition-colors duration-200">
                                Actual:{" "}
                                <span className="font-semibold">
                                  {formatDate(o.actualDeliveryDate)}
                                </span>
                              </p>
                            </div>
                          </div>

                          {o.status === "completed" && (
                            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 p-3 transition-colors duration-200">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 transition-colors duration-200">
                                Lead time
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-200">
                                {fulfillmentSummary(o)}
                              </p>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="secondary"
                              onClick={async () => {
                                setPdfBusyId(o.id);
                                try {
                                  await previewOrderPdf(
                                    o,
                                    usersMap[o.shopUserId]?.displayName,
                                  );
                                } finally {
                                  setPdfBusyId(null);
                                }
                              }}
                              disabled={pdfBusyId === o.id}
                            >
                              <Printer className="h-4 w-4" />
                              {pdfBusyId === o.id ? "Preparing…" : "Print"}
                            </Button>

                            {(o.status === "pending" || profile?.isAdmin) && (
                              <Button
                                variant="danger"
                                onClick={() => setDeleteTarget(o)}
                              >
                                <Trash2 className="h-4 w-4" />
                                {o.status === "pending" && !profile?.isAdmin
                                  ? "Cancel order"
                                  : "Delete order"}
                              </Button>
                            )}
                          </div>

                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 transition-colors duration-200">
                              Lines
                            </p>
                            <ul className="mt-2 divide-y divide-slate-200 dark:divide-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800/50 transition-colors duration-200">
                              {o.items.map((it, idx) => (
                                <li
                                  key={`${it.productId}-${idx}`}
                                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span
                                      className={`truncate text-slate-900 dark:text-slate-100 ${it.notAvailable ? "line-through text-slate-400" : ""} transition-colors duration-200`}
                                    >
                                      {it.name}
                                      {it.size ? ` · ${it.size}` : ""}
                                    </span>
                                    {it.notAvailable && (
                                      <Badge tone="neutral">
                                        Not Available
                                      </Badge>
                                    )}
                                  </div>
                                  <span className="shrink-0 font-semibold tabular-nums text-slate-900 dark:text-slate-100 transition-colors duration-200">
                                    ×{it.quantity} {(it as any).unit || ((it as any)?.source === 'limited' || o.orderKind === 'limited' ? 'pcs' : 'box')}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(deleteTarget)}
        title="Delete order?"
        onClose={() => {
          if (!deleteBusy) setDeleteTarget(null);
        }}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              disabled={deleteBusy}
              onClick={() => setDeleteTarget(null)}
            >
              Keep order
            </Button>
            <Button
              variant="danger"
              disabled={deleteBusy}
              onClick={async () => {
                if (!db || !deleteTarget) return;
                setDeleteBusy(true);
                setError(null);
                try {
                  await deleteOrder(db, deleteTarget.id);
                  setDeleteTarget(null);
                  showToast("Order deleted successfully!", "success");
                  if (openId === deleteTarget.id) setOpenId(null);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Could not delete order.",
                  );
                  setDeleteTarget(null);
                  showToast("Failed to delete order.", "error");
                } finally {
                  setDeleteBusy(false);
                }
              }}
            >
              {deleteBusy ? "Deleting…" : "Yes, delete"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-700 dark:text-slate-300 transition-colors duration-200">
          This will permanently remove the order placed on{" "}
          <span className="font-semibold">
            {formatDateTime(deleteTarget?.createdAt)}
          </span>{" "}
          with {deleteTarget?.items.length} line
          {deleteTarget?.items.length === 1 ? "" : "s"}.
        </p>
      </Modal>
    </motion.div>
  );
}