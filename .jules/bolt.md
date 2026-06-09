## 2024-06-06 - Replacing inefficient counts with getCountFromServer
**Learning:** Found a component (`usePendingOrderCount`) that was fetching full order documents (up to a limit of 200) from Firestore just to count `.length`. In Firebase v9+, `getCountFromServer` is heavily optimized for these situations, avoiding downloading payloads.
**Action:** Used `getCountFromServer` whenever an aggregate count is needed without utilizing document data, significantly lowering reads and bandwidth.

## 2024-06-09 - Client-side search optimization with React 18+ useDeferredValue
**Learning:** Found that synchronous, slightly expensive operations like local filtering with Fuse.js could block the main thread and cause typing latency in search inputs.
**Action:** Wrapped the search input state with `useDeferredValue` before passing it to the filtering logic. This allows React to prioritize responding to user typing, while deferring the heavy search calculation and list re-rendering to the background, keeping the UI highly responsive.
