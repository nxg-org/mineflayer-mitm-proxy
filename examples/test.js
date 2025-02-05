const { ServerBuilder } = require('../lib/baseServer');
const GotoPlacePlugin  = require('./plugins/basicGoto');
const SpectatorPlugin = require('./plugins/spectator');
// const { default: findEntity } = require('./plugins/findEntity');

console.log(GotoPlacePlugin)

const botOpts = {
  username: "generelSchwerz",
  auth: "microsoft",
  host: "localhost",
  version: "1.21.1",
};

const serverOpts = {
  version: "1.21.1",
  port: 25566,
  "online-mode": false,
};

const server = new ServerBuilder(serverOpts, botOpts)
  .addPlugin(new GotoPlacePlugin())
  addPlugin(new SpectatorPlugin())
  // .addPlugin(findEntity)
  .setSettings({})
  .build();

server.start();
