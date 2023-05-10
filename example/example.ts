import { ServerOptions } from "minecraft-protocol";
import { BotOptions } from "mineflayer";
import { ServerBuilder } from "../src/baseServer";
import { GotoPlacePlugin } from "./plugins/basicGoto";
import findEntity from "./plugins/findEntity";



const botOpts: BotOptions = {
  username: "generelSchwerz",
  auth: "microsoft",
  host: "localhost",
  version: "1.12.2",
};

const serverOpts: ServerOptions = {
  version: "1.12.2",
  port: 25566
};

const server = new ServerBuilder(serverOpts, botOpts)
  // .addPlugin(new GotoPlacePlugin())
  .addPluginStatic(GotoPlacePlugin)
  // .addPlugin(findEntity)  
  .build();

server.start();

const test = server.getPlugin("GotoPlacePlugin")
