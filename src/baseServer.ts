import { Client as ProxyClient, Conn, ConnOptions } from "@icetank/mcproxy";
import { Client, createServer, Server, ServerClient, ServerOptions } from "minecraft-protocol";
import { Bot, BotEvents, BotOptions } from "mineflayer";
import { ChatMessage as AgnogChMsg } from "prismarine-chat";
import { ProxyServerPlugin } from "./basePlugin";
import { CommandHandler } from "./commandHandler";
import { LogConfig, Logger } from "./logger";
import { Arguments, ListType, TypedEventEmitter, U2I } from "./types";
import { sleep } from "./utils";

/**
 * Interface for the ProxyServer options.
 */
export interface IProxyServerOpts {
  proxyChatPrefix?: string;

  /**
   * Disconnect all connected players once the proxy bot stops.
   * Defaults to true.
   * If not on players will still be connected but won't receive updates from the server.
   *
   */
  disconnectAllOnEnd?: boolean;
  disableCommands?: boolean;
}

/**
 * W.I.P., extending so far as necessary.
 */
export interface OtherProxyOpts {
  debug?: boolean;
  cOpts?: Partial<ConnOptions>;
  loggerOpts?: Partial<LogConfig>;
}

type PrefixedBotEvents<Prefix extends string = "botevent_"> = {
  [K in keyof BotEvents as K extends string ? `${Prefix}${K}` : never]: (
    bot: Bot,
    ...args: Arguments<BotEvents[K]>
  ) => void;
};

//
export type IProxyServerEvents = PrefixedBotEvents & {
  remoteDisconnect: (type: "kicked" | "end" | "error", info: string | Error) => void;
  closingConnections: (reason: string) => void;
  playerConnected: (client: ServerClient, remoteConnected: boolean) => void;
  playerDisconnected: (client: ServerClient) => void;
  optionValidation: (bot: Bot) => void;
  initialBotSetup: (bot: Bot) => void;
  proxySetup: (conn: Conn) => void;
  linking: (client: Client) => void;
  unlinking: (client: Client) => void;
  botAutonomous: (bot: Bot) => void;
  botControlled: (bot: Bot) => void;
  starting: (conn: Conn) => void;
  started: (conn: Conn) => void;
  stopping: () => void;
  stopped: () => void;
  restart: () => void;
};

// Unused.
export type Test<Events> = {
  [nme in keyof Events as nme extends string ? `on${Capitalize<nme>}` : never]?: Events[nme] extends (
    ...args: infer Args
  ) => infer Ret
    ? (...args: Args) => Ret
    : never;
};

type OptExtr<Fuck> = Fuck extends ProxyServerPlugin<infer Opts, any> ? Opts : never;
type LiExtr<Fuck> = Fuck extends ProxyServerPlugin<any, infer Events, any> ? Events : never;
type EmExtr<Fuck> = Fuck extends ProxyServerPlugin<any, any, infer Events> ? Events : never;

/**
 * Strongly typed server builder. Makes sure settings matches all plugins.
 */
export class ServerBuilder<Opts extends IProxyServerOpts, Emits extends IProxyServerEvents, AppliedSettings = false> {
  private _plugins: Array<ProxyServerPlugin<any, any, any>>;

  private _settings?: Opts;
  private _otherSettings: OtherProxyOpts = {};
  private readonly _appliedSettings: AppliedSettings = false as any;
  constructor(public readonly lsOpts: ServerOptions, public readonly bOpts: BotOptions, other: OtherProxyOpts = {}) {
    this._plugins = [];
    this._otherSettings = other;
    this._settings = {} as any;
  }

  public get appliedSettings(): AppliedSettings {
    return this._appliedSettings;
  }

  public get settings() {
    return this._settings;
  }

  public get plugins() {
    return this._plugins;
  }

  public addPlugin<O, L, E, NeedsSettings = {} extends Opts & O ? true : false>(
    this: ServerBuilder<Opts, Emits, AppliedSettings>,
    plugin: Emits extends L ? ProxyServerPlugin<O, L, E> : never
  ): ServerBuilder<Opts & O, Emits & E, NeedsSettings> {
    this.plugins.push(plugin);
    return this as any;
  }

