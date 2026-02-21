/**
 * Global animation lock for deterministic Whot Online animations.
 *
 * When `isAnimating` is true:
 * - gameStateUpdate payloads are deferred (stashed in pendingStateRef)
 * - Polling fallback skips fetching
 * - Board re-renders are suppressed
 *
 * Set/cleared exclusively by AnimationQueue.
 */
export const animationLock = {
    isAnimating: false,
};
