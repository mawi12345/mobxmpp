'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _require = require('@xmpp/plugin'),
    plugin = _require.plugin,
    xml = _require.xml;

var NS_STANZA = 'urn:ietf:params:xml:ns:xmpp-stanzas';

module.exports = plugin('iq-callee', {
  getters: new Map(),
  setters: new Map(),
  match: function match(stanza) {
    return stanza.is('iq') && stanza.attrs.id && (stanza.attrs.type === 'get' || stanza.attrs.type === 'set');
  },
  get: function get(ns, fn) {
    this.getters.set(ns, fn);
  },
  set: function set(ns, fn) {
    this.setters.set(ns, fn);
  },
  start: function start() {
    var _this = this;

    this.handler = function (stanza) {
      if (!_this.match(stanza)) {
        return;
      }

      var _stanza$attrs = stanza.attrs,
          id = _stanza$attrs.id,
          type = _stanza$attrs.type;


      var iq = xml('iq', {
        to: stanza.attrs.from,
        id: id
      });

      var _stanza$children = _slicedToArray(stanza.children, 1),
          child = _stanza$children[0];

      var handler = (type === 'get' ? _this.getters : _this.setters).get(child.attrs.xmlns);

      if (!handler) {
        iq.attrs.type = 'error';
        iq.append(child.clone());
        iq.append(xml('error', { type: 'cancel' }, xml('service-unvailable', NS_STANZA)));
        _this.entity.send(iq);
        return;
      }

      Promise.resolve(handler(child)).then(function (el) {
        iq.attrs.type = 'result';
        if (el) {
          iq.append(el);
        }
        _this.entity.send(iq);
      }).catch(function (err) {
        iq.attrs.type = 'error';
        iq.append(child.clone());
        if (err instanceof xml.Element) {
          iq.append(err);
        } else if (err) {
          iq.append(xml('error', { type: 'cancel' }, xml('internal-server-error', NS_STANZA)));
        }
        _this.entity.send(iq);
      });
    };
    this.entity.on('element', this.handler);
  },
  stop: function stop() {
    this.entity.removeListener('element', this.handler);
    delete this.handler;
  }
});