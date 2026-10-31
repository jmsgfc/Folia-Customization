import { useEffect, useState } from 'react';
import { calculatePlayerFps } from './playerFpsMeter';

const SAMPLE_WINDOW_MS = 1000;

/**
 * 播放页的实际动画帧率。这里故意使用应用当前的 requestAnimationFrame，而不是诊断器保存的
 * 原生 rAF：用户把动画限制改成 60FPS 后，徽标也必须显示约 60，而不是屏幕面板的 120Hz。
 */
const PlayerFpsBadge = () => {
    const [fps, setFps] = useState<number | null>(null);

    useEffect(() => {
        let frameHandle = 0;
        let windowStartedAt: number | null = null;
        let frameIntervals = 0;

        const sample = (timestamp: number) => {
            if (windowStartedAt === null) {
                windowStartedAt = timestamp;
            } else {
                frameIntervals += 1;
                const elapsedMs = timestamp - windowStartedAt;
                if (elapsedMs >= SAMPLE_WINDOW_MS) {
                    setFps(calculatePlayerFps(frameIntervals, elapsedMs));
                    windowStartedAt = timestamp;
                    frameIntervals = 0;
                }
            }
            frameHandle = window.requestAnimationFrame(sample);
        };

        frameHandle = window.requestAnimationFrame(sample);
        return () => window.cancelAnimationFrame(frameHandle);
    }, []);

    return (
        <div
            data-testid="player-fps-badge"
            className="pointer-events-none absolute right-5 top-5 z-20 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 font-mono text-xs font-semibold tabular-nums text-white/85 shadow-lg backdrop-blur-md"
            aria-label="实时帧率"
        >
            {fps === null ? '--' : fps} FPS
        </div>
    );
};

export default PlayerFpsBadge;
