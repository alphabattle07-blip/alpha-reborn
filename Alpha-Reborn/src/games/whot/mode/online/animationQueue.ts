import { animationLock } from './animationLock';

type AnimationJob = () => Promise<void>;

/**
 * FIFO Animation Queue for deterministic Whot Online animations.
 *
 * All animation-triggering events (opponent moves, local plays) are enqueued here.
 * Jobs execute one at a time, in order, with the global animationLock held.
 *
 * After the queue drains, any pending gameStateUpdate is flushed via the
 * `onQueueDrained` callback.
 */
class AnimationQueue {
    private queue: AnimationJob[] = [];
    private running = false;
    private _onQueueDrained: (() => void) | null = null;

    /** Register a callback to run when the queue fully drains (used to flush pending state). */
    set onQueueDrained(cb: (() => void) | null) {
        this._onQueueDrained = cb;
    }

    enqueue(job: AnimationJob) {
        this.queue.push(job);
        this.flush();
    }

    private async flush() {
        if (this.running) return;
        this.running = true;
        animationLock.isAnimating = true;

        while (this.queue.length > 0) {
            const job = this.queue.shift();
            if (job) {
                try {
                    await job();
                } catch (e) {
                    console.error('[AnimationQueue] Job failed:', e);
                }
            }
        }

        animationLock.isAnimating = false;
        this.running = false;

        // Flush any pending state that arrived while we were animating
        if (this._onQueueDrained) {
            this._onQueueDrained();
        }
    }

    /** True if the queue is currently executing jobs */
    get isRunning() {
        return this.running;
    }

    /** Clear all pending (not-yet-started) jobs */
    clear() {
        this.queue = [];
    }
}

export const animationQueue = new AnimationQueue();
