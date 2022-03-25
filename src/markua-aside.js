/**
 * @fileoverview Functions for converting data
 * @author Nicholas C. Zakas
 */

//-----------------------------------------------------------------------------
// Imports
//-----------------------------------------------------------------------------


//-----------------------------------------------------------------------------
// Data
//-----------------------------------------------------------------------------

const TAGS = new Set(["aside", "blurb"]);
const BLURB_CLASSES = new Set([
    "center",
    "discussion",
    "error",
    "information",
    "tip",
    "warning"
]);

const BLOCKS = new Map([
    ["A>", "aside"],
    ["B>", "blurb"],
    ["C>", "blurb:center"],
    ["D>", "blurb:discussion"],
    ["E>", "blurb:error"],
    ["I>", "blurb:information"],
    ["Q>", "blurb:question"],
    ["T>", "blurb:tip"],
    ["W>", "blurb:warning"],
    ["X>", "blurb:exercise"]
]);

//-----------------------------------------------------------------------------
// Helpers
//-----------------------------------------------------------------------------

function isSpace(c) {
    return c === " " || c === "\t";
}

function renderAside(tokens, idx, _options, env, slf) {

    tokens[idx].tag = "aside";

    return slf.renderToken(tokens, idx, _options, env, slf);
}

function renderBlurb(tokens, idx, _options, env, slf) {

    const token = tokens[idx];

    token.tag = "aside";

    // add a class to the opening tag
    if (token.nesting === 1) {
        token.attrJoin("class", "blurb");

        if (token.info && token.info.className) {
            token.attrJoin("class", token.info.className);
        }

    }


    return slf.renderToken(tokens, idx, _options, env, slf);
}


function getLine(state, lineNumber) {

    const start = state.bMarks[lineNumber] + state.tShift[lineNumber];
    const end = state.eMarks[lineNumber];
    const text = state.src.slice(start, end);

    return {
        start,
        end,
        text
    };

}

function findBlock(state, lineNumber) {

    const {
        text,
        start: lineStart
    } = getLine(state, lineNumber);

    const marker = text.slice(0, 2);
    const blockType = BLOCKS.get(marker);
    
    if (!blockType) {
        return undefined;
    }

    const [ tagName, className ] = blockType.split(":");
    
    return {
        tagName,
        className,
        marker,
        start: lineStart,
        end: lineStart + 2,
        lineNumber,
        spaceAfter: isSpace(text[2])
    };
}

function findStartTag(state, lineNumber) {

    const {
        text,
        start: lineStart,
        end: lineEnd
    } = getLine(state, lineNumber);
    const src = state.src;

    // tags must start at start of line
    if (text[0] !== "{") {
        return undefined;
    }

    // parse the tag name
    let tagName = "";

    for (let i = 1; /[a-z]/i.test(text[i]) && i < text.length; i++) {
        tagName += text[i];
    }

    // exit early for unknown tags
    if (!TAGS.has(tagName)) {
        return undefined;
    }

    let expectedClosingCurlyPos = 6;
    let className = "";

    // blurbs allow class names
    if (tagName === "blurb") {

        // 6 = curly brace plus tag name
        let pos = state.skipSpaces(lineStart + 6);

        if (src[pos] === ",") {

            pos = state.skipSpaces(pos + 1);

            if (src.slice(pos, pos + 6) !== "class:") {
                return undefined;
            }

            pos = state.skipSpaces(pos + 6);

            // find closing curly
            let i = pos;
            for (; src.charAt(i) !== "}" && i < lineEnd; i++) {
                className += src.charAt(i);
            }

            if (!BLURB_CLASSES.has(className)) {
                console.warn("Unknown blurb class detected:", className);
            }

            expectedClosingCurlyPos = i - lineStart;
        }
    }

    if (text[expectedClosingCurlyPos] !== "}") {
        return undefined;
    }

    const start = lineStart;
    const end = start + expectedClosingCurlyPos + 1;

    return {
        tagName,
        className,
        start,
        end,
        lineNumber,
        alone: start === lineStart && end === lineEnd
    };
}

