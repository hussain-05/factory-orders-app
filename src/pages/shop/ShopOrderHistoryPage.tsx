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
  closeOrderFromPortal,
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

function triggerConfetti(clientX: number, clientY: number) {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.pointerEvents = 'none';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = '100vw';
  container.style.height = '100vh';
  container.style.zIndex = '9999';
  document.body.appendChild(container);

  const colors = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6'];
  const particleCount = 40;

  for (let i = 0; i < particleCount; i++) {
    const p = document.createElement('div');
    p.style.position = 'absolute';
    p.style.left = `${clientX}px`;
    p.style.top = `${clientY}px`;
    p.style.width = `${Math.random() * 6 + 4}px`;
    p.style.height = `${Math.random() * 6 + 4}px`;
    p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    container.appendChild(p);

    const angle = Math.random() * Math.PI * 2;
    const velocity = Math.random() * 8 + 4;
    let vx = Math.cos(angle) * velocity;
    let vy = Math.sin(angle) * velocity - 2;
    let px = clientX;
    let py = clientY;
    let rotation = Math.random() * 360;
    let rotSpeed = (Math.random() - 0.5) * 15;

    let frames = 0;
    const maxFrames = 60 + Math.random() * 40;

    function update() {
      frames++;
      px += vx;
      py += vy;
      vy += 0.25;
      vx *= 0.96;
      vy *= 0.96;
      rotation += rotSpeed;

      p.style.left = `${px}px`;
      p.style.top = `${py}px`;
      p.style.transform = `rotate(${rotation}deg)`;
      p.style.opacity = `${(maxFrames - frames) / maxFrames}`;

      if (frames < maxFrames) {
        requestAnimationFrame(update);
      } else {
        p.remove();
      }
    }
    requestAnimationFrame(update);
  }

  setTimeout(() => {
    container.remove();
  }, 3000);
}

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

  const [closeBusyId, setCloseBusyId] = useState<string | null>(null);

  async function handleConfirmDispatch(
    orderId: string,
    dispatchId: string,
    productId: string,
    clientX: number,
    clientY: number,
    isMissing?: boolean,
  ) {
    if (!db) return;
    const key = `${dispatchId}:${productId}`;
    setConfirmBusyId(key);
    const now = Date.now();
    
    // Synchronously check if this click completes the dispatch
    let newlyFullyConfirmed = false;
    const order = orders.find(o => o.id === orderId);
    const dispatch = order?.dispatches?.find(d => d.id === dispatchId);
    if (dispatch) {
      const unconfirmed = dispatch.items.filter(it => !it.confirmedAt);
      if (unconfirmed.length === 1 && unconfirmed[0].productId === productId) {
        newlyFullyConfirmed = true;
      }
    }

    try {
      await confirmDispatchItem(db, orderId, dispatchId, productId, isMissing);
      // Update local state directly — no full refresh, no scroll reset
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== orderId) return o;
          const updatedDispatches = (o.dispatches ?? []).map((d) => {
            if (d.id !== dispatchId) return d;
            const updatedItems = d.items.map((it) =>
              it.productId === productId ? { ...it, confirmedAt: isMissing ? -1 : now } : it,
            );
            const allConfirmed = updatedItems.every((it) => it.confirmedAt !== null && it.confirmedAt !== undefined);
            return {
              ...d,
              items: updatedItems,
              receivedAt: allConfirmed ? (d.receivedAt ?? now) : d.receivedAt,
            };
          });
          const confirmedQty: Record<string, number> = {};
          for (const d of updatedDispatches) {
            for (const it of d.items) {
              if (it.confirmedAt && it.confirmedAt > 0)
                confirmedQty[it.productId] =
                  (confirmedQty[it.productId] ?? 0) + it.qty;
            }
          }
          const dispatchedQty: Record<string, number> = {};
          for (const d of updatedDispatches) {
            for (const it of d.items) {
              if (it.confirmedAt !== -1)
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
      showToast(isMissing ? "Item marked as missing." : "Received dispatch confirmed!", "success");
      if (newlyFullyConfirmed && !isMissing) {
        triggerConfetti(clientX, clientY);
      }
    } catch {
      // Restore accurate state from the latest snapshot on error
      setOrders(latestOrdersRef.current)
      showToast("Failed to confirm receipt.", "error");
    } finally {
      setConfirmBusyId(null);
    }
  }

  async function handleCloseOrder(orderId: string) {
    if (!db || !user) return;
    const confirmClose = window.confirm("Are you sure you want to close this order? Any outstanding items not yet delivered will be cancelled and stock will be restored.");
    if (!confirmClose) return;

    setCloseBusyId(orderId);
    try {
      await closeOrderFromPortal(db, orderId, {
        uid: user.uid,
        displayName: profile?.displayName || user.displayName || user.email || "Shopkeeper",
        email: user.email || ""
      }, 'shop');
      showToast("Order closed successfully!", "success");
    } catch (err) {
      showToast("Failed to close order.", "error");
    } finally {
      setCloseBusyId(null);
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
        <div className="space-y-3">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800/50 dark:bg-slate-900/60 transition-colors duration-200">
              {loading ? (
                <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-700/50 border-t-slate-600" />
              ) : (
                <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              )}
              <input
                type="text"
                placeholder="Search orders, product…"
                aria-label="Search orders"
                value={orderSearch}
                onChange={e => setOrderSearch(e.target.value)}
                className="w-full bg-transparent py-2.5 pl-10 pr-10 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none transition-colors duration-200"
              />
              {orderSearch && (
                <button
                  type="button"
                  onClick={() => setOrderSearch('')}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setFilterOpen(!filterOpen)}
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold shadow-sm transition duration-200 ${
                filterOpen || hasActiveFilters
                  ? 'border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-950/20 dark:text-emerald-400'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800/50 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              <Filter className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Filters</span>
              {hasActiveFilters && (
                <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white dark:bg-emerald-500 shrink-0">
                  {
                    [
                      filterRequestor !== 'all',
                      filterKind !== 'all',
                      filterAwaiting,
                      filterStartDate !== '',
                      filterEndDate !== '',
                    ].filter(Boolean).length
                  }
                </span>
              )}
            </button>
          </div>

          <AnimatePresence>
            {filterOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="rounded-xl border border-slate-100 bg-white dark:border-slate-800/60 dark:bg-slate-900/80 backdrop-blur-md p-4 shadow-md transition duration-200 space-y-4"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                  {/* Requestor filter */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Requestor
                    </label>
                    <select
                      value={filterRequestor}
                      onChange={e => setFilterRequestor(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white py-1.5 px-2.5 text-xs font-semibold text-slate-700 focus:outline-none dark:border-slate-800/50 dark:bg-slate-900 dark:text-slate-300 transition-colors duration-200"
                    >
                      <option value="all">All Requestors</option>
                      {requestorOptions.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Order type filter */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Order Type
                    </label>
                    <select
                      value={filterKind}
                      onChange={e => setFilterKind(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white py-1.5 px-2.5 text-xs font-semibold text-slate-700 focus:outline-none dark:border-slate-800/50 dark:bg-slate-900 dark:text-slate-300 transition-colors duration-200"
                    >
                      <option value="all">All Types</option>
                      <option value="unlimited">Standard</option>
                      <option value="limited">Limited</option>
                      <option value="factory_dispatch">Factory Sent</option>
                    </select>
                  </div>

                  {/* Status filter */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Status
                    </label>
                    <select
                      value={filterAwaiting ? 'awaiting' : 'all'}
                      onChange={e => setFilterAwaiting(e.target.value === 'awaiting')}
                      className="w-full rounded-lg border border-slate-200 bg-white py-1.5 px-2.5 text-xs font-semibold text-slate-700 focus:outline-none dark:border-slate-800/50 dark:bg-slate-900 dark:text-slate-300 transition-colors duration-200"
                    >
                      <option value="all">All Statuses</option>
                      <option value="awaiting">Awaiting Confirmation</option>
                    </select>
                  </div>

                  {/* Date range filter */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Date Range
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        value={filterStartDate}
                        onChange={e => setFilterStartDate(e.target.value)}
                        aria-label="Start date"
                        className="w-full rounded-lg border border-slate-200 bg-white py-1 px-1.5 text-[11px] font-medium text-slate-600 focus:outline-none dark:border-slate-800/50 dark:bg-slate-900 dark:text-slate-300 transition-colors duration-200"
                      />
                      <span className="text-[10px] text-slate-400 uppercase font-bold shrink-0">to</span>
                      <input
                        type="date"
                        value={filterEndDate}
                        onChange={e => setFilterEndDate(e.target.value)}
                        aria-label="End date"
                        className="w-full rounded-lg border border-slate-200 bg-white py-1 px-1.5 text-[11px] font-medium text-slate-600 focus:outline-none dark:border-slate-800/50 dark:bg-slate-900 dark:text-slate-300 transition-colors duration-200"
                      />
                    </div>
                  </div>
                </div>

                {/* Tags & Clear all actions */}
                <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/50 pt-2.5">
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">
                      Active filters
                    </span>
                    {filterRequestor !== 'all' && (
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        Req: {filterRequestor}
                        <button type="button" onClick={() => setFilterRequestor('all')} className="text-slate-400 hover:text-slate-600"><X className="h-2.5 w-2.5" /></button>
                      </span>
                    )}
                    {filterKind !== 'all' && (
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        Type: {filterKind === 'unlimited' ? 'Standard' : filterKind === 'limited' ? 'Limited' : 'Factory sent'}
                        <button type="button" onClick={() => setFilterKind('all')} className="text-slate-400 hover:text-slate-600"><X className="h-2.5 w-2.5" /></button>
                      </span>
                    )}
                    {filterAwaiting && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
                        Awaiting Confirmation
                        <button type="button" onClick={() => setFilterAwaiting(false)} className="text-amber-400 hover:text-amber-600"><X className="h-2.5 w-2.5" /></button>
                      </span>
                    )}
                    {filterStartDate && (
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        From: {filterStartDate}
                        <button type="button" onClick={() => setFilterStartDate('')} className="text-slate-400 hover:text-slate-600"><X className="h-2.5 w-2.5" /></button>
                      </span>
                    )}
                    {filterEndDate && (
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        To: {filterEndDate}
                        <button type="button" onClick={() => setFilterEndDate('')} className="text-slate-400 hover:text-slate-600"><X className="h-2.5 w-2.5" /></button>
                      </span>
                    )}
                    {!hasActiveFilters && (
                      <span className="text-[10px] font-medium text-slate-400 italic">None</span>
                    )}
                  </div>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterRequestor('all');
                        setFilterKind('all');
                        setFilterAwaiting(false);
                        setFilterStartDate('');
                        setFilterEndDate('');
                      }}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-700 transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
                                    {(() => {
                                      if (!d.receivedAt) {
                                        return (
                                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 animate-pulse">
                                            🚚 In transit
                                          </span>
                                        );
                                      }

                                      const statuses = d.items.map((it) => it.confirmedAt);
                                      const allNotReceived = statuses.every((s) => s === -1);
                                      const someNotReceived = statuses.some((s) => s === -1);

                                      if (allNotReceived) {
                                        return (
                                          <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/20 dark:text-rose-400">
                                            ❌ Not received
                                          </span>
                                        );
                                      }
                                      if (someNotReceived) {
                                        return (
                                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
                                            ⚠ Partially received
                                          </span>
                                        );
                                      }
                                      return (
                                        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400">
                                          ✓ Fully received
                                        </span>
                                      );
                                    })()}
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
                                          it.confirmedAt === -1 ? (
                                            <div className="flex items-center gap-2 shrink-0">
                                              <span className="text-[10px] text-rose-500 font-semibold transition-colors">
                                                ✗ Not Received
                                              </span>
                                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white shadow-sm">
                                                ✗
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="flex items-center gap-2 shrink-0">
                                              <span className="text-[10px] text-slate-400 dark:text-slate-500 transition-colors">
                                                Received {format(it.confirmedAt, "dd MMM")}
                                              </span>
                                              <motion.div
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                                className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white shadow-sm"
                                              >
                                                ✓
                                              </motion.div>
                                            </div>
                                          )
                                        ) : (
                                          <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                              type="button"
                                              disabled={confirmBusyId === key}
                                              onClick={(e) =>
                                                void handleConfirmDispatch(
                                                  o.id,
                                                  d.id,
                                                  it.productId,
                                                  e.clientX,
                                                  e.clientY,
                                                )
                                              }
                                              className="group flex h-6 w-6 items-center justify-center rounded-full border-2 border-emerald-500/30 dark:border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/10 hover:border-emerald-500 dark:hover:border-emerald-400 hover:bg-emerald-500/10 transition shrink-0"
                                              title="Confirm receipt of this item"
                                            >
                                              {confirmBusyId === key ? (
                                                <div className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                                              ) : (
                                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                                  ✓
                                                </span>
                                              )}
                                            </button>
                                            <button
                                              type="button"
                                              disabled={confirmBusyId === key}
                                              onClick={() =>
                                                void handleConfirmDispatch(
                                                  o.id,
                                                  d.id,
                                                  it.productId,
                                                  0,
                                                  0,
                                                  true,
                                                )
                                              }
                                              className="group flex h-6 w-6 items-center justify-center rounded-full border-2 border-rose-500/30 dark:border-rose-500/20 bg-rose-50/50 dark:bg-rose-950/10 hover:border-rose-500 dark:hover:border-rose-400 hover:bg-rose-500/10 transition shrink-0"
                                              title="Report not received / missing"
                                            >
                                              <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                                                ✗
                                              </span>
                                            </button>
                                          </div>
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
                            <div className="space-y-3">
                              {o.closedBy && (
                                <div className="rounded-xl bg-rose-50/50 dark:bg-rose-900/10 p-3 border border-rose-100 dark:border-rose-900/30 transition-colors duration-200">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-500 transition-colors duration-200">
                                    {o.closedBy.uid === 'system'
                                      ? 'Auto-Cleaned (Reordered)'
                                      : o.closedBy.role === 'factory'
                                        ? 'Cancelled by Factory'
                                        : 'Closed by Shop'}
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-200">
                                    {o.closedBy.uid === 'system'
                                      ? 'Closed automatically because remaining items were reordered'
                                      : o.closedBy.role === 'factory'
                                        ? `Cancelled by Factory Manager (${o.closedBy.name})`
                                        : `Closed by Shopkeeper (${o.closedBy.name})`}
                                  </p>
                                  <p className="text-xs text-slate-600 dark:text-slate-400 transition-colors duration-200">
                                    Finalized on {formatDateTime(o.closedBy.timestamp)}
                                  </p>
                                </div>
                              )}
                              <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 p-3 transition-colors duration-200">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 transition-colors duration-200">
                                  Lead time
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-200">
                                  {fulfillmentSummary(o)}
                                </p>
                              </div>
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

                            {o.status === "pending" && (
                              <Button
                                variant="secondary"
                                className="!border-amber-500 !text-amber-600 dark:!text-amber-500 hover:!bg-amber-50 dark:hover:!bg-amber-950/10 shrink-0"
                                disabled={closeBusyId === o.id}
                                onClick={() => void handleCloseOrder(o.id)}
                              >
                                {closeBusyId === o.id ? "Closing…" : "✗ Close Order"}
                              </Button>
                            )}

                            {profile?.isAdmin && (
                              <Button
                                variant="danger"
                                onClick={() => setDeleteTarget(o)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete order
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
                                        {it.cancelledReason ? it.cancelledReason : "Not Available"}
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