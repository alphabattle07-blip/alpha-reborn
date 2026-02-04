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
        LatencyLogger.metrics.lastTap = Date.now();
        if (LatencyLogger.debug) console.log('📍 [LATENCY] User Tap detected.');
    },

    logEmit() {
        LatencyLogger.metrics.lastEmit = Date.now();
        const delay = LatencyLogger.metrics.lastEmit - LatencyLogger.metrics.lastTap;
        if (LatencyLogger.debug) {
            console.log(`📡 [LATENCY] Socket Emit. JS Overhead (Tap-to-Emit): ${delay}ms`);
        }
    },

    logReceive(remoteTimestamp?: number) {
        const now = Date.now();
        LatencyLogger.metrics.lastReceive = now;

        if (LatencyLogger.debug) {
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
        LatencyLogger.metrics.lastAnimStart = now;

        const reactionDelay = LatencyLogger.metrics.lastReceive > 0 ? now - LatencyLogger.metrics.lastReceive : 0;

        if (LatencyLogger.debug) {
            let catchupStr = '';
            if (stagedTimestamp) {
                const totalLag = now - stagedTimestamp;
                catchupStr = ` | Catch-up Delta: ${totalLag}ms`;
            }
            console.log(`🎬 [LATENCY] Animation Start. React/Tick Delay: ${reactionDelay}ms${catchupStr}`);
        }
    },
};
