// import mcproxy, replace ".."
// with "@rob9315/mcproxy" in your project
const mcproxy = require('@GenerelSchwerz/mcproxy');
const minecraft_protocol = require('minecraft-protocol');

const VERSION = '1.21.1';
const REMOTE_HOST = '2b2t.org';
const REMOTE_PORT = 25565;
const LOCAL_PORT = 25566;

// initialize bot instance like you would with mineflayer
// https://github.com/PrismarineJS/mineflayer
let conn = new mcproxy.Conn({
  username: 'Generel_Schwerz',
  auth:'microsoft',
  version: VERSION,
  host: REMOTE_HOST,
  port: REMOTE_PORT,
  // skipValidation: true,
});

// do stuff with your bot
conn.stateData.bot.on('spawn', async () => {
  console.log('spawn');
});
conn.stateData.bot.on('error', (err) => {
  console.error(err);
});
conn.stateData.bot.on('end', (reason) => {
  console.error(reason);
  process.exit(1);
});

// open a server
// https://github.com/PrismarineJS/node-minecraft-protocol
const server = minecraft_protocol.createServer({
  version: VERSION,
  host: '127.0.0.1',
  'online-mode': false,
  port: LOCAL_PORT,
});

server.on('listening', () => {
  console.info('Listening on', LOCAL_PORT);
});

// accept client connections on your server,
// make sure not to use "connection" instead of "login"
server.on('login', async (client) => {
  // send packets recreating the current game state to the client
  client.on('state', (now) => {
    if (now !== 'play') return
    conn.sendPackets(client);

    conn.link(client);
  })

  client.on('end', (reason) => {
    console.log(reason)
  })
  // call .link on the incoming client to make the
  // it the one to receive and send all packets
  // conn.link(client);
});
