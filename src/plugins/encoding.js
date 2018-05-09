const {xml} = require('@xmpp/plugin')

const unescapeXMLTable = {
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
}

const unescapeXMLText = (s) => {
  return s.replace(/&(amp|#38|lt|#60|gt|#62);/g, (match) => unescapeXMLTable[match])
}

const decode = (el) => JSON.parse(unescapeXMLText(el.text() || 'null'))

const encode = (data) => xml('json', {}, JSON.stringify(data))

module.exports = {
  decode,
  encode
}
