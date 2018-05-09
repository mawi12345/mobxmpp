'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _client = require('@xmpp/client');

var _iqCallee = require('./plugins/iq-callee');

var _iqCallee2 = _interopRequireDefault(_iqCallee);

var _iqCaller = require('./plugins/iq-caller');

var _iqCaller2 = _interopRequireDefault(_iqCaller);

var _encoding = require('./plugins/encoding');

var _mobxStateTree = require('mobx-state-tree');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Connection = function Connection(options) {
  var _this = this;

  _classCallCheck(this, Connection);

  this.connect = function () {
    return _this.client.start(_this.url);
  };

  this._onOnline = function (jid) {
    _this.jid = jid.toString();
    _this.client.send((0, _client.xml)('presence'));
    if (_this.pingInterval) {
      clearInterval(_this._pingInterval);
      _this._pingInterval = setInterval(_this._onPingInterval, _this.pingInterval);
    }
  };

  this._onSubscriptionTimeout = function (subscription) {
    var jid = subscription.jid,
        location = subscription.location;

    _this.at(jid).set(location, true).then(function () {
      // subscription extended
      subscription.timeout = setTimeout(function () {
        return _this._onSubscriptionTimeout(subscription);
      }, _this.subscriptionRenewInterval);
    }).catch(function (err) {
      clearTimeout(subscription.timeout);
      delete _this.subscriptions[jid + '/' + _this.ns(location)];
    });
  };

  this._onPingInterval = function () {
    var startTime = new Date().getTime();
    _this.caller.get((0, _client.xml)('ping', 'urn:xmpp:ping')).then(function () {
      var endTime = new Date().getTime();
      _this.pingLatency = endTime - startTime;
    }).catch(function (e) {
      return console.error(e);
    });
  };

  this._onStanza = function (stanza) {
    if (stanza.name == 'iq' && stanza.attrs.type === 'result') {
      var subscription = _this.subscriptions[stanza.attrs.from + '/' + stanza.attrs.id];
      if (subscription && stanza.children.length === 1 && stanza.children[0].name === 'query' && stanza.children[0].children.length === 1) {
        var patch = (0, _encoding.decode)(stanza.children[0].children[0]);
        (0, _mobxStateTree.applyPatch)(subscription.model, patch);
      }
    }
  };

  this.ns = function (location) {
    return _this._prefix + ':' + location;
  };

  this.request = function (type, location, handler) {
    if (type !== 'get' && type !== 'set') throw new Error('invalid type');
    var ns = _this.ns(location);
    _this.callee[type](ns, function (query) {
      return new Promise(function (_resolve, reject) {
        // request
        var req = {
          data: (0, _encoding.decode)(query.children[0]),
          type: type,
          location: location,
          id: query.parent.attrs.id,
          jid: query.parent.attrs.from
          // response
        };var res = {
          resolve: function resolve(data) {
            return _resolve((0, _encoding.encode)(data));
          },
          reject: reject
          // call handler
        };handler(req, res);
      });
    });
  };

  this.call = function (jid, type, location, value) {
    return _this.caller[type]((0, _client.xml)('query', _this.ns(location), (0, _encoding.encode)(value)), jid).then(_encoding.decode);
  };

  this.get = function (location, handler) {
    return _this.request('get', location, handler);
  };

  this.set = function (location, handler) {
    return _this.request('set', location, handler);
  };

  this.publish = function (location, model, filter, deregister) {
    var users = {};
    var subscriptionFilter = filter || function (filterReq, filterRes) {
      return filterRes.resolve();
    };

    var deregisterSubscriber = function deregisterSubscriber(jid) {
      if (users[jid]) {
        delete users[jid];
        try {
          if (deregister) deregister(jid);
        } catch (e) {
          console.error(e);
        }
      }
    };

    _this.request('get', location, function (req, res) {
      var filterPromise = new Promise(function (resolve, reject) {
        var filterRes = {
          resolve: resolve,
          reject: reject
        };
        subscriptionFilter(req, filterRes);
      });

      filterPromise.then(function () {
        // add user
        users[req.jid] = new Date().getTime();
        res.resolve((0, _mobxStateTree.getSnapshot)(model));
      }).catch(function () {
        return res.reject(new Error('access not allowed'));
      });
    });

    _this.request('set', location, function (req, res) {
      // remove user
      if (users[req.jid] && req.data === null) {
        deregisterSubscriber(req.jid);
      } else if (users[req.jid] && req.data === true) {
        // extend subscription
        users[req.jid] = new Date().getTime();
      }
      res.resolve();
    });

    (0, _mobxStateTree.onPatch)(model, function (patch) {
      var minTime = new Date().getTime() - Math.round(_this.subscriptionRenewInterval * 1.2);
      Object.keys(users).map(function (jid) {
        if (users[jid] < minTime) {
          deregisterSubscriber(jid);
          return Promise.resolve();
        } else {
          return _this.at(jid).patch(location, patch);
        }
      });
    });
  };

  this.at = function (jid) {
    return {
      set: function set(location, value) {
        return _this.call(jid, 'set', location, value);
      },
      get: function get(location) {
        return _this.call(jid, 'get', location);
      },
      patch: function patch(location, value) {
        var ns = _this.ns(location);
        var iq = (0, _client.xml)('iq', {
          to: jid,
          id: ns,
          type: 'result'
        }, (0, _client.xml)('query', {
          xmlns: ns
        }, (0, _encoding.encode)(value)));
        _this.client.send(iq);
      },
      subscribe: function subscribe(location, model) {
        return _this.at(jid).get(location).then(function (snapshot) {
          return (0, _mobxStateTree.applySnapshot)(model, snapshot);
        }).then(function () {
          // store {jid, location, model}
          // on matching patch iq update model see constructor
          var subscription = {
            model: model,
            jid: jid,
            location: location
          };
          subscription.timeout = setTimeout(function () {
            return _this._onSubscriptionTimeout(subscription);
          }, _this.subscriptionRenewInterval);
          _this.subscriptions[jid + '/' + _this.ns(location)] = subscription;
        });
      }
    };
  };

  var opts = _extends({
    ns: 'xapi',
    resource: undefined,
    username: undefined,
    password: undefined,
    url: undefined,
    pingInterval: 0
  }, options);
  this.subscriptions = [];
  this.subscriptionRenewInterval = 10000;
  this.pingInterval = options.pingInterval;
  this.pingLatency = null;
  var resource = opts.resource || Math.random().toString(36).substr(2, 12);
  this.url = opts.url;
  this._prefix = opts.ns;

  this.client = new _client.Client();
  this.callee = this.client.plugin(_iqCallee2.default);
  this.caller = this.client.plugin(_iqCaller2.default);

  this.client.handle('authenticate', function (authenticate) {
    return authenticate(opts.username, opts.password);
  });

  this.client.handle('bind', function (bind) {
    return bind(resource);
  });
  this.client.on('online', this._onOnline);
  this.client.on('stanza', this._onStanza);
};

exports.default = Connection;