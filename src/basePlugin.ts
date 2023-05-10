// TODO: Separate plugins into "emitters" and "listeners"
// "emitters" provide custom events, "listeners" do not (can listen to custom though)

import { Conn } from "@icetank/mcproxy";
import { Client, ServerClient } from "minecraft-protocol";
import { Bot } from "mineflayer";
import merge from "ts-deepmerge";
import { Arguments } from "typed-emitter";
import { IProxyServerEvents, IProxyServerOpts, ProxyServer } from "./baseServer";
import { CommandMap } from "./commandHandler";

// TODO: Separate plugins into "emitters" and "listeners"
// "emitters" provide custom events, "listeners" do not (can listen to custom though)
// for use in server builder to lock typings further.
export abstract class ProxyServerPlugin<
  O = {},
  L = {},
  E = {},
  Opts extends IProxyServerOpts = IProxyServerOpts & O,
  ListensTo extends IProxyServerEvents = IProxyServerEvents & L,
  Events extends IProxyServerEvents = IProxyServerEvents & E

  // ListensTo extends IProxyServerEvents = IProxyServerEvents,
> {
  private _enabled = true;

  public declare _server: ProxyServer<Opts, Events>;
  public declare universalCmds?: CommandMap;
  public declare connectedCmds?: CommandMap;
  public declare disconnectedCmds?: CommandMap;

  public get server(): ProxyServer<Opts, Events> {
    if (this._server == null) throw Error("Server was wanted before proper initialization!");
    return this._server;
  }

  public get psOpts(): Opts {
    if (this._server == null) throw Error("Proxy options were wanted before proper initialization!");
    return this._server.psOpts;
  }

  public enable() {
    this._enabled = true;
  }

  public disable() {
    this._enabled = false;
  }

  // potential listener methods
  onPreStart?(conn: Conn): void;
  onPostStart?(): void;
  onPreStop?(): void;
  onPostStop?(): void;
  onBotAutonomous?(bot: Bot): void;
  onBotControlled?(bot: Bot): void;
  onProxySetup?(conn: Conn): void;
  onOptionValidation?(bot: Bot): void;
  onInitialBotSetup?(bot: Bot): void;
  onLinking?(client: Client): void;
  onUnlinking?(client: Client): void;
  onClosingConnections?(reason: string): void;
  onPlayerConnected?(client: ServerClient, remoteConnected: boolean): void;
  whileConnectedLoginHandler?(player: ServerClient): Promise<boolean> | boolean;
  notConnectedLoginHandler?(player: ServerClient): Promise<boolean> | boolean;
  onRemoteKick?(reason: string): void;
  onRemoteDisconnect?(type: "kicked" | "end" | "error", info: string | Error): void;

  private readonly listenerMap: Map<keyof ListensTo, Array<{ original: Function; ref: Function }>> = new Map();

  /**
   * Creates wrapper around whatever function is provided so that it fires only when the plugin is enabled
   * @param event Event to listen to (based on Events typing from class)
   * @param listener Listener to apply to event
   * @returns void
   */
  public serverOn<Key extends keyof ListensTo>(
    event: Key,
    listener: ListensTo[Key] extends Function ? ListensTo[Key] : never
  ) {
    const listeners = this.listenerMap.get(event) ?? [];
    const test = listener;
    const wrapper = (...args: any[]) => {
      if (this._enabled) {
        listener.bind(this)(...args);
      }
    };

    const built = {
      original: test,
      ref: wrapper,
    };

    if (listeners.findIndex((check) => check.original === test) > -1) {
      throw Error(`Registering event ${String(event)} twice on ${this.constructor.name}`);
    }

    listeners.push(built);
    this.listenerMap.set(event, listeners);
    this._server.on(event as any, wrapper as any);
  }

  /**
   * Utility method to remove the wrapped function based on the original input.
   * @param event Event to listen to (based on Events typing from class)
   * @param listener Listener to apply to event
   * @returns void
   */
  public serverOff<Key extends keyof ListensTo>(
    event: Key,
    listener: ListensTo[Key] extends Function ? ListensTo[Key] : never
  ) {
    const listeners = this.listenerMap.get(event);
    if (listeners == null) return;

    const idx = listeners.findIndex((check) => check.original === listener);
    const found = listeners[idx];
    this.listenerMap.set(event, listeners.splice(idx, 1));
    this._server.off(event as any, found.ref as any);
  }

  /**
   * Function that is called whenever the server is ready to load plugins
   * @param server
   */
  public onLoad(server: ProxyServer<Opts, Events>) {
    this._server = server;

    // TODO: Generalize this.

    if (this.onPreStop != null) this.serverOn("stopping", this.onPreStop as any);
    if (this.onPostStop != null) this.serverOn("stopped", this.onPostStop as any);
    if (this.onPreStart != null) this.serverOn("starting", this.onPreStart as any);
    if (this.onPostStart != null) this.serverOn("started", this.onPostStart as any);
    if (this.onProxySetup != null) this.serverOn("proxySetup", this.onProxySetup as any);
    if (this.onBotAutonomous != null) this.serverOn("botAutonomous", this.onBotAutonomous as any);
    if (this.onBotControlled != null) this.serverOn("botControlled", this.onBotControlled as any);
    if (this.onLinking != null) this.serverOn("linking", this.onLinking as any);
    if (this.onUnlinking != null) this.serverOn("unlinking", this.onUnlinking as any);
    if (this.onClosingConnections != null) this.serverOn("closingConnections", this.onClosingConnections as any);
    if (this.onPlayerConnected != null) this.serverOn("playerConnected", this.onPlayerConnected as any);
    if (this.onOptionValidation != null) this.serverOn("optionValidation", this.onOptionValidation as any);
    if (this.onInitialBotSetup != null) this.serverOn("initialBotSetup", this.onInitialBotSetup as any);
    if (this.onRemoteDisconnect != null) this.serverOn("remoteDisconnect", this.onRemoteDisconnect as any);
  }

  /**
   * This is never called by the server.
   *
   * However, code-wise it is possible to unload plugins.
   * @param server
   */
  public onUnload(server: ProxyServer<Opts, Events>) {
    this._server = server;
    for (const [event, listenerList] of this.listenerMap.entries()) {
      listenerList.forEach((e) => this.serverOff(event as any, e as any));
    }
  }

  /**
   * Emit proxy to go straight to the server.
   * @param event
   * @param args
   */
  public serverEmit<E extends keyof Events>(event: E, ...args: Arguments<Events[E]>) {
    this.server.emit(event as any, ...args);
  }

  /**
   * Log data from plugins to the server's logger.
   * @param name
   * @param data
   */
  public serverLog = (name: string, ...data: any[]) => {
    this.server.logger.log(name, "localServerPlugins", data);
  };

  /**
   * Set the server's opts via merging partial options.
   *
   * NOTE: Technically not type-safe. (could provide "undefined" to otherwise required input)
   * @param opts
   */
  public setServerOpts(opts: Partial<Opts>) {
    this.server.psOpts = merge(opts, this.psOpts as any) as any;
  }

  /**
   * Share data into {@link ProxyServer.pluginStorage a shared plugin storage}.
   * @param key {string} Value to index by to retrieve stored value.
   * @param data {any} Value to store
   * @returns
   */
  public share(key: string, data: any) {
    return this.server.storeSharedData(key, data);
  }

  /**
   * Drops data from {@link ProxyServer.pluginStorage a shared plugin storage}.
   * @param key {string} Value to index by to delete stored value.
   * @returns
   */
  public drop(key: string) {
    return this.server.dropSharedData(key);
  }

  /**
   * Get data shared from {@link share}
   * @param key {string} Value to index by to retrieve stored value.
   * @returns
   */
  public getShared<Value extends any>(key: string): Value | undefined {
    return this.server.getSharedData(key);
  }

  /**
   * Utility method to unlink client from the server.
   * @param client 
   */
  public unlink(client: Client): void {
    this.server.unlink(client);
  }

    /**
   * Utility method to link client to the server.
   * @param client 
   */
    public link(client: Client): void {
      this.server.link(client);
    }
}
