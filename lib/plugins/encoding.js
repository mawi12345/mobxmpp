'use strict';

var _require = require('@xmpp/plugin'),
    xml = _require.xml;

var unescapeXMLTable = {
  '&amp;': '&',
  '&#38;': '&',
  '&lt;': '<',
  '&#60;': '<',
  '&gt;': '>',
  '&#62;': '>',
  '&quot;': '"',
  '&#34;': '"',
  '&apos;': "'",
  '&#39;': "'"
};

var unescapeXMLText = function unescapeXMLText(s) {
  return s.replace(/&(amp|#38|lt|#60|gt|#62);/g, function (match) {
    return unescapeXMLTable[match];
  });
};

var decode = function decode(el) {
  return JSON.parse(unescapeXMLText(el.text() || 'null'));
};

var encode = function encode(data) {
  return xml('json', {}, JSON.stringify(data));
};

module.exports = {
  decode: decode,
  encode: encode
};