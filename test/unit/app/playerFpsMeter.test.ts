import { describe, expect, it } from 'vitest';
import { calculatePlayerFps } from '@/components/app/playback/playerFpsMeter';

describe('playerFpsMeter', () => {
    it('按实际采样时长计算并四舍五入 FPS', () => {
        expect(calculatePlayerFps(112, 1000)).toBe(112);
        expect(calculatePlayerFps(59, 1004)).toBe(59);
        expect(calculatePlayerFps(105, 1002)).toBe(105);
    });

    it('拒绝空样本和无效时长', () => {
        expect(calculatePlayerFps(0, 1000)).toBeNull();
        expect(calculatePlayerFps(60, 0)).toBeNull();
        expect(calculatePlayerFps(Number.NaN, 1000)).toBeNull();
    });
});
