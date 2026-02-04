/**
 * LatencyLogger
 * Structured measurement tool for real-time performance auditing.
 * Helps verify Tap-to-Socket, Receive-to-Land, and Server-Delay metrics.
 */
export const LatencyLogger = {
    // 🕒 Metric Storage
    metrics: {
        lastTap: 0,
        lastEmit: 0,
        lastReceive: 0,
        lastAnimStart: 0,
    },

    // 📝 Logging Level (Set to false for production)
    debug: true,

    logTap() {
        this.metrics.lastTap = Date.now();
        if (this.debug) console.log('📍 [LATENCY] User Tap detected.');
    },

    logEmit() {
        this.metrics.lastEmit = Date.now();
        const delay = this.metrics.lastEmit - this.metrics.lastTap;
        if (this.debug) {
            console.log(`📡 [LATENCY] Socket Emit. JS Overhead (Tap-to-Emit): ${delay}ms`);
        }
    },

    logReceive(remoteTimestamp?: number) {
        const now = Date.now();
        this.metrics.lastReceive = now;

        if (this.debug) {
            let serverDelayStr = '';
            if (remoteTimestamp) {
                const serverDelay = now - remoteTimestamp;
                serverDelayStr = ` | Network RTT: ${serverDelay}ms`;
            }
            console.log(`📥 [LATENCY] Socket Receive.${serverDelayStr}`);
        }
    },

    logAnimStart(stagedTimestamp?: number) {
        const now = Date.now();
        this.metrics.lastAnimStart = now;

        const reactionDelay = this.metrics.lastReceive > 0 ? now - this.metrics.lastReceive : 0;

        if (this.debug) {
            let catchupStr = '';
            if (stagedTimestamp) {
                const totalLag = now - stagedTimestamp;
                catchupStr = ` | Catch-up Delta: ${totalLag}ms`;
            }
            console.log(`🎬 [LATENCY] Animation Start. React/Tick Delay: ${reactionDelay}ms${catchupStr}`);
        }
    },
};
