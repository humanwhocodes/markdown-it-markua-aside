/**
 * @fileoverview Tests for Data Extractor
 * @author Nicholas C. Zakas
 */

/* global describe */

//-----------------------------------------------------------------------------
// Imports
//-----------------------------------------------------------------------------

import { asidePlugin } from "../src/markua-aside.js";
import MarkdownIt from "markdown-it";
import { fileURLToPath } from "url";
import fs from "fs";
import path from "path";
import generate from "markdown-it-testgen";

//-----------------------------------------------------------------------------
// Helpers
//-----------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, "fixtures");
const filenames = fs.readdirSync(FIXTURES_DIR)
    .filter(filename => filename.endsWith(".txt"))
    .map(filename => path.join(FIXTURES_DIR, filename));
const md = new MarkdownIt();

md.use(asidePlugin, "aside");

//-----------------------------------------------------------------------------
// Tests
//-----------------------------------------------------------------------------

describe("Markua Aside Plugin", () => {

    for (const filename of filenames) {
        describe(path.basename(filename), () => {
            generate(filename, md);
        });
    }
});
