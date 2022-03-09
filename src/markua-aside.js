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
        var nextLine, token,
            originalParent, originalLineMax,
            start = state.bMarks[startLine] + state.tShift[startLine],
            max = state.eMarks[startLine];

        let src = state.src;
        let isClosingTag = false;
        let tagStart = start;

        if (src.charAt(start) !== "{") {
            return false;
        }

        tagStart++;

        if (src.charAt(tagStart) === "/") {
            isClosingTag = true;
            tagStart++;
        }

        let lastCharPos = tagStart + 5;
        let tagName = src.slice(tagStart, lastCharPos);

        // exit early for unknown tags
        if (!TAGS.has(tagName)) {
            return false;
        }

        let className = "";

        // check for, e.g. {blurb, class: warning}
        if (src.charAt(lastCharPos) === ",") {
            let pos = tagStart + 6;
            pos = state.skipSpaces(pos);

            if (src.slice(pos, pos + 6) !== "class:") {
                return false;
            }

            pos = state.skipSpaces(pos + 6);

            // find closing curly
            let i = pos;
            for (; src.charAt(i) !== "}" && i < max; i++) {
                className += src.charAt(i);
            }

            if (!BLURB_CLASSES.has(className)) {
                console.warn("Unknown blurb class detected:", className);
            }

            lastCharPos = i;
        }

        const hasClosingCurly = src.charAt(lastCharPos) === "}";

        // not an aside or blurb
        if (!hasClosingCurly) {
            return false;
        }

        // Since start is found, we can report success here in validation mode
        //
        if (silent) {
            return true;
        }

        // closing tags are always ignored and we just go to the next line
        if (isClosingTag) {
            state.line = startLine + 1;
            return true;
        }

        // Only dealing with opening tags here

        // TODO: Improper blocks
        /*
         * {aside}foo
         *
         * instead of
         * 
         * {aside}
         * foo
         */
        // let textAfterOpen = false;

        /*
         * Search from the position after the last curly until the end of the line
         * looking for additional characters.
         */
        // for (let i = lastCharPos + 1; i < max; i++) {

        //     // if there's anything other than whitespace, flag it
        //     if (!/\s/.test(src[i])) {
        //         textAfterOpen = true;
        //         break;
        //     }
        // }

        /*
         * Try to detect asides/blurbs on one line, such as:
         * {blurb}Foo{/blurb}.
         */
        const closingTagPos = src.slice(lastCharPos + 1, max).indexOf(`{/${tagName}}`);
        const singleLine = closingTagPos > -1;

        if (singleLine) {
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

                start = state.bMarks[nextLine] + state.tShift[nextLine];
                max = state.eMarks[nextLine];

                // possible blurb end
                if (state.src.slice(start, max).includes(`{/${tagName}}`)) {
                    break;
                }

            }

        }

        originalParent = state.parentType;
        originalLineMax = state.lineMax;
        state.parentType = tagName;
        // this will prevent lazy continuations from ever going past our end marker
        state.lineMax = nextLine;

        token = state.push(tagName + "_open", tagName, 1);
        token.markup = `{${tagName}}`;
        token.block = true;
        token.info = tagName === "blurb" ? { className } : null;
        token.map = [startLine, startLine + 1];

        let originalBMark = state.bMarks[startLine];
        let originalEMark = state.eMarks[startLine];
        let lineToTokenize = startLine + 1;

        // for single line we need to adjust the state
        if (singleLine) {
            state.bMarks[startLine] = lastCharPos + 1;
            state.eMarks[startLine] = lastCharPos + 1 + closingTagPos;
            lineToTokenize = startLine;
        }

        state.md.block.tokenize(state, lineToTokenize, nextLine);

        state.bMarks[startLine] = originalBMark;
        state.eMarks[startLine] = originalEMark;

        token = state.push(tagName + "_close", tagName, -1);
        token.markup = `{/${tagName}}`;
        token.block = true;
        // token.map = [nextLine, nextLine+1];

        state.parentType = originalParent;
        state.lineMax = originalLineMax;
        state.line = nextLine;

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
