import { listenAndServe } from 'https://deno.land/std/http/server.ts'
import { acceptWebSocket, acceptable, isWebSocketCloseEvent } from 'https://deno.land/std/ws/mod.ts'
import { v4 } from 'https://deno.land/std/uuid/mod.ts'
import { serveWeb } from 'https://taisukef.github.io/denolib/webserver.mjs'
import dotenv from 'https://taisukef.github.io/denolib/dotenv.mjs'

dotenv.config()
const PORT = parseInt(Deno.env.get('PORT')) || 3000

class House {
  constructor () {
    this.rooms = new Map()
    this.users = new Map()
  }

  async serve (port) {
    listenAndServe({ port }, async req => {
      if (req.method === 'GET' && req.url === '/ws') {
        if (acceptable(req)) {
          const wsreq = {
            conn: req.conn,
            bufReader: req.r,
            bufWriter: req.w,
            headers: req.headers
          }
          const wsock = await acceptWebSocket(wsreq)
          await this.accept(wsock)
        }
      } else {
        serveWeb(req)
      }
    })
    console.log(`started on port ${PORT}`)
  }

  async accept (ws) {
    let user = null
    for await (const data of ws) {
      if (isWebSocketCloseEvent(data)) { // code: 1001
        break
      }
      const event = JSON.parse(data)
      const e = event.event
      if (e === 'login') {
        user = this.users.get(event.id)
        if (user) {
          if (user.passcode !== event.passcode) {
            await ws.send(JSON.stringify({ event: 'error', data: 'please login' }))
          } else {
            user.attachWebSocket(ws)
          }
        }
        if (!user) {
          user = new User(ws, this.getValidName(event.name))
          this.users.set(user.id, user)
        }
        user.sendOne(ws, user.getData())
      } else if (user === null) {
        await ws.send(JSON.stringify({ event: 'error', data: 'please login' }))
      } else if (e === 'create') {
        let room = this.rooms.get(event.room)
        if (room) {
          await user.sendOne(ws, { event: 'error', data: 'already exists' })
          continue
        }
        room = new Room(event.room, user)
        this.rooms.set(event.room, room)
        user.send(room.getData())
      } else if (e === 'enter') {
        const room = await this.getRoom(user, event.room)
        if (!room) { continue }
        if (room.users.indexOf(user) < 0) {
          room.users.push(user)
          const rep = { event: 'enter', data: { id: user.id, name: user.name } }
          room.users.forEach(u => u.send(rep))
        }
        user.sendOne(ws, room.getData())
      } else if (e === 'leave') {
        const room = await this.getRoom(user, event.room)
        if (!room) { continue }
        const n = room.users.indexOf(user)
        if (n < 0) {
          await user.sendOne(ws, { event: 'error', data: 'not member' })
          continue
        }
        const rep = { event: 'leave', data: { id: user.id, name: user.name } }
        room.users.forEach(u => u.send(rep))
        room.users.splice(n, 1)
      } else if (e === 'message') {
        const room = await this.getRoom(user, event.room)
        if (!room) { continue }
        if (room.users.indexOf(user) < 0) {
          await user.sendOne(ws, { event: 'error', data: 'not member' })
          continue
        }

        // special command
        if (event.data.text === '/clearall') {
          room.messages = []
          return
        }

        const message = { fromid: user.id, name: user.name, data: event.data }
        // console.log(room, room.messages)
        room.messages.push(message)
        const e = { event: 'message', data: { room: room.name, message } }
        room.users.forEach(u => u.send(e))
      } else {
        await user.sendOne(ws, { event: 'error', data: 'unknown event' })
      }
    }
  }

  async getRoom (user, rname) {
    const room = this.rooms.get(rname)
    if (!room) {
      await user.send({ event: 'error', data: 'not found ' + rname })
      return null
    }
    return room
  }

  getValidName (name) {
    if (name == null) { name = '' }
    name = name.toString().trim()
    if (name.length === 0) { name = 'no name' }
    for (;;) {
      let flg = false
      this.users.forEach(v => { flg = flg || v.name === name })
      if (!flg) { break }
      name += '\''
    }
    return name
  }
}

class Room {
  constructor (name, owner) {
    this.id = v4.generate()
    this.name = name
    this.owner = owner
    this.users = [owner]
    this.messages = []
  }

  getData () {
    return {
      event: 'room',
      data: {
        id: this.id,
        room: this.name,
        users: this.users.map(u => { return { id: u.id, name: u.name } }),
        messages: this.messages
      }
    }
  }
}

class User {
  constructor (ws, name) {
    this.ws = [ws]
    this.name = name
    this.id = v4.generate()
    this.passcode = v4.generate()
    this.rooms = []
  }

  async sendOne (ws, json) {
    try {
      ws.send(JSON.stringify(json))
    } catch (e) {
    }
  }

  async send (json) {
    let remflg = false
    for (let i = 0; i < this.ws.length; i++) {
      try {
        this.ws[i].send(JSON.stringify(json))
      } catch (e) {
        this.ws[i] = null
        remflg = true
        // console.log('send', e)
      }
    }
    if (remflg) { this.ws = this.ws.filter(w => w) }
  }

  attachWebSocket (ws) {
    this.ws.push(ws)
  }

  getData () {
    return {
      event: 'user',
      data: {
        id: this.id,
        passcode: this.passcode,
        name: this.name,
        rooms: this.rooms.map(r => r.name)
      }
    }
  }
}

const house = new House()
house.serve(PORT)
