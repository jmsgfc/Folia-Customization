import React, { useEffect, useMemo, useState } from 'react';
import { motion, type MotionValue, useMotionValueEvent } from 'framer-motion';
import type { Line, LyricSyllable } from '../../../types';
import { splitLyricGraphemes, type GraphemeTiming } from '../../../utils/lyrics/graphemeTiming';
import { getLineRenderEndTime } from '../../../utils/lyrics/renderHints';
import type { SubtitleTrack } from '../../../utils/lyrics/alternateText';

const splitTimedText = (text: string, startTime: number, endTime: number): GraphemeTiming[] => {
    const graphemes = splitLyricGraphemes(text);
    const duration = Math.max(0, endTime - startTime);
    return graphemes.map((char, index) => ({
        char,
        startTime: startTime + duration * (index / Math.max(1, graphemes.length)),
        endTime: startTime + duration * ((index + 1) / Math.max(1, graphemes.length)),
    }));
};

const buildSyllableTimeline = (syllables: LyricSyllable[]): GraphemeTiming[] => syllables.flatMap(syllable => [
    ...splitTimedText(syllable.text, syllable.startTime, syllable.endTime),
    ...(syllable.endsWithSpace ? [{ char: ' ', startTime: syllable.endTime, endTime: syllable.endTime }] : []),
]);

const sampleTimelineTime = (timeline: GraphemeTiming[], progress: number, edge: 'start' | 'end'): number => {
    if (timeline.length === 0) return 0;
    const position = Math.min(timeline.length, Math.max(0, progress) * timeline.length);
    const index = edge === 'end'
        ? Math.min(timeline.length - 1, Math.max(0, Math.ceil(position) - 1))
        : Math.min(timeline.length - 1, Math.floor(position));
    const unit = timeline[index]!;
    const localProgress = position - index;
    const sampled = unit.startTime + (unit.endTime - unit.startTime) * localProgress;
    return edge === 'end' && progress >= 1 ? timeline[timeline.length - 1]!.endTime : sampled;
};

const resolveTimedAlternate = (line: Line, track: SubtitleTrack): LyricSyllable[] | null => (
    line.alternateTexts?.find(entry => (
        entry.role === track.role
        && entry.text.trim() === track.text.trim()
        && entry.syllables?.length
    ))?.syllables ?? null
);

/**
 * Builds a visual timing track for translated graphemes. Timed alternate text wins; otherwise the
 * displayed translation is distributed across the original line's real singing window.
 */
export const buildClassicSubtitleGraphemeTimings = (line: Line, track: SubtitleTrack): GraphemeTiming[] => {
    const graphemes = splitLyricGraphemes(track.text);
    if (graphemes.length === 0) return [];

    const timedAlternate = resolveTimedAlternate(line, track);
    const sourceTimeline = timedAlternate?.length
        ? buildSyllableTimeline(timedAlternate)
        : line.words.length > 0
            ? line.words.flatMap(word => splitTimedText(word.text, word.startTime, word.endTime))
            : splitTimedText(line.fullText, line.startTime, getLineRenderEndTime(line));
    const fallbackEnd = Math.max(getLineRenderEndTime(line), line.endTime, line.startTime + 0.1);
    const usableTimeline = sourceTimeline.length > 0
        ? sourceTimeline
        : [{ char: '', startTime: line.startTime, endTime: fallbackEnd }];

    return graphemes.map((char, index) => ({
        char,
        startTime: sampleTimelineTime(usableTimeline, index / graphemes.length, 'start'),
        endTime: sampleTimelineTime(usableTimeline, (index + 1) / graphemes.length, 'end'),
    }));
};

type SubtitleCursor = { activeIndex: number; passedThrough: number };

export const resolveClassicSubtitleCursor = (timings: GraphemeTiming[], currentTime: number): SubtitleCursor => {
    let activeIndex = -1;
    let passedThrough = -1;
    timings.forEach((timing, index) => {
        if (currentTime >= timing.endTime) passedThrough = index;
        if (currentTime >= timing.startTime && currentTime < timing.endTime) activeIndex = index;
    });
    return { activeIndex, passedThrough };
};

interface ClassicAnimatedSubtitleTrackProps {
    line: Line;
    track: SubtitleTrack;
    currentTime: MotionValue<number>;
    baseColor: string;
    activeColor: string;
}

export const ClassicAnimatedSubtitleTrack: React.FC<ClassicAnimatedSubtitleTrackProps> = ({
    line,
    track,
    currentTime,
    baseColor,
    activeColor,
}) => {
    const timings = useMemo(() => buildClassicSubtitleGraphemeTimings(line, track), [line, track]);
    const [cursor, setCursor] = useState(() => resolveClassicSubtitleCursor(timings, currentTime.get()));

    useEffect(() => {
        setCursor(resolveClassicSubtitleCursor(timings, currentTime.get()));
    }, [currentTime, timings]);

    useMotionValueEvent(currentTime, 'change', latest => {
        const next = resolveClassicSubtitleCursor(timings, latest);
        setCursor(previous => (
            previous.activeIndex === next.activeIndex && previous.passedThrough === next.passedThrough
                ? previous
                : next
        ));
    });

    return (
        <span aria-label={track.text} className="inline">
            {timings.map((timing, index) => {
                const isWhitespace = /^\s+$/u.test(timing.char);
                const state = index === cursor.activeIndex
                    ? 'active'
                    : index <= cursor.passedThrough
                        ? 'passed'
                        : 'waiting';
                return (
                    <motion.span
                        key={`${index}-${timing.char}`}
                        aria-hidden="true"
                        className={isWhitespace ? 'inline' : 'inline-block will-change-transform'}
                        initial={false}
                        animate={isWhitespace ? undefined : state}
                        variants={{
                            waiting: { opacity: 0.42, y: 3, scale: 0.96, color: baseColor, filter: 'blur(1.5px)' },
                            active: {
                                opacity: 1,
                                y: -4,
                                scale: 1.14,
                                color: activeColor,
                                filter: 'blur(0px)',
                                textShadow: `0 0 12px ${activeColor}`,
                                transition: { type: 'spring', stiffness: 300, damping: 19 },
                            },
                            passed: {
                                opacity: 0.92,
                                y: 0,
                                scale: 1,
                                color: baseColor,
                                filter: 'blur(0px)',
                                textShadow: 'none',
                                transition: { duration: 0.28, ease: 'easeOut' },
                            },
                        }}
                    >
                        {timing.char}
                    </motion.span>
                );
            })}
        </span>
    );
};
