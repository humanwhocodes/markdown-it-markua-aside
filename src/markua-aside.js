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

//-----------------------------------------------------------------------------
// Helpers
//-----------------------------------------------------------------------------



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
        let nextLine, token,
            originalParent, originalLineMax;

        let isSingleLine = false;

        // try to find start tag on this line
        const startTag = findStartTag(state, startLine);
        if (!startTag) {
            return false;
        }

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
        originalParent = state.parentType;
        originalLineMax = state.lineMax;
        state.parentType = tagName;
        // this will prevent lazy continuations from ever going past our end marker
        state.lineMax = nextLine;

        token = state.push(tagName + "_open", tagName, 1);
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

    md.block.ruler.before("paragraph", "aside", aside, {
        alt: ["paragraph", "reference", "blockquote", "list"]
    });

    md.renderer.rules["aside_open"] = renderAside;
    md.renderer.rules["aside_close"] = renderAside;
    md.renderer.rules["blurb_open"] = renderBlurb;
    md.renderer.rules["blurb_close"] = renderBlurb;
}
