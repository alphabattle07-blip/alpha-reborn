/**
 * LatencyLogger
 * Structured measurement tool for real-time performance auditing.
 * Helps verify Tap-to-Socket, Receive-to-Land, and Server-Delay metrics.
 */

// 📝 Logging Level (Set to false for production)
const DEBUG = true;

// 🕒 Metric Storage (Separate from the exported object to avoid Worklet mutation warnings)
let lastTap = 0;
let lastEmit = 0;
let lastReceive = 0;
let lastAnimStart = 0;

export const logTap = () => {
    lastTap = Date.now();
    if (DEBUG) console.log('📍 [LATENCY] User Tap detected.');
};

export const logEmit = () => {
    lastEmit = Date.now();
    const delay = lastEmit - lastTap;
    if (DEBUG) {
        console.log(`📡 [LATENCY] Socket Emit. JS Overhead (Tap-to-Emit): ${delay}ms`);
    }
};

export const logReceive = (remoteTimestamp?: number) => {
    const now = Date.now();
    lastReceive = now;

    if (DEBUG) {
        let serverDelayStr = '';
        if (remoteTimestamp) {
            const serverDelay = now - remoteTimestamp;
            serverDelayStr = ` | Network RTT: ${serverDelay}ms`;
        }
        console.log(`📥 [LATENCY] Socket Receive.${serverDelayStr}`);
    }
};

export const logAnimStart = (stagedTimestamp?: number) => {
    const now = Date.now();
    lastAnimStart = now;

    const reactionDelay = lastReceive > 0 ? now - lastReceive : 0;

    if (DEBUG) {
        let catchupStr = '';
        if (stagedTimestamp) {
            const totalLag = now - stagedTimestamp;
            catchupStr = ` | Catch-up Delta: ${totalLag}ms`;
        }
        console.log(`🎬 [LATENCY] Animation Start. React/Tick Delay: ${reactionDelay}ms${catchupStr}`);
    }
};

// No LatencyLogger object needed here.
