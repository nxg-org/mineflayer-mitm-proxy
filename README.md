# mineflayer-mitm-proxy


### Basic Usage
```js
const { ServerBuilder } = require('@nxg-org/mineflayer-mitm-proxy');

// load your plugin implementation
const { GotoPlacePlugin } = require('./plugins/basicGoto'); 


// use the bot's normal settings here.
const botOpts = {
  username: "generelSchwerz",
  auth: "microsoft",
  host: "localhost",
  version: "1.12.2",
};

// configure the local server options here.
const serverOpts = {
  version: "1.12.2",
  port: 25566,
};

// use a ServerBuilder to strongly build a server!
const server = new ServerBuilder(serverOpts, botOpts)
  .addPlugin(new GotoPlacePlugin())
  .setSettings({})
  .build();


// start the server whenever.
server.start();
```

I will include full documentation at a later date.