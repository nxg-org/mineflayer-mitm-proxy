import { ServerOptions } from "minecraft-protocol";
import { BotOptions } from "mineflayer";
import { ServerBuilder } from "../src/baseServer";
import { SpectatorServerPlugin } from "./plugins/spectator";
import findEntity from "./plugins/findEntity";

const GotoPlacePlugin = require('./plugins/basicGoto')

const botOpts: BotOptions = {
  username: "generelSchwez",
  auth: "offline",
  host: process.argv[2] ?? "2b2t.org",
  port: isNaN(Number(process.argv[3])) ? 25565 : Number(process.argv[3]),
  version: process.argv[4] ?? "1.19.4",
  skipValidation: true
};

const serverOpts: ServerOptions = {
  version: process.argv[4] ?? "1.19.4",
  port: 25566
};

const server = new ServerBuilder(serverOpts, botOpts)
  .addPlugin(new SpectatorServerPlugin())
  .addPlugin(new findEntity()) 
  .addPlugin(new GotoPlacePlugin())
  .setSettings({linkOnConnect: true,worldCaching: true, test:true}) 
  
  .build();

server.start();

const test = server.getPlugin("GotoPlacePlugin")