function findEndTag(state, lineNumber, tagName) {

    const {
        text,
        start: lineStart,
        end: lineEnd
    } = getLine(state, lineNumber);
    const closingTagText = `{/${tagName}}`;

    let openCurlyPos = text.indexOf(closingTagText);
    if (openCurlyPos === -1) {
        return undefined;
    }

    const start = lineStart + openCurlyPos;
    const end = start + closingTagText.length;

    return {
        tagName,
        start,
        end,
        lineNumber,
        alone: start === lineStart && end === lineEnd
    };
}

/**
 * The aside plugin for blocks such as A> and B>
 * @param {MarkdownIt} md The MarkdownIt instance to
 *      attach to.
 * @returns {boolean} True if the function handled an aside or blurb,
 *      false if not. 
 */

function asideBlockPlugin(state, block, endLine, silent) {

    let startLine = block.lineNumber;

    var adjustTab,
        ch,
        i,
        initial,
        l,
        lastLineEmpty,
        lines,
        nextLine,
        offset,
        oldBMarks,
        oldBSCount,
        oldIndent,
        oldParentType,
        oldSCount,
        oldTShift,
        spaceAfterMarker,
        terminate,
        terminatorRules,
        token,
        isOutdented,
        oldLineMax = state.lineMax,
        pos = state.bMarks[startLine] + state.tShift[startLine],
        max = state.eMarks[startLine];

    if (silent) {
        return true;
    }

    // set offset past spaces and "A>"
    initial = offset = state.sCount[startLine] + 2;

    // skip one optional space after '>'
    if (state.src.charCodeAt(pos) === 0x20 /* space */) {
        // ' >   test '
        //     ^ -- position start of line here:
        pos++;
        initial++;
        offset++;
        adjustTab = false;
        spaceAfterMarker = true;
    } else if (state.src.charCodeAt(pos) === 0x09 /* tab */) {
        spaceAfterMarker = true;

        if ((state.bsCount[startLine] + offset) % 4 === 3) {
            // '  >\t  test '
            //       ^ -- position start of line here (tab has width===1)
            pos++;
            initial++;
            offset++;
            adjustTab = false;
        } else {
            // ' >\t  test '
            //    ^ -- position start of line here + shift bsCount slightly
            //         to make extra space appear
            adjustTab = true;
        }
    } else {
        spaceAfterMarker = false;
    }

    oldBMarks = [state.bMarks[startLine]];
    state.bMarks[startLine] = pos;

    while (pos < max) {
        ch = state.src.charCodeAt(pos);

        if (isSpace(ch)) {
            if (ch === 0x09) {
                offset += 4 - (offset + state.bsCount[startLine] + (adjustTab ? 1 : 0)) % 4;
            } else {
                offset++;
            }
        } else {
            break;
        }

        pos++;
    }

    oldBSCount = [state.bsCount[startLine]];
    state.bsCount[startLine] = state.sCount[startLine] + 1 + (spaceAfterMarker ? 1 : 0);

    lastLineEmpty = pos >= max;

    oldSCount = [state.sCount[startLine]];
    state.sCount[startLine] = offset - initial;

    oldTShift = [state.tShift[startLine]];
    state.tShift[startLine] = pos - state.bMarks[startLine];

    // same terminator rules as block quotes
    terminatorRules = state.md.block.ruler.getRules('blockquote');

    oldParentType = state.parentType;
    state.parentType = block.tagName;

    // Search the end of the block
    //
    // Block ends with either:
    //  1. an empty line outside:
    //     ```
    //     > test
    //
    //     ```
    //  2. an empty line inside:
    //     ```
    //     >
    //     test
    //     ```
    //  3. another tag:
    //     ```
    //     > test
    //      - - -
    //     ```
    for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
        // check if it's outdented, i.e. it's inside list item and indented
        // less than said list item:
        //
        // ```
        // 1. anything
        //    > current blockquote
        // 2. checking this line
        // ```
        isOutdented = state.sCount[nextLine] < state.blkIndent;

        pos = state.bMarks[nextLine] + state.tShift[nextLine];
        max = state.eMarks[nextLine];

        if (pos >= max) {
            // Case 1: line is not inside the blockquote, and this line is empty.
            break;
        }

        if (state.src.charCodeAt(pos++) === 0x3E/* > */ && !isOutdented) {
            // This line is inside the blockquote.

            // set offset past spaces and ">"
            initial = offset = state.sCount[nextLine] + 1;

            // skip one optional space after '>'
            if (state.src.charCodeAt(pos) === 0x20 /* space */) {
                // ' >   test '
                //     ^ -- position start of line here:
                pos++;
                initial++;
                offset++;
                adjustTab = false;
                spaceAfterMarker = true;
            } else if (state.src.charCodeAt(pos) === 0x09 /* tab */) {
                spaceAfterMarker = true;

                if ((state.bsCount[nextLine] + offset) % 4 === 3) {
                    // '  >\t  test '
                    //       ^ -- position start of line here (tab has width===1)
                    pos++;
                    initial++;
                    offset++;
                    adjustTab = false;
                } else {
                    // ' >\t  test '
                    //    ^ -- position start of line here + shift bsCount slightly
                    //         to make extra space appear
                    adjustTab = true;
                }
            } else {
                spaceAfterMarker = false;
            }

            oldBMarks.push(state.bMarks[nextLine]);
            state.bMarks[nextLine] = pos;

            while (pos < max) {
                ch = state.src.charCodeAt(pos);

                if (isSpace(ch)) {
                    if (ch === 0x09) {
                        offset += 4 - (offset + state.bsCount[nextLine] + (adjustTab ? 1 : 0)) % 4;
                    } else {
                        offset++;
                    }
                } else {
                    break;
                }

                pos++;
            }

            lastLineEmpty = pos >= max;

            oldBSCount.push(state.bsCount[nextLine]);
            state.bsCount[nextLine] = state.sCount[nextLine] + 1 + (spaceAfterMarker ? 1 : 0);

            oldSCount.push(state.sCount[nextLine]);
            state.sCount[nextLine] = offset - initial;

            oldTShift.push(state.tShift[nextLine]);
            state.tShift[nextLine] = pos - state.bMarks[nextLine];
            continue;
        }

        // Case 2: line is not inside the blockquote, and the last line was empty.
        if (lastLineEmpty) { break; }

        // Case 3: another tag found.
        terminate = false;
        for (i = 0, l = terminatorRules.length; i < l; i++) {
            if (terminatorRules[i](state, nextLine, endLine, true)) {
                terminate = true;
                break;
            }
        }

        if (terminate) {
            // Quirk to enforce "hard termination mode" for paragraphs;
            // normally if you call `tokenize(state, startLine, nextLine)`,
            // paragraphs will look below nextLine for paragraph continuation,
            // but if blockquote is terminated by another tag, they shouldn't
            state.lineMax = nextLine;

            if (state.blkIndent !== 0) {
                // state.blkIndent was non-zero, we now set it to zero,
                // so we need to re-calculate all offsets to appear as
                // if indent wasn't changed
                oldBMarks.push(state.bMarks[nextLine]);
                oldBSCount.push(state.bsCount[nextLine]);
                oldTShift.push(state.tShift[nextLine]);
                oldSCount.push(state.sCount[nextLine]);
                state.sCount[nextLine] -= state.blkIndent;
            }

            break;
        }

        oldBMarks.push(state.bMarks[nextLine]);
        oldBSCount.push(state.bsCount[nextLine]);
        oldTShift.push(state.tShift[nextLine]);
        oldSCount.push(state.sCount[nextLine]);

        // A negative indentation means that this is a paragraph continuation
        //
        state.sCount[nextLine] = -1;
    }

    oldIndent = state.blkIndent;
    state.blkIndent = 0;
    const tagName = block.tagName;

    token = state.push(`${tagName}_open`, tagName, 1);
    token.markup = block.marker;
    token.map = lines = [startLine, 0];
    token.info = tagName === "blurb" ? { className: block.className } : null;

    state.md.block.tokenize(state, startLine, nextLine);

    token = state.push(`${tagName}_close`, tagName, -1);
    token.markup = block.marker;

    state.lineMax = oldLineMax;
    state.parentType = oldParentType;
    lines[1] = state.line;

    // Restore original tShift; this might not be necessary since the parser
    // has already been here, but just to make sure we can do that.
    for (i = 0; i < oldTShift.length; i++) {
        state.bMarks[i + startLine] = oldBMarks[i];
        state.tShift[i + startLine] = oldTShift[i];
        state.sCount[i + startLine] = oldSCount[i];
        state.bsCount[i + startLine] = oldBSCount[i];
    }
    state.blkIndent = oldIndent;
}

