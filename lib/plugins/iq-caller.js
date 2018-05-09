'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var _require = require('@xmpp/plugin'),
    plugin = _require.plugin,
    xml = _require.xml;

var xid = function xid() {
  var i = void 0;
  while (!i) {
    i = Math.random().toString(36).substr(2, 12);
  }
  return i;
};

module.exports = plugin('iq-caller', {
  start: function start() {
    var _this = this;

    this.handlers = new Map();
    this.handler = function (stanza) {
      if (!_this.match(stanza)) {
        return;
      }

      var id = stanza.attrs.id;


      var handler = _this.handlers.get(id);

      if (!handler) {
        return;
      }

      if (stanza.attrs.type === 'error') {
        handler[1](stanza.getChild('error'));
      } else {
        handler[0](stanza.children[0]);
      }
      _this.handlers.delete(id);
    };
    this.entity.on('element', this.handler);
  },
  stop: function stop() {
    this.entity.removeListener('element', this.handler);
  },
  match: function match(stanza) {
    return stanza.name === 'iq' && (stanza.attrs.type === 'error' || stanza.attrs.type === 'result');
  },
  get: function get(child) {
    for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
      args[_key - 1] = arguments[_key];
    }

    return this.request.apply(this, [xml('iq', { type: 'get' }, child)].concat(_toConsumableArray(args)));
  },
  set: function set(child) {
    for (var _len2 = arguments.length, args = Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
      args[_key2 - 1] = arguments[_key2];
    }

    return this.request.apply(this, [xml('iq', { type: 'set' }, child)].concat(_toConsumableArray(args)));
  },
  request: function request(stanza, params) {
    var _this2 = this;

    if (typeof params === 'string') {
      params = { to: params };
    }

    var _ref = params || {},
        to = _ref.to,
        id = _ref.id;

    if (to) {
      stanza.attrs.to = to;
    }

    if (id) {
      stanza.attrs.id = id;
    } else if (!stanza.attrs.id) {
      stanza.attrs.id = xid();
    }

    return Promise.all([new Promise(function (resolve, reject) {
      _this2.handlers.set(stanza.attrs.id, [resolve, reject]);
    }), this.entity.send(stanza).catch(function (err) {
      _this2.handlers.delete(stanza.attrs.id);
      throw err;
    })]).then(function (_ref2) {
      var _ref3 = _slicedToArray(_ref2, 1),
          res = _ref3[0];

      return res;
    });
  }
});