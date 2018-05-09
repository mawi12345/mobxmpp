import { Client, xml } from '@xmpp/client'
import iqCalleePlugin from './plugins/iq-callee'
import iqCallerPlugin from './plugins/iq-caller'
import { encode, decode } from './plugins/encoding'
import {
  getSnapshot,
  applySnapshot,
  onPatch,
  applyPatch,
} from 'mobx-state-tree'

export default class Connection {

  constructor(options) {
    const opts = {
      ns: 'xapi',
      resource: undefined,
      username: undefined,
      password: undefined,
      url: undefined,
      pingInterval: 0,
      ...options,
    }
    this.subscriptions = []
    this.subscriptionRenewInterval = 10000
    this.pingInterval = options.pingInterval
    this.pingLatency = null
    const resource = opts.resource || Math.random().toString(36).substr(2, 12)
    this.url = opts.url
    this._prefix = opts.ns

    this.client = new Client()
    this.callee = this.client.plugin(iqCalleePlugin)
    this.caller = this.client.plugin(iqCallerPlugin)

    this.client.handle('authenticate', (authenticate) =>
      authenticate(opts.username, opts.password)
    )

    this.client.handle('bind', (bind) => bind(resource))
    this.client.on('online', this._onOnline)
    this.client.on('stanza', this._onStanza)
  }

  connect = () =>
    this.client.start(this.url)

  _onOnline = (jid) => {
    this.jid = jid.toString()
    this.client.send(xml('presence'))
    if (this.pingInterval) {
      clearInterval(this._pingInterval);
      this._pingInterval = setInterval(this._onPingInterval, this.pingInterval);
    }
  }

  _onSubscriptionTimeout = (subscription) => {
    const { jid, location } = subscription
    this.at(jid)
      .set(location, true)
      .then(() => {
        // subscription extended
        subscription.timeout = setTimeout(
          () => this._onSubscriptionTimeout(subscription),
          this.subscriptionRenewInterval
        )
      }).catch((err) => {
        clearTimeout(subscription.timeout)
        delete this.subscriptions[`${jid}/${this.ns(location)}`]
      })
  }

  _onPingInterval = () => {
    const startTime = new Date().getTime()
    this.caller.get(xml('ping', 'urn:xmpp:ping'))
      .then(() => {
        const endTime = new Date().getTime()
        this.pingLatency = endTime - startTime
      })
      .catch((e) => console.error(e))
  }

  _onStanza = (stanza) => {
    if (stanza.name == 'iq' && stanza.attrs.type === 'result') {
      const subscription = this.subscriptions[`${stanza.attrs.from}/${stanza.attrs.id}`]
      if (
        subscription &&
        stanza.children.length === 1 &&
        stanza.children[0].name === 'query' &&
        stanza.children[0].children.length === 1
      ) {
        const patch = decode(stanza.children[0].children[0])
        applyPatch(subscription.model, patch)
      }
    }
  }

  ns = (location) => `${this._prefix}:${location}`

  request = (type, location, handler) => {
    if (type !== 'get' && type !== 'set') throw new Error('invalid type');
    const ns = this.ns(location)
    this.callee[type](ns, (query) => new Promise((resolve, reject) => {
      // request
      const req = {
        data: decode(query.children[0]),
        type,
        location,
        id: query.parent.attrs.id,
        jid: query.parent.attrs.from,
      }
      // response
      const res = {
        resolve: (data) => resolve(encode(data)),
        reject,
      }
      // call handler
      handler(req, res)
    }));
  }

  call = (jid, type, location, value) =>
    this.caller[type](
      xml('query', this.ns(location), encode(value)),
      jid
    ).then(decode)

  get = (location, handler) => this.request('get', location, handler)

  set = (location, handler) => this.request('set', location, handler)

  publish = (location, model, filter, deregister) => {
    const users = {}
    const subscriptionFilter = filter || ((filterReq, filterRes) => filterRes.resolve())

    const deregisterSubscriber = (jid) => {
      if (users[jid]) {
        delete users[jid]
        try {
          if (deregister) deregister(jid)
        } catch(e) {
          console.error(e)
        }
      }
    }

    this.request('get', location, (req, res) => {
      const filterPromise = new Promise((resolve, reject) => {
        const filterRes = {
          resolve,
          reject,
        }
        subscriptionFilter(req, filterRes)
      })

      filterPromise.then(() => {
        // add user
        users[req.jid] = new Date().getTime()
        res.resolve(getSnapshot(model))
      }).catch(() => res.reject(new Error('access not allowed')))
    })

    this.request('set', location, (req, res) => {
      // remove user
      if (users[req.jid] && req.data === null) {
        deregisterSubscriber(req.jid)
      } else if (users[req.jid] && req.data === true) {
        // extend subscription
        users[req.jid] = new Date().getTime()
      }
      res.resolve()
    })

    onPatch(model, (patch) => {
      const minTime = new Date().getTime() - Math.round(this.subscriptionRenewInterval * 1.2)
      Object.keys(users).map((jid) => {
        if (users[jid] < minTime) {
          deregisterSubscriber(jid)
          return Promise.resolve()
        } else {
          return this.at(jid).patch(location, patch)
        }
      })
    })
  }

  at = (jid) => ({
    set: (location, value) => this.call(jid, 'set', location, value),
    get: (location) => this.call(jid, 'get', location),
    patch: (location, value) => {
      const ns = this.ns(location)
      const iq = xml('iq', {
        to: jid,
        id: ns,
        type: 'result',
      }, xml('query', {
        xmlns: ns,
      }, encode(value)))
      this.client.send(iq)
    },
    subscribe: (location, model) =>
      this.at(jid).get(location)
      .then((snapshot) => applySnapshot(model, snapshot))
      .then(() => {
        // store {jid, location, model}
        // on matching patch iq update model see constructor
        const subscription = {
          model,
          jid,
          location,
        }
        subscription.timeout = setTimeout(
          () => this._onSubscriptionTimeout(subscription),
          this.subscriptionRenewInterval
        )
        this.subscriptions[`${jid}/${this.ns(location)}`] = subscription
      })
  })
}
