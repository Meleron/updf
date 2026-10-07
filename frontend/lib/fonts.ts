/** The CSS families of the Noto faces declared in globals.css, the same files the backend draws with. */
export const cssFontFamilies = { sans: '"Noto Sans"', serif: '"Noto Serif"', mono: '"Noto Sans Mono"' };

/** Metrics of every Noto face in fonts/, per em (units over 1000): ascent 1069, descent 293 and no line gap. */
export const notoAscent = 1.069;

/**
 * The line spacing (ascent + descent + line gap), which the backend uses too. It's set explicitly because browsers
 * round `line-height: normal` to whole pixels, which drifts from the PDF by up to half a pixel per line.
 */
export const notoLineHeight = 1.362;