/**
 * The aside plugin for tags such as {aside} and {blurb}
 * @param {MarkdownIt} md The MarkdownIt instance to
 *      attach to.
 * @returns {boolean} True if the function handled an aside or blurb,
 *      false if not. 
 */

function asideTagPlugin(state, startTag, endLine, silent) {

    const startLine = startTag.lineNumber;
    let nextLine = startLine + 1;
    let isSingleLine = false;

    // try to find end tag on this line
    let endTag = findEndTag(state, startLine, startTag.tagName);
    if (endTag) {
        isSingleLine = true;

        // validation complete
        if (silent) {
            return true;
        }
    }

    if (isSingleLine) {
        nextLine = startLine + 1;
    } else {
        // Search for the end of the block
        //
        nextLine = startLine;

        // this loop searches for the ending tag
        for (; ;) {
            nextLine++;
            if (nextLine >= endLine) {
                // unclosed block should be autoclosed by end of document.
                // also block seems to be autoclosed by end of parent
                break;
            }

            endTag = findEndTag(state, nextLine, startTag.tagName);
            if (endTag) {
                break;
            }

        }

    }

    let tagName = startTag.tagName;
    const originalParent = state.parentType;
    const originalLineMax = state.lineMax;

    state.parentType = tagName;
    // this will prevent lazy continuations from ever going past our end marker
    state.lineMax = nextLine;

    let token = state.push(tagName + "_open", tagName, 1);
    token.markup = `{${tagName}}`;
    token.block = true;
    token.info = tagName === "blurb" ? { className: startTag.className } : null;
    token.map = [startLine, startLine + 1];

    let originalBMark = state.bMarks[startLine];
    let originalEMark = state.eMarks[startLine];
    let fromLine = startTag.lineNumber;
    let toLine = endTag.lineNumber;

    if (startTag.alone) {
        fromLine++;
    } else {
        state.bMarks[startTag.lineNumber] = startTag.end;
    }

    if (!endTag.alone) {
        toLine++;
        state.eMarks[endTag.lineNumber] = endTag.start;
    }

    state.md.block.tokenize(state, fromLine, toLine);

    state.bMarks[startLine] = originalBMark;
    state.eMarks[startLine] = originalEMark;

    token = state.push(tagName + "_close", tagName, -1);
    token.markup = `{/${tagName}}`;
    token.block = true;
    // token.map = [nextLine, nextLine+1];

    state.parentType = originalParent;
    state.lineMax = originalLineMax;
    state.line = endTag.lineNumber + 1;

    return true;

}


//-----------------------------------------------------------------------------
// Exports
//-----------------------------------------------------------------------------

/**
 * The aside plugin.
 * @param {MarkdownIt} md The MarkdownIt instance to
 *      attach to.
 * @returns {boolean} True if the function handled an aside or blurb,
 *      false if not. 
 */
export function asidePlugin(md) {

    function aside(state, startLine, endLine, silent) {

        // if it's indented more than 3 spaces, it should be a code block
        if (state.sCount[startLine] - state.blkIndent >= 4) {
            return false;
        }

        const block = findBlock(state, startLine);
        if (block) {
            return asideBlockPlugin(state, block, endLine, silent);
        }

        const startTag = findStartTag(state, startLine);
        if (startTag) {
            return asideTagPlugin(state, startTag, endLine, silent);
        }

        return false;
    }

    md.block.ruler.before("paragraph", "aside", aside, {
        alt: ["paragraph", "reference", "blockquote", "list"]
    });

    md.renderer.rules["aside_open"] = renderAside;
    md.renderer.rules["aside_close"] = renderAside;
    md.renderer.rules["blurb_open"] = renderBlurb;
    md.renderer.rules["blurb_close"] = renderBlurb;
}
