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
    const uniqueTokens = Array.from(new Set(tokens.filter(Boolean)));
    if (uniqueTokens.length === 0)
        return;
    // Send as data-only (no notification field) so the OS never auto-displays it.
    // The service worker handles background display; onMessage handles foreground.
    const response = await messaging.sendEachForMulticast({
        tokens: uniqueTokens,
        data: {
            title: notification.title,
            body: notification.body,
        },
    });
    const stale = [];
    response.responses.forEach((r, i) => {
        if (!r.success &&
            r.error &&
            (r.error.code === 'messaging/registration-token-not-registered' ||
                r.error.code === 'messaging/invalid-registration-token')) {
            stale.push(uniqueTokens[i]);
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
// ── Trigger 1: New order placed ──────────────────────────────────────────────
exports.onNewOrder = functions.firestore
    .document('orders/{orderId}')
    .onCreate(async (snap) => {
    const order = snap.data();
    if (!order)
        return;
    if (order.orderKind === 'factory_dispatch') {
        const userSnap = await db.collection('users').doc(order.shopUserId).get();
        const tokens = userSnap.data()?.fcmTokens || [];
        const itemCount = (order.items || []).length;
        await sendToTokens(tokens, {
            title: 'Extra stock sent by factory',
            body: `${itemCount} item${itemCount === 1 ? '' : 's'} have been dispatched to ${order.shopName}. Please confirm receipt after delivery.`,
        });
        return;
    }
    const [factoryUsers, factoryStaffUsers] = await Promise.all([
        db.collection('users').where('role', '==', 'factory').get(),
        db.collection('users').where('role', '==', 'factory_staff').get(),
    ]);
    const tokens = [];
    [...factoryUsers.docs, ...factoryStaffUsers.docs].forEach((doc) => {
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
    const beforeDispatches = before.dispatches || [];
    const afterDispatches = after.dispatches || [];
    const dispatchAdded = afterDispatches.length > beforeDispatches.length;
    const dateChangedLater = !receivedNow && before.expectedDeliveryDate !== after.expectedDeliveryDate && after.expectedDeliveryDate;
    if (!receivedNow && !completedNow && !dispatchAdded && !dateChangedLater)
        return;
    // Deduplicate using event ID to prevent double-firing
    const eventId = context.eventId;
    const dedupRef = db.collection('_fcmDedup').doc(eventId);
    const dedupSnap = await dedupRef.get();
    if (dedupSnap.exists)
        return;
    await dedupRef.set({ processedAt: admin.firestore.FieldValue.serverTimestamp() });
    // Fetch shop tokens to notify shop user
    const userSnap = await db.collection('users').doc(after.shopUserId).get();
    const shopTokens = userSnap.data()?.fcmTokens || [];
    // 1. Notify shop user when dispatch is sent
    if (dispatchAdded) {
        const newDispatches = afterDispatches.filter((ad) => !beforeDispatches.some((bd) => bd.id === ad.id));
        if (newDispatches.length > 0) {
            const itemsCount = newDispatches.reduce((acc, d) => acc + (d.items || []).length, 0);
            const orderNumber = after.orderNumber ? `#${after.orderNumber}` : '';
            await sendToTokens(shopTokens, {
                title: 'Dispatch sent! 🚚',
                body: `A new dispatch containing ${itemsCount} item${itemsCount === 1 ? '' : 's'} has been sent for your order ${orderNumber} from the factory.`,
            });
        }
    }
    // 2. Notify shop user when delivery date is updated
    if (dateChangedLater) {
        const expectedMs = toMs(after.expectedDeliveryDate);
        const expected = expectedMs
            ? new Date(expectedMs).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
            })
            : null;
        const orderNumber = after.orderNumber ? `#${after.orderNumber}` : '';
        if (expected) {
            await sendToTokens(shopTokens, {
                title: 'Delivery date updated 📅',
                body: `The expected delivery date for order ${orderNumber} from ${after.shopName} has been updated to ${expected}.`,
            });
        }
    }
    // 3. Notify shop user when order is completed
    if (completedNow) {
        const orderNumber = after.orderNumber ? `#${after.orderNumber}` : '';
        await sendToTokens(shopTokens, {
            title: 'Order completed! 🎉',
            body: `All items for order ${orderNumber} from ${after.shopName} have been received and confirmed.`,
        });
        // Also notify Factory Managers & Staff that the shop confirmed receipt and order is finished
        const [factoryUsers, factoryStaffUsers] = await Promise.all([
            db.collection('users').where('role', '==', 'factory').get(),
            db.collection('users').where('role', '==', 'factory_staff').get(),
        ]);
        const factoryTokens = [];
        [...factoryUsers.docs, ...factoryStaffUsers.docs].forEach((doc) => {
            const t = doc.data().fcmTokens || [];
            factoryTokens.push(...t);
        });
        await sendToTokens(factoryTokens, {
            title: `Order completed at ${after.shopName} ✓`,
            body: `Order ${orderNumber} placed by ${after.requestorName} has been fully received and marked as completed.`,
        });
    }
    // 4. Notify shop user when order is received by factory
    if (receivedNow) {
        const expectedMs = toMs(after.expectedDeliveryDate);
        const expected = expectedMs
            ? new Date(expectedMs).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
            })
            : null;
        await sendToTokens(shopTokens, {
            title: 'Order received by factory',
            body: expected
                ? `Your order is being processed. Expected delivery: ${expected}`
                : 'Your order has been received and is being processed.',
        });
    }
});
//# sourceMappingURL=index.js.map