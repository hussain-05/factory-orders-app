import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { format } from "date-fns";
import type { Order, OrderDispatch } from "../types/models";

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 40,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#0f172a",
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 12,
    marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  meta: { fontSize: 9, color: "#475569" },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 4,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingVertical: 6,
    fontWeight: 700,
    fontSize: 9,
  },
  cellName: { width: "50%" },
  cellSize: { width: "15%" },
  cellUnit: { width: "10%" },
  cellQty: { width: "10%", textAlign: "right" },
  cellDispatched: { width: "15%", textAlign: "right" },
  cellCheck: { width: "10%", alignItems: "center" },
  rowItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    fontSize: 9,
  },
  checkbox: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: "#64748b",
  },
  dispatchCard: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
    padding: 8,
  },
  dispatchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
    fontSize: 9,
    fontWeight: 700,
  },
  dispatchItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 9,
    paddingVertical: 2,
    color: "#334155",
  },
  footer: { marginTop: 16, fontSize: 8, color: "#64748b" },
});

function dispatchedQtyByProduct(
  dispatches: OrderDispatch[],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const d of dispatches) {
    for (const it of d.items) {
      map[it.productId] = (map[it.productId] ?? 0) + it.qty;
    }
  }
  return map;
}

function confirmedQtyByProduct(
  dispatches: OrderDispatch[],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const d of dispatches) {
    for (const it of d.items) {
      if (it.confirmedAt) {
        map[it.productId] = (map[it.productId] ?? 0) + it.qty;
      }
    }
  }
  return map;
}

export function OrderPdfDocument({
  order,
  requestorName,
}: {
  order: Order;
  requestorName?: string;
}) {
  const created = order.createdAt
    ? format(order.createdAt, "dd MMM yyyy, HH:mm")
    : "—";
  const expected = order.expectedDeliveryDate
    ? format(order.expectedDeliveryDate, "dd MMM yyyy")
    : "—";
  const dispatches = order.dispatches ?? [];
  const hasDispatches = dispatches.length > 0;
  const isFactoryCreated =
    Boolean(order.createdByFactory) || order.orderKind === "factory_dispatch";
  const orderKindLabel = isFactoryCreated
    ? "Factory dispatch"
    : order.orderKind === "limited"
      ? "Limited stock"
      : "Standard catalogue";
  const displayRequestorName = isFactoryCreated
    ? order.requestorName
    : requestorName || order.requestorName;
  const dispQty = dispatchedQtyByProduct(dispatches);
  const confQty = confirmedQtyByProduct(dispatches);

  return (
    <Document title={`Factory_Orders_${order.orderNumber || order.id}`}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{isFactoryCreated ? "Factory dispatch order" : "Factory order"}</Text>
          <Text style={styles.meta}>
            {order.orderNumber ? `#${order.orderNumber} · ` : ""}
            {orderKindLabel}
          </Text>
          <Text style={styles.meta}>Shop: {order.shopName}</Text>
          {isFactoryCreated ? (
            <>
              <Text style={styles.meta}>Created by: Factory</Text>
              <Text style={styles.meta}>
                Received by: {displayRequestorName} ({order.requestorEmail})
              </Text>
            </>
          ) : (
            <Text style={styles.meta}>
              Requested by: {displayRequestorName} ({order.requestorEmail})
            </Text>
          )}
          <Text style={styles.meta}>Placed: {created}</Text>
          <Text style={styles.meta}>
            Expected delivery: {expected} · Status: {order.status}
          </Text>
        </View>

        {/* Items ordered (Fulfillment summary) */}
        <Text style={styles.sectionTitle}>Items ordered</Text>
        <View style={styles.tableHeader}>
          <Text style={styles.cellName}>Item</Text>
          <Text style={styles.cellQty}>Ordered</Text>
          <Text style={styles.cellDispatched}>Dispatched</Text>
          <Text style={{ width: "15%", textAlign: "right" }}>Confirmed</Text>
        </View>
        {order.items.map((it, idx) => {
          const dispatched = dispQty[it.productId] ?? 0;
          const confirmed = confQty[it.productId] ?? 0;
          const unit =
            (it as any).unit || (order.orderKind === "limited" ? "pcs" : "box");
          return (
            <View
              key={`sum-${it.productId}-${idx}`}
              style={styles.rowItem}
              wrap={false}
            >
              <View style={styles.cellName}>
                <Text
                  style={
                    it.notAvailable
                      ? { textDecoration: "line-through", color: "#94a3b8" }
                      : {}
                  }
                >
                  {it.name}
                  {it.size ? ` · ${it.size}` : ""}
                </Text>
                {it.notAvailable && (
                  <Text style={{ fontSize: 8, color: "#64748b", marginTop: 2 }}>
                    Not Available: {it.quantity - dispatched} {unit}
                  </Text>
                )}
              </View>
              <Text style={styles.cellQty}>
                {String(it.quantity)} {unit}
              </Text>
              <Text
                style={{
                  ...styles.cellDispatched,
                  color: dispatched >= it.quantity ? "#16a34a" : "#d97706",
                }}
              >
                {String(dispatched)} {unit}
              </Text>
              <Text
                style={{
                  width: "15%",
                  textAlign: "right",
                  color: confirmed >= it.quantity ? "#16a34a" : "#d97706",
                }}
              >
                {String(confirmed)} {unit}
              </Text>
            </View>
          );
        })}

        {/* Dispatches */}
        {hasDispatches && (
          <View>
            <Text style={styles.sectionTitle}>Dispatches</Text>
            {dispatches.map((d, i) => (
              <View key={d.id} style={styles.dispatchCard} wrap={false}>
                <View style={styles.dispatchHeader}>
                  <Text>
                    Dispatch {i + 1} — {format(d.dispatchedAt, "dd MMM yyyy")}
                  </Text>
                  <Text style={{ color: d.receivedAt ? "#16a34a" : "#d97706" }}>
                    {d.receivedAt
                      ? `All confirmed ${format(d.receivedAt, "dd MMM")}`
                      : "Awaiting confirmation"}
                  </Text>
                </View>
                {d.items.map((it) => (
                  <View key={it.productId} style={styles.dispatchItem}>
                    <Text>
                      {it.name}
                      {it.size ? ` · ${it.size}` : ""}
                    </Text>
                    <Text>
                      {`×${it.qty}  ${it.confirmedAt ? `Confirmed ${format(it.confirmedAt, "dd MMM")}` : "Pending"}`}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footer}>Generated from Seva Factory Orders.</Text>
      </Page>
    </Document>
  );
}
