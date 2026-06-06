## 2024-06-06 - Replacing inefficient counts with getCountFromServer
**Learning:** Found a component (`usePendingOrderCount`) that was fetching full order documents (up to a limit of 200) from Firestore just to count `.length`. In Firebase v9+, `getCountFromServer` is heavily optimized for these situations, avoiding downloading payloads.
**Action:** Used `getCountFromServer` whenever an aggregate count is needed without utilizing document data, significantly lowering reads and bandwidth.
