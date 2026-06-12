## 2024-06-06 - Replacing inefficient counts with getCountFromServer
**Learning:** Found a component (`usePendingOrderCount`) that was fetching full order documents (up to a limit of 200) from Firestore just to count `.length`. In Firebase v9+, `getCountFromServer` is heavily optimized for these situations, avoiding downloading payloads.
**Action:** Used `getCountFromServer` whenever an aggregate count is needed without utilizing document data, significantly lowering reads and bandwidth.

## 2024-08-01 - Adding useDeferredValue for Synchronous Filtering in React 19
**Learning:** In a codebase using React 19, synchronous data-heavy operations like `fuse.js` filtering or large array filtering on keystroke input (e.g., search bars) will block the main thread and drop frames, making typing feel sluggish. React 19 provides the `useDeferredValue` hook to deprioritize these updates.
**Action:** Used `useDeferredValue` on the search query input values before feeding them into computationally expensive synchronous `useMemo` hooks (such as `fuse.js` searching or `.filter()` + `.sort()` chains across multiple criteria). This ensures user keystrokes remain extremely responsive without needing an external debounce utility.
## 2024-06-11 - Converting O(N) catalog iteration to O(K) cart map loop
**Learning:** In the order pages, cart state frequently updates which re-computes `validLines`. Iterating the full catalog on every keystroke or click causes unnecessary CPU drain for large catalogs.
**Action:** Use a memoized `Map` of the catalog array to provide O(1) lookups and iterate over the entries of the cart object `qtys` directly instead, turning an O(N) operation into an O(K) operation where K is the number of cart items.
