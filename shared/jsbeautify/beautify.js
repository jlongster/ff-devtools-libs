var { cssBeautify } = require("ff-devtools-libs/shared/jsbeautify/src/beautify-css");
var { htmlBeautify } = require("ff-devtools-libs/shared/jsbeautify/src/beautify-html");
var { jsBeautify } = require("ff-devtools-libs/shared/jsbeautify/src/beautify-js");

exports.css = cssBeautify;
exports.html = htmlBeautify;
exports.js = jsBeautify;
