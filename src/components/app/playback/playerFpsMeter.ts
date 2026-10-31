// 播放页 FPS 徽标共用的纯计算：样本数是相邻 rAF 之间的实际间隔数。
export const calculatePlayerFps = (frameIntervals: number, elapsedMs: number): number | null => {
    if (!Number.isFinite(frameIntervals) || frameIntervals <= 0) return null;
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return null;
    return Math.round((frameIntervals * 1000) / elapsedMs);
};
