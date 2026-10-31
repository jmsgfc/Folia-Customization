// Copyright (c) 2026 chthollyphile

// 绘光每帧的后台工作与平台画质策略。保持纯函数，便于在不创建 WebGL 上下文的单测里覆盖。

export const resolveLumiereTransitionBlurQuality = (isAndroid: boolean) => (isAndroid ? 2 : 3);

/** Android 高刷版放开到 120FPS；桌面维持原来的 60FPS 行为。 */
export const resolveLumiereMaxFrameRate = (isAndroid: boolean) => (isAndroid ? 120 : 60);

/** stage 帧和 commit 帧都算换歌帧；commit 会在 advance 内把 active 从 true 清成 false。 */
export const didLumiereSongSwapRun = (wasActive: boolean, isActive: boolean) => wasActive || isActive;

export interface LumiereBackgroundWorkState {
    activeChanged: boolean;
    builtThisFrame: boolean;
    songSwapActive: boolean;
    visibleLayerCount: number;
}

/**
 * 预建 / 释放只放在稳定的单场景帧：切段帧与交叉渐变帧已经同时更新两套场景，不能再叠一次同步构建。
 */
export const shouldRunLumiereBackgroundWork = ({
    activeChanged,
    builtThisFrame,
    songSwapActive,
    visibleLayerCount,
}: LumiereBackgroundWorkState) => (
    !activeChanged
    && !builtThisFrame
    && !songSwapActive
    && visibleLayerCount === 1
);
