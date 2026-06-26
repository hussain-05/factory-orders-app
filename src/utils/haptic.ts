/**
 * Trigger a light haptic vibration on supporting mobile devices.
 * Typically used for buttons, toggle switches, and quantitative adjustments.
 * 
 * @param type - 'light' (10ms) or 'medium' (25ms) or 'success' (double vibrate)
 */
export function triggerHaptic(type: 'light' | 'medium' | 'success' = 'light') {
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      // NOTE: Many physical phone motors require at least 20-30ms to ramp up and spin.
      // 10ms was too short to be registered by the hardware on most devices.
      if (type === 'light') {
        navigator.vibrate(30)
      } else if (type === 'medium') {
        navigator.vibrate(50)
      } else if (type === 'success') {
        navigator.vibrate([30, 50, 30])
      }
    } catch {
      // Ignore vibration errors (e.g. user hasn't interacted with document yet)
    }
  }
}
