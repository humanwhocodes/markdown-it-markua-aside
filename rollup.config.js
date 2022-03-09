/**
 * @fileoverview Rollup configuration file
 * @author Nicholas C. Zakas
 */

export default [
    {
        input: "src/markua-aside.js",
        output: [
            {
                file: "dist/markua-aside.cjs",
                format: "cjs"
            },
            {
                file: "dist/markua-aside.js",
                format: "esm"
            }
        ]
    }    
];