  public addPlugins<
    Plugins extends Array<ProxyServerPlugin<any, any>>,
    O = U2I<OptExtr<ListType<Plugins>>>,
    E = U2I<EmExtr<ListType<Plugins>>>,
    NeedsSettings = {} extends Opts & O ? true : false
  >(
    this: ServerBuilder<Opts, Emits, AppliedSettings>,
    ...plugins: Plugins
  ): ServerBuilder<Opts & O, Emits & E, NeedsSettings> {
    this._plugins = this.plugins.concat(...plugins);
    return this as any;
  }

  public addPluginStatic<O, L, E, NeedsSettings = {} extends Opts & O ? true : false>(
    this: ServerBuilder<Opts, Emits, AppliedSettings>,
    plugin: new () => ProxyServerPlugin<O,L,E>
  ): ServerBuilder<Opts & O, Emits & E, NeedsSettings> {
    const build = new plugin();
    this.plugins.push(build);
    return this as any;
  }

  public setSettings(settings: Opts): ServerBuilder<Opts, Emits, true> {
    this._settings = settings;
    (this as any)._appliedSettings = true;
    return this as any;
  }

  public setOtherSettings(other: OtherProxyOpts): this {
    this._otherSettings = other;
    return this;
  }

  public build<This extends ServerBuilder<Opts, Emits, true>>(this: This): ProxyServer<Opts, Emits> {
    let srv = new ProxyServer<Opts, Emits>(this.lsOpts, this.settings!, this.bOpts, this._otherSettings);
    for (const plugin of this.plugins) {
      srv = srv.loadPlugin(plugin);
    }
    return srv;
  }
}

export class ProxyServer<
  O = {},
  E = {},
  Opts extends IProxyServerOpts = IProxyServerOpts & O,
  Events extends IProxyServerEvents = IProxyServerEvents & E
