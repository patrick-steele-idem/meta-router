'use strict';
const pluginTester = require("babel-plugin-tester");
const plugin = require("babel-plugin-macros");
const prettier = require("prettier");
const path = require("path");

describe('meta-router/macro' , () => {
    pluginTester({
      plugin,
      babelOptions: {
        filename: __filename,
      },
      formatResult(result) {
        return prettier.format(result, { trailingComma: "es5" });
      },
      fixtures: path.join(__dirname, 'fixtures', 'macro')
    });
});
