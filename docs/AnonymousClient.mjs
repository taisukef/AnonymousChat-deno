class AnonymousClient {
  constructor () {
    this.ws = null
    this.user = null
    this.room = null
    this.id = null
    this.callback = null
  }

  async connect (room, callback) {
    this.room = room
    this.callback = callback
    await this.initConnection()
  }

  async initConnection () {
    return new Promise((resolve, reject) => {
      this.ws = null
      try {
        this.ws = new WebSocket('ws://localhost:3000/ws')
      } catch (e) {
        reject(e)
        return
      }
      this.ws.addEventListener('open', async () => {
        const name = new Date().getTime() // anonymous
        const id = localStorage.getItem('id')
        this.id = id
        const passcode = localStorage.getItem('passcode')
        const event1 = { event: 'login', name, id, passcode }
        this.ws.send(JSON.stringify(event1))
    
        const event = { event: 'create', room: this.room }
        this.ws.send(JSON.stringify(event))
        const event2 = { event: 'enter', room: this.room }
        this.ws.send(JSON.stringify(event2))
        resolve()
      })
      this.ws.addEventListener('message', wsevent => {
        const event = JSON.parse(wsevent.data)
        console.log('recv: ', event)
        const e = event.event
        if (e === 'user') {
          this.user = event.data
          localStorage.setItem('id', this.user.id)
          localStorage.setItem('passcode', this.user.passcode)
        } else if (e === 'room') {
          console.log(event.data.messages)
          if (event.data.room === this.room) {
            event.data.messages.forEach(m => this.callback(m))
          }
        } else if (e === 'message') {
          if (event.data.room === this.room) {
            this.callback(event.data.message)
          }
        }
      })
    })
  }

  async send (data) {
    const event = { event: 'message', room: this.room, data }
    console.log('send: ', event)
    if (this.ws.readyState !== WebSocket.OPEN) {
      await this.initConnection()
    }
    if (this.ws.readyState !== WebSocket.OPEN) {
      alert('no connections')
      return
    }
    this.ws.send(JSON.stringify(event))
  }

  isMine (message) {
    console.log(this.id, message.fromid)
    return message.fromid === this.id
  }

  changeRoom (room) {
    const event = { event: 'create', room }
    this.ws.send(JSON.stringify(event))
    const event2 = { event: 'enter', room }
    this.ws.send(JSON.stringify(event2))
    this.room = room
  }
}

export default AnonymousClient
