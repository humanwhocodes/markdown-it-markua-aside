# Markua Aside Plugin for markdown-it

by [Nicholas C. Zakas](https://humanwhocodes.com)

If you find this useful, please consider supporting my work with a [donation](https://humanwhocodes.com/donate).

## Description

A [markdown-it](https://github.com/markdown-it/markdown-it) plugin to support Markua-style [asides](https://leanpub.com/markua/read#leanpub-auto-asides-a-or-aside) and [blurbs](https://leanpub.com/markua/read#leanpub-auto-blurbs-b-or-blurb), such as:

```
{aside}Something said to the side.{/aside}

{blurb}Something else you should know.{/blurb}

{blurb, class: warning}
Don't do this!
{/blurb}

A> Something said to the site.

B> Something else you should know.
```


## Prerequisites

* Node.js 12.22+

## Usage

Install using [npm][npm] or [yarn][yarn]:

```
npm install @humanwhocodes/markdown-it-markua-aside --save

# or

yarn add @humanwhocodes/markdown-it-markua-aside
```

Import into your project:

```js
// CommonJS
const { asidePlugin } = require("@humanwhocodes/markdown-it-markua-aside");

// ESM
import { asidePlugin } from "@humanwhocodes/markdown-it-markua-aside";
```

## API

After importing, create a new instance of `DataExtractor`. The constructor expects one object argument that defines the data schema.

For example:

```js
import MarkdownIt from "markdown-it";
import { asidePlugin } from "@humanwhocodes/markdown-it-markua-aside";

// create a new instance
const md = new MarkdownIt();

// install the plugin
md.use(asidePlugin);

// render your text
const result = md.render("{aside}Hello world!{/aside}");
```

## Developer Setup

1. Fork the repository
2. Clone your fork
3. Run `npm install` to setup dependencies
4. Run `npm test` to run tests

## License

Apache 2.0

[npm]: https://npmjs.com/
[yarn]: https://yarnpkg.com/
