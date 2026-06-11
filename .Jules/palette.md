## 2024-06-06 - A11y enhancements for unlabelled search inputs
**Learning:** Found that custom filter/search elements utilizing a placeholder string and no visible label didn't have `aria-label` attached.
**Action:** Next time when evaluating inputs relying entirely on `placeholder` strings, check if they have a proper accessible label in the DOM via `aria-label`.
## 2026-06-11 - A11y enhancements for unlabelled image preview buttons
**Learning:** Image preview buttons wrapping <img> elements often lack proper screen reader context when missing aria-labels.
**Action:** Always add descriptive `aria-label` attributes to <button> elements that serve as image previews to ensure accessibility.
