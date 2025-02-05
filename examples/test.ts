import { ServerOptions } from "minecraft-protocol";
import { BotOptions } from "mineflayer";
import { IProxyServerOpts, ServerBuilder } from "../src/baseServer";
import { SpectatorServerPlugin } from "./plugins/spectator";
import findEntity from "./plugins/findEntity";

const GotoPlacePlugin = require("./plugins/basicGoto");

const botOpts: BotOptions = {
  username: "Generel_Schwerz",
  auth: "offline",
  host: process.argv[2] ?? "localhost",
  port: isNaN(Number(process.argv[3])) ? 25565 : Number(process.argv[3]),
  version: process.argv[4] ?? "1.21.1",
  skipValidation: true,
};

const serverOpts: ServerOptions = {
  version: process.argv[4] ?? "1.21.1",
  port: 25566,
  "online-mode": false,
};

const opts = { linkOnConnect: true, worldCaching: true, test: true, cmdPrefix: "!" };

const server = new ServerBuilder(serverOpts, botOpts)
  .addPlugin(new SpectatorServerPlugin())
  .addPlugin(new findEntity())
  .addPlugin(new GotoPlacePlugin())
  .setSettings(opts)
  .build();

server.start();

server.on("playerConnected", (client) => {
  console.log(`Player connected: ${client}`);
});

const test = server.getPlugin("GotoPlacePlugin");