> extends TypedEventEmitter<Events> {
  protected readonly plugins: Map<string, ProxyServerPlugin<IProxyServerOpts, IProxyServerEvents>> = new Map();
  protected readonly pluginStorage: Map<string, any> = new Map();
  protected readonly cmdHandler: CommandHandler<ProxyServer<Opts, Events>>;
  protected readonly _rawServer: Server;

  protected _conn: Conn | null;
  public bOpts: BotOptions;
  public lsOpts: ServerOptions;
  public psOpts: Opts;
  public otherOpts: OtherProxyOpts;

  protected manuallyStopped = false;

  public logger: Logger;

  // public manuallyStopped: boolean = false;
  public ChatMessage!: typeof AgnogChMsg;

  public get rawServer(): Server {
    return this._rawServer;
  }

  public get proxy(): Conn | null {
    return this._conn;
  }

  public get conn(): Conn | null {
    return this._conn;
  }

  public get remoteBot(): Bot | null {
    return this._conn?.stateData.bot ?? null;
  }

  public get remoteClient(): Client | null {
    return this._conn?.stateData.bot._client ?? null;
  }

  protected _remoteIsConnected: boolean = false;

  public get controllingPlayer(): ProxyClient | null {
    return this._conn?.pclient ?? null;
  }

  public isPlayerControlling(): boolean {
    return this._conn?.pclient != null;
  }

  public isProxyConnected() {
    return this._remoteIsConnected;
  }

  constructor(lsOpts: ServerOptions, psOpts: Opts, bOpts: BotOptions, other: OtherProxyOpts = {}) {
    super();
    this.bOpts = bOpts;
    this.otherOpts = other;
    this.lsOpts = lsOpts;
    this.psOpts = psOpts;
    this._conn = null;
    this.logger = new Logger(other?.loggerOpts);
    this._rawServer = createServer(lsOpts);
    this.ChatMessage = require("prismarine-chat")(lsOpts.version);
    this.cmdHandler = new CommandHandler(this);
    this.cmdHandler.loadProxyCommand("pstop", {
      description: "stops the server",
      usage: "pstop",
      callable: this.stop.bind(this),
    });
    this.cmdHandler.loadDisconnectedCommand("pstart", {
      description: "starts the server",
      usage: "pstart",
      callable: this.start.bind(this),
    });
    this._rawServer.on("login", this.loginHandler);

    // debugging magick.

    const oldEmit = this.emit.bind(this);

    this.emit = (event: any, ...args: any[]) => {
      oldEmit(event, ...args);
      if (this.otherOpts.debug) {
        const fixedArgs = args.map((arg) =>
          ["string", "number", "boolean", "undefined"].includes(typeof arg) ? arg : arg?.constructor.name ?? "null"
        );

        if (typeof event === "string" && event.startsWith("botevent_")) {
          args.splice(0, 1);
          this.logger.log(event.replace("botevent_", ""), "remoteBotEvents", args);
          return;
        }

        this.logger.log(`emit:${String(event)}`, "localServerInfo", fixedArgs);
      }
    };
  }

  // TODO: Broken typings.
  // Use the publicly exposed builder instead.
  public loadPlugin<O, L>(
    inserting: Opts extends O ? (Events extends L ? ProxyServerPlugin<O, L> : never) : never
  ): ProxyServer<Opts, Events> {
    inserting.onLoad(this as any);
    this.plugins.set(inserting.constructor.name, inserting as any);
    if (inserting.universalCmds != null) {
      this.cmdHandler.loadProxyCommands(inserting.universalCmds);
      this.cmdHandler.loadDisconnectedCommands(inserting.universalCmds);
    }
    if (inserting.connectedCmds != null) this.cmdHandler.loadProxyCommands(inserting.connectedCmds);
    if (inserting.disconnectedCmds != null) this.cmdHandler.loadDisconnectedCommands(inserting.disconnectedCmds);

    return this as any;
  }

  public unloadPlugin(removing: typeof ProxyServerPlugin<any, any, any>): void {
    this.plugins.get(removing.name)?.onUnload(this as any);
    this.plugins.delete(removing.name);
  }

  public hasPlugin(checking: typeof ProxyServerPlugin<any, any, any>): boolean {
    return Boolean(this.plugins.get(checking.name));
  }


  public getPlugin(getting: string): InstanceType<typeof ProxyServerPlugin<any, any, any>> | undefined;
  public getPlugin<Val extends typeof ProxyServerPlugin<any, any, any>>(getting: Val): InstanceType<Val> | undefined;
  public getPlugin<Val extends typeof ProxyServerPlugin<any, any, any>>(
    getting: Val | string,
  ): typeof getting extends Val ? InstanceType<Val> : InstanceType<typeof ProxyServerPlugin<any, any, any>> | undefined {
    if (typeof getting === 'string') return this.plugins.get(getting) as any
    return this.plugins.get(getting.name) as any;
  }

  public enablePlugin(plugin: typeof ProxyServerPlugin<any, any, any>): boolean {
    const gotten = this.plugins.get(plugin.name);
    if (gotten == null) return false;
    gotten.enable();
    return true;
  }

  public disablePlugin(plugin: typeof ProxyServerPlugin<any, any, any>): boolean {
    const gotten = this.plugins.get(plugin.name);
    if (gotten == null) return false;
    gotten.disable();
    return true;
  }

  /**
   * To be used by plugins.
   * @param key
   * @param data
   * @returns
   */
  public storeSharedData(key: string, data: any) {
    return this.pluginStorage.set(key, data);
  }

  /**
   * Drop value indexed by key.
   * @param key
   * @returns
   */
  public dropSharedData(key: string) {
    return this.pluginStorage.delete(key);
  }

  public getSharedData<Value extends any>(key: string): Value | undefined {
    return this.pluginStorage.get(key);
  }

  public runCmd(client: Client, cmd: string, ...args: string[]) {
    this.cmdHandler.manualRun(cmd, client, ...args);
  }

  public start(): Conn {
    if (this.isProxyConnected()) return this._conn!;
    this.manuallyStopped = false;
    this._conn = new Conn(this.bOpts, this.otherOpts.cOpts);
    this.reconnectAllClients(this._conn);
    this.emit("starting" as any, this._conn as any);
    this.setup();
    this.emit("started" as any);
    return this._conn;
  }

  public stop(): void {
    if (!this.isProxyConnected()) return;
    this.emit("stopping" as any);
    this.manuallyStopped = true;
    this.disconnectRemote("Proxy manually stopped.");
    this.emit("stopped" as any);
  }

  public async restart(ms = 0) {
    this.stop();
    await sleep(ms);
    this.start();
  }

  private setup(): void {
    if (this.remoteBot == null || this.remoteClient == null || this.conn == null) {
      throw Error("Setup called when remote bot does not exist!");
    }

    this.emit("proxySetup" as any, this._conn!, this.psOpts);

    this.remoteClient.on("packet", (data, meta, buffer) => this.logger.log(meta.name, "remoteBotReceive", data));

    this.emit("optionValidation" as any, this.remoteBot, this.psOpts);
    this.emit("initialBotSetup" as any, this.remoteBot, this.psOpts);

    this.remoteBot.once("spawn", this.beginBotLogic);
    this.remoteBot.on("kicked", this.remoteClientDisconnect.bind(this, "KICKED"));
    this.remoteBot.on("end", this.remoteClientDisconnect.bind(this, "END"));
    this.remoteBot.on("error", this.remoteClientDisconnect.bind(this, "ERROR"));

    this.remoteClient.on("login", () => {
      this._remoteIsConnected = true;
    });

    const oldEmit = this.remoteBot.emit.bind(this.remoteBot);

    // We overwrite emits from bots and clients to log their data.
    this.remoteBot.emit = <E extends keyof BotEvents>(event: E, ...args: Arguments<BotEvents[E]>) => {
      this.emit(`botevent_${event}` as any, this.remoteBot!, ...args);
      return oldEmit(event, ...args);
    };

    const oldClientWrite = this.remoteClient.write.bind(this.remoteClient);
    this.remoteClient.write = (name, params) => {
      this.logger.log(name, "remoteBotSend", params);
      return oldClientWrite(name, params);
    };

    const oldClientWriteChannel = this.remoteClient.writeChannel.bind(this.remoteClient);
    this.remoteClient.writeChannel = (channel, params) => {
      this.logger.log(`channel${channel}`, "remoteBotSend", params);
      return oldClientWriteChannel(channel, params);
    };

    const oldClientWriteRaw = this.remoteClient.writeRaw.bind(this.remoteClient);
    this.remoteClient.writeRaw = (buffer) => {
      this.logger.log("rawBuffer", "remoteBotSend", buffer);
      return oldClientWriteRaw(buffer);
    };

    this.conn.write = this.remoteClient.write;
    this.conn.writeChannel = this.remoteClient.writeChannel;
    this.conn.writeRaw = this.remoteClient.writeRaw;
  }

  public beginBotLogic = (): void => {
    if (this.remoteBot == null) throw Error("Bot logic called when bot does not exist!");
    this.emit("botAutonomous" as any, this.remoteBot, this.psOpts);
  };

  public endBotLogic = (): void => {
    if (this.remoteBot == null) throw Error("Bot logic called when bot does not exist!");
    this.emit("botControlled" as any, this.remoteBot, this.psOpts);
  };

  private readonly loginHandler = (actualUser: ServerClient) => {
    this.emit("playerConnected" as any, actualUser, this.isProxyConnected());
    actualUser.once("end", () => this.emit("playerDisconnected" as any, actualUser));

    this.cmdHandler.updateClientCmds(actualUser as unknown as ProxyClient);
    if (this.isProxyConnected()) this.whileConnectedLoginHandler(actualUser);
    else this.notConnectedLoginHandler(actualUser);
  };

  protected async remoteClientDisconnect(reason: string, info: string | Error) {
    if (this.remoteBot == null) return; // assume we've already exited ( we want to leave early on kicks )

    this.endBotLogic();

    this.emit("remoteDisconnect" as any, reason, info);

    this._remoteIsConnected = false;
    this._conn = null;
  }

  public closeConnections(closeReason: string, closeRemote = false, additional?: string) {
    const reason = additional ? closeReason + "\n\nReason: " + additional : closeReason;

    this.emit("closingConnections" as any, reason);

    Object.keys(this._rawServer.clients).forEach((clientId) => {
      this._rawServer.clients[Number(clientId)].end(reason);
    });

    if (closeRemote) {
      this.disconnectRemote(closeReason);
    }
  }

  protected disconnectRemote(reason: string) {
    if (this._conn != null) {
      this._conn.stateData.bot._client.end("[2B2W]: " + reason);
      this._conn.pclients.forEach(this._conn.detach.bind(this._conn));
    }
  }

  private readonly reconnectAllClients = (conn: Conn) => {
    Object.values(this._rawServer.clients).forEach((c) => {
      this.broadcastMessage("[INFO] Bot has started!");
      this.broadcastMessage("Reconnect to see the new bot.");
      this.cmdHandler.decoupleClientCmds(c as unknown as ProxyClient);
      this.cmdHandler.updateClientCmds(c as unknown as ProxyClient);
    });
  };

  /**
   * Default login handler. This can/will be overriden by plugins.
   * @param actualUser
   * @returns
   */
  private readonly whileConnectedLoginHandler = async (actualUser: ServerClient) => {
    for (const plugin of this.plugins.values()) {
      const res = await plugin.whileConnectedLoginHandler?.(actualUser);
      if (res != null) return;
    }

    // set event for when they end.
    actualUser.on("end", (reason) => {
      if (this.remoteBot != null) this.beginBotLogic();
    });

    this.endBotLogic();
    this._conn!.sendPackets(actualUser as any); // works in original?
    this._conn!.link(actualUser as any); // again works
  };

  protected notConnectedLoginHandler = async (actualUser: ServerClient) => {
    for (const plugin of this.plugins.values()) {
      const res = await plugin.notConnectedLoginHandler?.(actualUser);
      if (res != null) return;
    }

    actualUser.write("login", {
      entityId: actualUser.id,
      levelType: "default",
      gameMode: 0,
      dimension: 0,
      difficulty: 2,
      maxPlayers: 1,
      reducedDebugInfo: false,
    });
    actualUser.write("position", {
      x: 0,
      y: 1.62,
      z: 0,
      yaw: 0,
      pitch: 0,
      flags: 0x00,
    });
  };

  // ======================= //
  //     message utils       //
  // ======================= //

  message(
    client: Client,
    message: string,
    prefix: boolean = true,
    allowFormatting: boolean = true,
    position: number = 1
  ) {
    if (!allowFormatting) message = message.replaceAll(/§./, "");
    if (prefix && this.psOpts.proxyChatPrefix) message = this.psOpts.proxyChatPrefix + message;
    this.sendMessage(client, message, position);
  }

  sendMessage(client: ServerClient | Client, message: string, position: number = 1) {
    const messageObj = new this.ChatMessage(message);
    client.write("chat", { message: messageObj.json.toString(), position });
  }

  broadcastMessage(message: string, prefix: boolean = true, allowFormatting?: boolean, position?: number) {
    Object.values(this._rawServer.clients).forEach((c) => {
      this.message(c, message, prefix, allowFormatting, position);
    });
  }

  // ======================= //
  //     client utils        //
  // ======================= //

  public inControl(client: Client): boolean {
    return this.controllingPlayer === client
  }


  /**
   * Unlinks client from remote connection, releasing control.
   * @param client 
   * @returns 
   */
  public unlink(client: Client): boolean {
    if (this.conn == null) throw new Error('Unlinking when remote connection is not present!')
    if (client !== this.controllingPlayer) return false;
    this.emit("unlinking" as any, client);
    this.conn.unlink();
    this.beginBotLogic();
    return true;
  }

  /**
   * Establishes connection to the remote connection, transferring control.
   */
  public link(client: Client): boolean {
    if (this.conn == null) throw new Error('Unlinking when remote connection is not present!')
    if (client === this.controllingPlayer) return false;
    this.emit("linking" as any, client);
    this.endBotLogic();
    this.conn.link(client as unknown as ProxyClient);
    return true;
  }
}
