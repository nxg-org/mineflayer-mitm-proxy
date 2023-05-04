import { ServerOptions } from "minecraft-protocol";
import { BotOptions } from "mineflayer";
import { ServerBuilder } from "../src/baseServer";
import { GotoPlacePlugin } from "./plugins/basicGoto";



const botOpts: BotOptions = {
  username: "generelSchwerz",
  auth: "microsoft",
  host: "2b2t.org",
  version: "1.12.2",
};

const serverOpts: ServerOptions = {
  version: "1.12.2",
};

const server = new ServerBuilder(serverOpts, botOpts)
  .addPlugin(new GotoPlacePlugin())
  .setSettings({})
  .build();

server.start();
