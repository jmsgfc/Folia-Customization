// src/utils/frameRateLimiter.ts
// Shared helpers and global RAF gate for optional visualizer frame throttling.

import type { VisualizerFrameRate } from '../types';
import { IS_ANDROID_WEBVIEW } from './platform';

type AnimationFrameCallback = FrameRequestCallback;
type RequestAnimationFrameFn = (callback: AnimationFrameCallback) => number;
type CancelAnimationFrameFn = (handle: number) => void;

type FrameRateLimitedRaf = {
    requestAnimationFrame: RequestAnimationFrameFn;
    cancelAnimationFrame: CancelAnimationFrameFn;
    setFrameRate: (frameRate: VisualizerFrameRate) => void;
    getFrameRate: () => VisualizerFrameRate;
};

type WindowWithVisualizerFrameRateLimiter = Window & {
    __foliaNativeRequestAnimationFrame?: RequestAnimationFrameFn;
    __foliaNativeCancelAnimationFrame?: CancelAnimationFrameFn;
};

export const VISUALIZER_FRAME_RATE_OPTIONS = [30, 60, 90, 120] as const satisfies VisualizerFrameRate[];
export const VISUALIZER_FRAME_RATE_STORAGE_KEY = 'visualizer_frame_rate';
export const ANDROID_TABLET_DEFAULT_FRAME_RATE = 120;
export const ANDROID_PHONE_DEFAULT_FRAME_RATE = 30;
export const ANDROID_TABLET_MIN_SHORT_EDGE_CSS_PX = 600;
const FRAME_INTERVAL_TOLERANCE_MS = 1;

export const isVisualizerFrameRate = (value: unknown): value is VisualizerFrameRate => (
    value === 'off'
    || value === 30
    || value === 120
    || value === 90
    || value === 60
);

export const parseVisualizerFrameRate = (value: string | null): VisualizerFrameRate => {
    if (value === 'off' || value === 'auto' || value === null) {
        return 'off';
    }

    const parsed = Number(value);
    return isVisualizerFrameRate(parsed) ? parsed : 'off';
};

export interface VisualizerFrameRateDefaultContext {
    isAndroid: boolean;
    screenWidth: number;
    screenHeight: number;
}

/** 启动限帧器与设置页共用的首次运行默认值，避免后台实际帧率和界面显示不一致。 */
export const resolveDefaultVisualizerFrameRate = ({
    isAndroid,
    screenWidth,
    screenHeight,
}: VisualizerFrameRateDefaultContext): VisualizerFrameRate => {
    if (!isAndroid) return 'off';
    const shortEdge = Math.min(screenWidth, screenHeight);
    return Number.isFinite(shortEdge) && shortEdge >= ANDROID_TABLET_MIN_SHORT_EDGE_CSS_PX
        ? ANDROID_TABLET_DEFAULT_FRAME_RATE
        : ANDROID_PHONE_DEFAULT_FRAME_RATE;
};

export const resolveStoredVisualizerFrameRate = (
    storedValue: string | null,
    context: VisualizerFrameRateDefaultContext,
): VisualizerFrameRate => (
    storedValue === null ? resolveDefaultVisualizerFrameRate(context) : parseVisualizerFrameRate(storedValue)
);

const currentFrameRateDefaultContext = (): VisualizerFrameRateDefaultContext => ({
    isAndroid: IS_ANDROID_WEBVIEW,
    screenWidth: typeof window !== 'undefined' ? window.screen?.width ?? window.innerWidth ?? 0 : 0,
    screenHeight: typeof window !== 'undefined' ? window.screen?.height ?? window.innerHeight ?? 0 : 0,
});

// Decides whether a RAF tick should run under the configured FPS cap.
export const shouldProcessFrameAtRate = (
    timestampMs: number,
    lastProcessedTimestampMs: number,
    frameRate: VisualizerFrameRate,
) => {
    if (frameRate === 'off') {
        return true;
    }

    const intervalMs = 1000 / frameRate - FRAME_INTERVAL_TOLERANCE_MS;
    return lastProcessedTimestampMs === 0 || timestampMs - lastProcessedTimestampMs >= intervalMs;
};

const reportAnimationFrameCallbackError = (error: unknown) => {
    console.error('Error in requestAnimationFrame callback:', error);
    setTimeout(() => {
        throw error;
    }, 0);
};

