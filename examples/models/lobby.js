const mst = require('mobx-state-tree')
const types = mst.types

const User = types.model({
  id: types.identifier(types.string),
  jid: types.maybe(types.string),
  nickname: types.maybe(types.string),
}).named('User');


const uniqIdGenertor = (prefix) => {
  let newId = 0
  return () => {
    const id = newId
    newId += 1
    return `${prefix}${id}`
  }
}

const userIdGenerator = uniqIdGenertor('u')

const LobbyStore = types
    .model({
      time: new Date().getTime(),
      users: types.map(User),
    })
    .named('Lobby')
    .views((self) => ({
      // utilities
      findUserByJid(jid) {
        for (let user of self.users.values()) {
          if (user.jid === jid) {
            return user
          }
        }
        return null;
      },
    }))
    .actions((self) => ({
      setTime(time) {
        self.time = time;
      },
      setNickname(jid, nickname) {
        const user = self.findUserByJid(jid)
        if (user) {
          user.nickname = nickname
        }
      },
      addUser({ jid }) {
        const user = self.findUserByJid(jid)
        if (!user) {
          self.users.put({
            id: userIdGenerator(),
            jid,
          });
        }
      },
      deleteUser({ jid }) {
        const user = self.findUserByJid(jid);
        self.users.delete(user.id);
      },
    }));

module.exports = LobbyStore;
