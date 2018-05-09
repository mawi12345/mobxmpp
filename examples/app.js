
const Connection = require('..')
const lobbyFactory = require('./models/lobby')
const { autorun } = require('mobx')
const { getSnapshot, applySnapshot, onPatch } = require('mobx-state-tree')
const isServer = !!process.env['SERVER']

const username = 'test@chat.example.com'
const password = 'changeme'
const url = 'wss://chat.example.com/ws'

const app = new Connection({
  username,
  password,
  url,
  resource: isServer ? 'server' : null
})

const lobby = lobbyFactory.create({ users: {} })

// example of a model snapshot filter (remove jid)
const filterLobby = (s) => {
  const filtered = Object.assign(
    {},
    s,
    { users: {} }
  )

  Object.keys(s.users).forEach((uid) => {
    filtered.users[uid] = {
      id: uid,
      nickname: s.users[uid].nickname,
    }
  })

  return filtered
}

console.log(`start as ${isServer ? 'server' : 'client'}`)

app.connect().then(() => {
  console.log('is connected')
  if (isServer) {

    // fliter internal model
    const publicLobby = lobbyFactory.create(getSnapshot(lobby))
    onPatch(lobby, () => {
      const snapshot = getSnapshot(lobby)
      // console.log(`internal lobby changed`, snapshot)
      applySnapshot(publicLobby, filterLobby(snapshot))
    })

    // mock model
    setInterval(() => {
      console.log('update time')
      lobby.setTime(new Date().getTime())
    }, 3000)

    app.publish('lobby', publicLobby, (req, res) => {
      console.log(`${req.jid} has subscribed lobby`)
      lobby.addUser({ jid: req.jid })
      res.resolve()

    }, (jid) => {
      // deregister subscriber callback
      console.log(`${jid} has unsubscribed lobby`)
      lobby.deleteUser({ jid: jid })
    })

    app.get('motd', (req, res) => {
      res.resolve('Hello World')
    })

    app.set('nickname', (req, res) => {
      console.log(`${req.jid} is now ${req.data}`)
      lobby.setNickname(req.jid, req.data)
      res.resolve()
    })
  } else {
    const server = app.at(`${username}/server`)

    server
      .get('motd')
      .then((motd) => {
        console.log(`motd ${motd}`)
      }).then(() =>
        server.subscribe('lobby', lobby)
      ).then(() => {
        console.log('joined lobby')
      }).then(() =>
        server.set('nickname', 'spongebob')
      ).then(() => {
        console.log('nickname changed')
      })
      .catch((e) => console.error(e))

    autorun(() => {
      console.log(`time: ${lobby.time}`)

      for (let user of lobby.users.values()) {
        console.log(`  ${user.id} ${user.nickname}`)
      }
    })
  }
}).catch((e) => console.error(`Connection ${e}
Please change username, password and url in examples/app.js`))
