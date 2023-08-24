import { ServerOptions } from "minecraft-protocol";
import { BotOptions } from "mineflayer";
import { ServerBuilder } from "../src/baseServer";
// import { GotoPlacePlugin } from "./plugins/basicGoto";
import findEntity from "./plugins/findEntity";


const GotoPlacePlugin = require('./plugins/basicGoto')

const botOpts: BotOptions = {
  username: "generelSchwerz",
  auth: "microsoft",
  host: "2b2t.org",
  version: "1.19.4",
};

const serverOpts: ServerOptions = {
  version: "1.19.4",
  port: 25566
};

const server = new ServerBuilder(serverOpts, botOpts)
  // .addPlugin(new GotoPlacePlugin())
  .addPlugin(GotoPlacePlugin)
  // .addPlugin(findEntity)  
  .build();

server.start();

const test = server.getPlugin("GotoPlacePlugin")
