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

function findBlockHeader(state, lineNumber) {

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
    const c = text[2];
    const hasTrailingSpace = isSpace(c);

    return {
        tagName,
        className,
        marker,
        start: lineStart,
        end: lineStart + 2 + (hasTrailingSpace ? 1 : 0),
        lineNumber,
        spaceAfter: hasTrailingSpace
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

            // if (!BLURB_CLASSES.has(className)) {
            //     console.warn("Unknown blurb class detected:", className);
            // }

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

function asideBlockHeaderPlugin(state, header, endLine, silent) {

    const oldLineMax = state.lineMax;
    let startLine = header.lineNumber;
    // let pos = state.bMarks[startLine] + state.tShift[startLine];
    let pos = header.end;

    if (silent) {
        return true;
    }

    // adjust the start of the line to be after the A>
    let oldBMarks = [state.bMarks[startLine]];
    state.bMarks[startLine] = pos;

    // save new parent type
    const oldParentType = state.parentType;
    state.parentType = header.tagName;

    // search for the end of the block
    let nextLine;
    for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {

        const nextHeader = findBlockHeader(state, nextLine);

        // no aside/blurb or different aside/blurb
        if (!nextHeader || nextHeader.tagName !== header.tagName || nextHeader.className !== header.className) {
            break;
        }

        // otherwise update line markers
        oldBMarks.push(state.bMarks[nextLine]);
        state.bMarks[nextLine] = nextHeader.end;
    }

    // save old indent
    const oldIndent = state.blkIndent;
    state.blkIndent = 0;

    const tagName = header.tagName;
    let token = state.push(`${tagName}_open`, tagName, 1);
    token.markup = header.marker;
    // token.map = lines = [startLine, 0];
    token.info = tagName === "blurb" ? { className: header.className } : null;

    state.md.block.tokenize(state, startLine, nextLine);

    token = state.push(`${tagName}_close`, tagName, -1);
    token.markup = header.marker;

    state.lineMax = oldLineMax;
    state.parentType = oldParentType;
    state.blkIndent = oldIndent;

    return true;
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

        const block = findBlockHeader(state, startLine);
        if (block) {
            return asideBlockHeaderPlugin(state, block, endLine, silent);
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
