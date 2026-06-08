## 2024-06-06 - A11y enhancements for unlabelled search inputs
**Learning:** Found that custom filter/search elements utilizing a placeholder string and no visible label didn't have `aria-label` attached.
**Action:** Next time when evaluating inputs relying entirely on `placeholder` strings, check if they have a proper accessible label in the DOM via `aria-label`.
## 2024-05-18 - [Add aria-label to image-only buttons]
**Learning:** Image-only buttons containing an `<img>` tag but no textual content or wrapper aria-label are not announced correctly by screen readers, making it unclear what action the button triggers.
**Action:** Always add an `aria-label` describing the action (e.g. "View larger image of [item]") to buttons wrapping images.
