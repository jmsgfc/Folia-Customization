import { describe, expect, it } from 'vitest';
import {
    buildClassicSubtitleGraphemeTimings,
    resolveClassicSubtitleCursor,
} from '@/components/visualizer/classic/ClassicAnimatedSubtitleTrack';
import type { Line } from '@/types';

const line = (patch: Partial<Line> = {}): Line => ({
    startTime: 1,
    endTime: 5,
    fullText: 'hello world',
    words: [
        { text: 'hello', startTime: 1, endTime: 2.5 },
        { text: 'world', startTime: 3, endTime: 5 },
    ],
    ...patch,
});

describe('classic animated subtitle timing', () => {
    it('distributes an untimed translation across the original singing window', () => {
        const timings = buildClassicSubtitleGraphemeTimings(line(), { role: 'translation', text: '你好世界' });

        expect(timings.map(timing => timing.char).join('')).toBe('你好世界');
        expect(timings[0]!.startTime).toBe(1);
        expect(timings[timings.length - 1]!.endTime).toBe(5);
        expect(timings.every((timing, index) => index === 0 || timing.startTime >= timings[index - 1]!.startTime)).toBe(true);
    });

    it('uses timed alternate-text syllables when available', () => {
        const timedLine = line({
            alternateTexts: [{
                role: 'translation',
                text: '你好',
                syllables: [
                    { text: '你', startTime: 1.2, endTime: 2 },
                    { text: '好', startTime: 3.4, endTime: 4.2 },
                ],
            }],
        });
        const timings = buildClassicSubtitleGraphemeTimings(timedLine, { role: 'translation', text: '你好' });

        expect(timings[0]).toMatchObject({ char: '你', startTime: 1.2, endTime: 2 });
        expect(timings[1]).toMatchObject({ char: '好', startTime: 3.4, endTime: 4.2 });
    });

    it('resolves active and passed graphemes after seeking', () => {
        const timings = buildClassicSubtitleGraphemeTimings(line(), { role: 'translation', text: '测试' });

        expect(resolveClassicSubtitleCursor(timings, 1.5).activeIndex).toBe(0);
        expect(resolveClassicSubtitleCursor(timings, 4).activeIndex).toBe(1);
        expect(resolveClassicSubtitleCursor(timings, 6)).toEqual({ activeIndex: -1, passedThrough: 1 });
    });
});