// Creates a shared RAF queue so every callback scheduled for an allowed frame flushes together.
export const createFrameRateLimitedRaf = (
    nativeRequestAnimationFrame: RequestAnimationFrameFn,
    nativeCancelAnimationFrame: CancelAnimationFrameFn,
    initialFrameRate: VisualizerFrameRate = 60,
): FrameRateLimitedRaf => {
    let frameRate = initialFrameRate;
    let nextHandle = 1;
    let nativeFrameHandle: number | null = null;
    let lastProcessedTimestamp = 0;
    const callbacks = new Map<number, AnimationFrameCallback>();

    const scheduleNativeFrame = () => {
        if (nativeFrameHandle !== null || callbacks.size === 0) {
            return;
        }

        nativeFrameHandle = nativeRequestAnimationFrame(processNativeFrame);
    };

    const processNativeFrame = (timestamp: number) => {
        nativeFrameHandle = null;

        if (!shouldProcessFrameAtRate(timestamp, lastProcessedTimestamp, frameRate)) {
            scheduleNativeFrame();
            return;
        }

        lastProcessedTimestamp = timestamp;
        const frameHandles = Array.from(callbacks.keys());

        for (const handle of frameHandles) {
            // Match native RAF: an earlier callback may cancel a later one in the same frame.
            const callback = callbacks.get(handle);
            if (!callback) continue;
            callbacks.delete(handle);
            try {
                callback(timestamp);
            } catch (error) {
                reportAnimationFrameCallbackError(error);
            }
        }

        scheduleNativeFrame();
    };

    return {
        requestAnimationFrame: (callback) => {
            const handle = nextHandle;
            nextHandle += 1;
            callbacks.set(handle, callback);
            scheduleNativeFrame();
            return handle;
        },
        cancelAnimationFrame: (handle) => {
            callbacks.delete(handle);
            if (callbacks.size === 0 && nativeFrameHandle !== null) {
                nativeCancelAnimationFrame(nativeFrameHandle);
                nativeFrameHandle = null;
            }
        },
        setFrameRate: (nextFrameRate) => {
            frameRate = nextFrameRate;
            lastProcessedTimestamp = 0;

            if (nativeFrameHandle !== null) {
                nativeCancelAnimationFrame(nativeFrameHandle);
                nativeFrameHandle = null;
            }
            scheduleNativeFrame();
        },
        getFrameRate: () => frameRate,
    };
};

let installedLimiter: FrameRateLimitedRaf | null = null;

export const setGlobalVisualizerFrameRate = (frameRate: VisualizerFrameRate) => {
    if (typeof window === 'undefined') {
        return;
    }

    if (frameRate === 'off') {
        restoreGlobalVisualizerFrameRateLimiter();
        return;
    }

    if (!installedLimiter) {
        installGlobalVisualizerFrameRateLimiter(frameRate);
        return;
    }

    installedLimiter.setFrameRate(frameRate);
};

export const restoreGlobalVisualizerFrameRateLimiter = () => {
    if (typeof window === 'undefined') {
        return;
    }

    const frameWindow = window as WindowWithVisualizerFrameRateLimiter;
    if (frameWindow.__foliaNativeRequestAnimationFrame) {
        window.requestAnimationFrame = frameWindow.__foliaNativeRequestAnimationFrame;
    }
    if (frameWindow.__foliaNativeCancelAnimationFrame) {
        window.cancelAnimationFrame = frameWindow.__foliaNativeCancelAnimationFrame;
    }
    installedLimiter = null;
};

export const installGlobalVisualizerFrameRateLimiter = (overrideFrameRate?: VisualizerFrameRate) => {
    if (typeof window === 'undefined') {
        return;
    }

    const storedFrameRateRaw = window.localStorage.getItem(VISUALIZER_FRAME_RATE_STORAGE_KEY);
    // 与设置 store 共用同一个解析器：Android 平板首次运行显示并使用 120FPS，手机为 30FPS；
    // 只要用户明确选过一次，就始终尊重已保存的选择。
    const effectiveFrameRate = overrideFrameRate
        ?? resolveStoredVisualizerFrameRate(storedFrameRateRaw, currentFrameRateDefaultContext());
    if (effectiveFrameRate === 'off') {
        restoreGlobalVisualizerFrameRateLimiter();
        return;
    }

    if (installedLimiter) {
        installedLimiter.setFrameRate(effectiveFrameRate);
        return;
    }

    const frameWindow = window as WindowWithVisualizerFrameRateLimiter;
    frameWindow.__foliaNativeRequestAnimationFrame ??= window.requestAnimationFrame;
    frameWindow.__foliaNativeCancelAnimationFrame ??= window.cancelAnimationFrame;
    const nativeRequestAnimationFrame: RequestAnimationFrameFn = (callback) => (
        frameWindow.__foliaNativeRequestAnimationFrame?.call(window, callback) ?? 0
    );
    const nativeCancelAnimationFrame: CancelAnimationFrameFn = (handle) => {
        frameWindow.__foliaNativeCancelAnimationFrame?.call(window, handle);
    };
    installedLimiter = createFrameRateLimitedRaf(nativeRequestAnimationFrame, nativeCancelAnimationFrame, effectiveFrameRate);

    window.requestAnimationFrame = installedLimiter.requestAnimationFrame;
    window.cancelAnimationFrame = installedLimiter.cancelAnimationFrame;
};
