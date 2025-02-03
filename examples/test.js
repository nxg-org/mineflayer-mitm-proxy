const { ServerBuilder } = require('../lib/baseServer');
const GotoPlacePlugin  = require('./plugins/basicGoto');
// const { default: findEntity } = require('./plugins/findEntity');

console.log(GotoPlacePlugin)

const botOpts = {
  username: "generelSchwerz",
  auth: "microsoft",
  host: "2b2t.org",
  version: "1.21.1",
};

const serverOpts = {
  version: "1.21.1",
  port: 25566,
};

const server = new ServerBuilder(serverOpts, botOpts)
  .addPlugin(new GotoPlacePlugin())
  // .addPlugin(findEntity)
  .setSettings({})
  .build();

server.start();
