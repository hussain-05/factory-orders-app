## 2024-06-06 - Replacing inefficient counts with getCountFromServer
**Learning:** Found a component (`usePendingOrderCount`) that was fetching full order documents (up to a limit of 200) from Firestore just to count `.length`. In Firebase v9+, `getCountFromServer` is heavily optimized for these situations, avoiding downloading payloads.
**Action:** Used `getCountFromServer` whenever an aggregate count is needed without utilizing document data, significantly lowering reads and bandwidth.

## 2024-06-08 - Deferring expensive synchronous filters on controlled inputs
**Learning:** Found an expensive fuzzy search (`Fuse.js`) running synchronously inside a `useMemo` that depended directly on a controlled text input state (`query`). On large catalogs, this blocks the main thread during typing, causing visible input lag.
**Action:** Used `useDeferredValue` on the query state. This allows React to prioritize updating the input box immediately while the heavy filtering happens as a lower-priority interruptible task, preserving 60fps typing without needing a separate debounce library.
