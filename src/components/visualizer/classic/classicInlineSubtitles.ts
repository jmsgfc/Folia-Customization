import type { Line, SubtitleContentMode } from '../../../types';
import {
    resolveLyricSubtitleTracks,
    resolveSubtitleContentMode,
    type SubtitleTrack,
} from '../../../utils/lyrics/alternateText';

const hasReadableText = (text: string): boolean => /[\p{L}\p{N}]/u.test(text);

export interface ClassicInlineSubtitleState {
    resolvedMode: SubtitleContentMode;
    tracks: SubtitleTrack[];
}

/** Classic keeps the original lyric as the animated main row and resolves alternate rows below it. */
export const resolveClassicInlineSubtitleState = (
    line: Line | null,
    subtitleContentMode: SubtitleContentMode | undefined,
    showSubtitleTranslation: boolean,
    hideTranslationSubtitle = false,
): ClassicInlineSubtitleState => {
    const resolvedMode = resolveSubtitleContentMode(subtitleContentMode, showSubtitleTranslation);

    return {
        resolvedMode,
        tracks: hideTranslationSubtitle
            ? []
            : resolveLyricSubtitleTracks(line, resolvedMode, hasReadableText),
    };
};
