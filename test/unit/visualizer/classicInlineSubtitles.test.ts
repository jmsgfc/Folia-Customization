import { describe, expect, it } from 'vitest';
import { resolveClassicInlineSubtitleState } from '@/components/visualizer/classic/classicInlineSubtitles';
import type { Line } from '@/types';

const line = (patch: Partial<Line> = {}): Line => ({
    startTime: 1,
    endTime: 4,
    fullText: '오늘따라 비밀이 너무 많은',
    translation: '特别是今天的你拥有太多秘密',
    romanization: 'oneulttara bimiri neomu maneun',
    words: [],
    ...patch,
});

describe('resolveClassicInlineSubtitleState', () => {
    it('keeps the original lyric out of the alternate rows and returns its translation', () => {
        const state = resolveClassicInlineSubtitleState(line(), 'translation', true);

        expect(state.resolvedMode).toBe('translation');
        expect(state.tracks).toEqual([
            { role: 'translation', text: '特别是今天的你拥有太多秘密' },
        ]);
        expect(state.tracks.some(track => track.text === '오늘따라 비밀이 너무 많은')).toBe(false);
    });

    it('reads a translation from alternateTexts when the direct field is missing', () => {
        const state = resolveClassicInlineSubtitleState(line({
            translation: undefined,
            alternateTexts: [{ role: 'translation', text: '今天的你有太多秘密' }],
        }), 'translation', true);

        expect(state.tracks).toEqual([{ role: 'translation', text: '今天的你有太多秘密' }]);
    });

    it('supports stacked romanization above translation', () => {
        expect(resolveClassicInlineSubtitleState(line(), 'both', true).tracks).toEqual([
            { role: 'romanization', text: 'oneulttara bimiri neomu maneun' },
            { role: 'translation', text: '特别是今天的你拥有太多秘密' },
        ]);
    });

    it('renders no alternate row for original-only or hidden subtitles', () => {
        expect(resolveClassicInlineSubtitleState(line(), 'none', true).tracks).toEqual([]);
        expect(resolveClassicInlineSubtitleState(line(), 'translation', true, true).tracks).toEqual([]);
    });

    it('drops separator-only translations', () => {
        expect(resolveClassicInlineSubtitleState(line({ translation: '//' }), 'translation', true).tracks).toEqual([]);
    });
});
