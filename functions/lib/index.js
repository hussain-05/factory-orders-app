"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onOrderUpdate = exports.onNewOrder = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();
// ── Helper: convert Firestore Timestamp or plain ms number → ms ──────────────
function toMs(val) {
    if (!val)
        return null;
    if (typeof val === 'number')
        return val;
    if (typeof val.toMillis === 'function')
        return val.toMillis();
    return null;
}
// ── Helper: send multicast and silently remove stale tokens ──────────────────
async function sendToTokens(tokens, notification) {
    if (tokens.length === 0)
        return;
    const response = await messaging.sendEachForMulticast({ tokens, notification });
    const stale = [];
    response.responses.forEach((r, i) => {
        if (!r.success &&
            r.error &&
            (r.error.code === 'messaging/registration-token-not-registered' ||
                r.error.code === 'messaging/invalid-registration-token')) {
            stale.push(tokens[i]);
        }
    });
    if (stale.length > 0) {
        const usersWithStale = await db
            .collection('users')
            .where('fcmTokens', 'array-contains-any', stale)
            .get();
        const batch = db.batch();
        usersWithStale.docs.forEach((doc) => {
            batch.update(doc.ref, {
                fcmTokens: admin.firestore.FieldValue.arrayRemove(...stale),
            });
        });
        await batch.commit();
    }
}
// ── Trigger 1: New order placed → notify all factory users ───────────────────
exports.onNewOrder = functions.firestore
    .document('orders/{orderId}')
    .onCreate(async (snap) => {
    const order = snap.data();
    if (!order)
        return;
    const factoryUsers = await db
        .collection('users')
        .where('role', '==', 'factory')
        .get();
    const tokens = [];
    factoryUsers.docs.forEach((doc) => {
        const t = doc.data().fcmTokens || [];
        tokens.push(...t);
    });
    const kindLabel = order.orderKind === 'limited' ? 'limited stock' : 'standard';
    const itemCount = (order.items || []).length;
    await sendToTokens(tokens, {
        title: `New order from ${order.shopName}`,
        body: `${itemCount} item${itemCount === 1 ? '' : 's'} · ${kindLabel} order by ${order.requestorName}`,
    });
});
// ── Trigger 2: Milestone updated → notify the shop user ──────────────────────
exports.onOrderUpdate = functions.firestore
    .document('orders/{orderId}')
    .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (!before || !after)
        return;
    const receivedNow = !before.milestones?.receivedAt && after.milestones?.receivedAt;
    const completedNow = before.status !== 'completed' && after.status === 'completed';
    if (!receivedNow && !completedNow)
        return;
    // Deduplicate using event ID to prevent double-firing
    const eventId = context.eventId;
    const dedupRef = db.collection('_fcmDedup').doc(eventId);
    const dedupSnap = await dedupRef.get();
    if (dedupSnap.exists)
        return;
    await dedupRef.set({ processedAt: admin.firestore.FieldValue.serverTimestamp() });
    const userSnap = await db.collection('users').doc(after.shopUserId).get();
    const tokens = userSnap.data()?.fcmTokens || [];
    if (completedNow) {
        await sendToTokens(tokens, {
            title: 'Order delivered ✓',
            body: `Your order from ${after.shopName} has been marked as delivered.`,
        });
    }
    else if (receivedNow) {
        const expectedMs = toMs(after.expectedDeliveryDate);
        const expected = expectedMs
            ? new Date(expectedMs).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
            })
            : null;
        await sendToTokens(tokens, {
            title: 'Order received by factory',
            body: expected
                ? `Your order is being processed. Expected delivery: ${expected}`
                : 'Your order has been received and is being processed.',
        });
    }
});
//# sourceMappingURL=index.js.map