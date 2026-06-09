## 2024-06-06 - A11y enhancements for unlabelled search inputs
**Learning:** Found that custom filter/search elements utilizing a placeholder string and no visible label didn't have `aria-label` attached.
**Action:** Next time when evaluating inputs relying entirely on `placeholder` strings, check if they have a proper accessible label in the DOM via `aria-label`.

## 2024-06-09 - A11y enhancements for image preview buttons
**Learning:** Buttons wrapping `<img>` elements (such as for image lightboxes/previews) need `aria-label` attributes to explicitly define their action for screen readers, as the implicit `alt` text of the image may not effectively convey the interactable purpose.
**Action:** Always add an explicit `aria-label` (e.g. "View full size image of X") to `<button>` wrappers around images to ensure screen readers announce the action correctly.
