const { ServerBuilder } = require('../lib/baseServer');
const { GotoPlacePlugin } = require('./plugins/basicGoto');
const { default: findEntity } = require('./plugins/findEntity');


const botOpts = {
  username: "generelSchwerz",
  auth: "microsoft",
  host: "localhost",
  version: "1.12.2",
};

const serverOpts = {
  version: "1.12.2",
  port: 25566,
};

const server = new ServerBuilder(serverOpts, botOpts)
  .addPlugin(new GotoPlacePlugin())
  .addPlugin(findEntity)
  .setSettings({})
  .build();

server.start();
