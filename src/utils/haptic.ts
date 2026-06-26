/**
 * Trigger a light haptic vibration on supporting mobile devices.
 * Typically used for buttons, toggle switches, and quantitative adjustments.
 * 
 * @param type - 'light' (10ms) or 'medium' (25ms) or 'success' (double vibrate)
 */
export function triggerHaptic(type: 'light' | 'medium' | 'success' = 'light') {
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      if (type === 'light') {
        navigator.vibrate(10)
      } else if (type === 'medium') {
        navigator.vibrate(25)
      } else if (type === 'success') {
        navigator.vibrate([20, 50, 20])
      }
    } catch {
      // Browsers restrict vibration if no user interaction occurred or due to permission rules
    }
  }
}
