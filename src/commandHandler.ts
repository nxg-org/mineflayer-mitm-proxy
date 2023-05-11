import { TypedEventEmitter } from "./types";
import { ProxyServer } from "./baseServer";
import { PacketMeta, ServerClient, Client } from "minecraft-protocol";
import { Client as ProxyClient, PacketMiddleware } from "@icetank/mcproxy";
import { sleep } from "./utils";
import type { Vec3 } from "vec3";

export enum CmdPerm {
  LINKED    = 1 << 0,
  UNLINKED  = 1 << 1,
}

interface CommandHandlerEvents {
  command: (cmd: string, func?: Function) => void;
}

type CommandFunc = (client: ProxyClient, ...args: string[]) => void;
type CommandInfo =
  | {
      usage?: string;
      description?: string;
      allowedIf?: ((client: Client) => boolean) | CmdPerm;
      callable: CommandFunc;
    }
  | CommandFunc;

export interface CommandMap {
  [key: string]: CommandInfo | CommandMap;
}

interface CommandMapFlattened {
  [key: string]: CommandInfo;
}

function isMapGroup(cmdInfo: CommandMap | CommandInfo): cmdInfo is CommandMap {
  return Boolean(typeof cmdInfo !== "function" && !(cmdInfo as any).callable);
}

export class CommandHandler<Server extends ProxyServer> extends TypedEventEmitter<CommandHandlerEvents> {
  private _prefix: string = "/";

  private readonly mostRecentTab: Map<string, string> = new Map();

  public get prefix() {
    return this._prefix;
  }

  public set prefix(prefix: string) {
    this._prefix = prefix;
  }

  constructor(
    private readonly srv: Server,
    prefix: string = "/",
    public readonly proxyCmds: CommandMap = {},
    public readonly disconnectedCmds: CommandMap = {}
  ) {
    super();
    this.prefix = prefix;
    this.loadProxyCommands({
      phelp: {
        description: "This proxy help message",
        callable: this.printHelp,
      },
      pusage: {
        usage: "<cmd>",
        description: "Gets the usage of a specific command",
        callable: this.printUsage,
      },
    });
    this.loadDisconnectedCommands({
      phelp: {
        description: "This proxy help message",
        callable: this.printHelp,
      },
    });
  }

  public getAllCmds() {
    return {
      connected: this.proxyCmds,
      disconnected: this.disconnectedCmds,
    };
  }

  public getActiveCmds(client: Client, override = false): CommandMapFlattened {
    const cmds = this.srv.isProxyConnected() ? this.proxyCmds : this.disconnectedCmds;
    const obj = {};
    return this.getActiveCmdsRecur(client, cmds, override, obj);
  }

  public getActiveCmdsRecur(
    client: Client,
    cmds: CommandMap,
    override = false,
    stor: CommandMapFlattened = {},
    prefix = ""
  ): CommandMapFlattened {
    for (const [key, cmd] of Object.entries(cmds)) {
      if (isMapGroup(cmd)) {
        const pref = prefix == "" ? key : prefix + " " + key;
        this.getActiveCmdsRecur(client, cmd, override, stor, pref);
      } else {
        if (typeof cmd !== "function") {
          if (cmd.allowedIf != null && !override) {
            if (typeof cmd.allowedIf === "function" && !cmd.allowedIf(client)) continue;
            else
              switch (cmd.allowedIf) {
                case CmdPerm.LINKED:
                  if (client !== this.srv.controllingPlayer) continue;
                  break;
                case CmdPerm.UNLINKED:
                  if (client === this.srv.controllingPlayer) continue;
                  break;
              }
          }
        }
        const insert = prefix == "" ? key : prefix + " " + key;
        stor[insert] = cmd;
      }
    }
    return stor;
  }

  findCmd(cmds: CommandMapFlattened, cmd: string, splitter = " "): [CommandInfo | null, string[]] {
    const args = cmd.split(splitter);
    const keys = Object.keys(cmds);
    let i = 0;
    for (; i < args.length; i++) {
      const combined = args.slice(0, i + 1).join(splitter);
      if (!keys.some((k) => k.startsWith(combined))) break;
    }
    if (i == 0) return [null, []];
    return [cmds[args.slice(0, i).join(splitter)], args.slice(i)];
  }

  findCmdsContaining(cmds: CommandMapFlattened, cmd: string): [string, CommandInfo][] {
    const keys = Object.entries(cmds);
    return keys.filter(([k, v]) => k.includes(cmd));
  }

  loadProxyCommands(obj: CommandMap) {
    for (const entry of Object.entries(obj)) {
      this.proxyCmds[entry[0]] = entry[1];
    }
  }

  loadProxyCommand(key: string, info: CommandInfo) {
    this.proxyCmds[key] = info;
  }

  loadDisconnectedCommands(obj: CommandMap) {
    for (const entry of Object.entries(obj)) {
      this.disconnectedCmds[entry[0]] = entry[1];
    }
  }

  loadDisconnectedCommand(key: string, info: CommandInfo) {
    this.disconnectedCmds[key] = info;
  }

  commandHandler = async (client: Client, ...cmds: string[]) => {
    const allowedCmds = this.getActiveCmds(client);
    if (cmds.length === 1) {
      if (!cmds[0].startsWith(this.prefix)) return client === this.srv.controllingPlayer;
      const [cmdFunc, args] = this.findCmd(allowedCmds, cmds[0].replace(this.prefix, ""));
      if (cmdFunc) this.executeCmd(cmdFunc, client, ...args);
      return !cmdFunc;
    } else {
      for (const cmdLine of cmds) {
        if (!cmdLine.startsWith(this.prefix)) return client === this.srv.controllingPlayer;
        const [cmdFunc, args] = this.findCmd(allowedCmds, cmdLine.replace(this.prefix, ""));
        if (!cmdFunc) return client === this.srv.controllingPlayer;
        this.executeCmd(cmdFunc, client, ...args);
        await sleep(300);
      }
    }
  };

  private executeCmd(cmd: CommandInfo, client: Client, ...args: any[]) {
    if (cmd instanceof Function) {
      cmd(client as ProxyClient, ...args);
    } else {
      cmd.callable(client as ProxyClient, ...args);
    }
  }

  proxyCommandHandler: PacketMiddleware = async ({ meta, data, pclient }) => {
    if (this.srv.proxy == null || pclient == null) return;
    if (meta.name !== "chat") return;
    const cmds: string[] = data.message.split("|");
    return await this.commandHandler(pclient, ...cmds);
  };

  unlinkedChatHandler = async (client: Client, data: any, meta: PacketMeta) => {
    if (this.srv.isProxyConnected()) return;
    const { message }: { message: string } = data;
    return await this.commandHandler(client, ...message.split("|"));
  };

  manualRun(cmd: string, client: Client, ...args: any[]) {
    if (!cmd.startsWith(this.prefix)) cmd = this.prefix + cmd;
    const cmdRunner = this.getActiveCmds(client);
    const cmdFunc = cmdRunner[cmd];
    if (cmdFunc) this.executeCmd(cmdFunc, client, ...args);
  }

  proxyTabCompleteListener: PacketMiddleware = async ({ meta, data, pclient }) => {
    if (this.srv.proxy == null || pclient == null) return;
    if (meta.name !== "tab_complete") return;
    const inp = data.text.replace(this.prefix, "");
    this.mostRecentTab.set(pclient.uuid, inp);

    // TODO: this technically fails in 2b queue since 2b server does not respond with tab_complete.
    if (pclient !== this.srv.proxy.pclient) {
      const matches = [];
      const cmds = Object.keys(this.getActiveCmds(pclient));
      for (const cmd of cmds) {
        if (cmd.startsWith(inp)) {
          const test = inp.includes(" ");
          const pushit = test ? cmd.split(" ").slice(-1)[0] : this.prefix + cmd;
          matches.push(pushit);
        }
      }
      cmds.sort();
      pclient.write("tab_complete", { matches });
    }
  };

  proxyTabCompleteIntercepter: PacketMiddleware = async ({ meta, data, pclient }) => {
    if (this.srv.proxy == null || pclient == null) return;
    if (meta.name !== "tab_complete") return;
    const { matches: orgMatches }: { matches: string[] } = data;

    const lengths = orgMatches.map((str) => str.length);
    const maxLen = Math.max(...lengths);

    let text;
    if (lengths.length !== 0) {
      let found = maxLen;
      for (let i = 0; i < maxLen; i++) {
        const chrs = orgMatches.map((str) => str.charAt(i));
        if (chrs.some((chr) => chrs.some((internal) => chr !== internal))) {
          found = i;
          break;
        }
      }
      text = orgMatches[lengths.indexOf(maxLen)].substring(0, found);
    } else {
      text = this.mostRecentTab.get(pclient.uuid);
      if (text == null) throw Error("Somehow missed a tab_complete");
    }

    const matches = [];
    for (const cmd of Object.keys(this.getActiveCmds(pclient))) {
      if (cmd.startsWith(text)) {
        const test = text.includes(" ");
        const pushit = test ? cmd.split(" ").slice(-1)[0] : this.prefix + cmd;
        matches.push(pushit);
      }
    }

    data.matches = data.matches.concat(...matches);
    data.matches.sort();
    return data;
  };

  unlinkedTabCompleteHandler = (
    client: Client,
    data: { text: string; assumeCommand: boolean; lookedAtBlock: Vec3 },
    meta: PacketMeta
  ) => {
    if (this.srv.isProxyConnected()) return;
    const text = data.text.replace(this.prefix, "");
    const matches = [];
    for (const cmd of Object.keys(this.getActiveCmds(client))) {
      if (cmd.startsWith(text)) {
        const test = text.includes(" ");
        const pushit = test ? cmd.split(" ").slice(-1)[0] : this.prefix + cmd;
        matches.push(pushit);
      }
    }
    matches.sort();
    client.write("tab_complete", { matches });
  };

  updateClientCmds(client: ProxyClient) {
    this.srv.proxy?.attach(client as any, {
      toServerMiddleware: [
        ...(client.toServerMiddlewares ?? []),
        this.proxyCommandHandler,
        this.proxyTabCompleteListener,
      ],
      toClientMiddleware: [...(client.toClientMiddlewares ?? []), this.proxyTabCompleteIntercepter],
    });

    (client as any).disconnectedChatHandlerFunc = async (...args: [data: any, meta: PacketMeta]) =>
      await this.unlinkedChatHandler(client, ...args);
    (client as any).disconnectedTabCompleteFunc = (...args: [data: any, meta: PacketMeta]) =>
      this.unlinkedTabCompleteHandler(client, ...args);
    client.on("chat", (client as any).disconnectedChatHandlerFunc);
    client.on("tab_complete" as any, (client as any).disconnectedTabCompleteFunc);
  }

  // April 5th: it's late, this is bad code but whatever.
  decoupleClientCmds(client: ProxyClient) {
    this.srv.proxy?.detach(client);
    if ((client as any).disconnectedChatHandlerFunc) {
      client.off("chat", (client as any).disconnectedChatHandlerFunc);
    }

    if ((client as any).disconnectedTabCompleteFunc) {
      client.off("tab_complete" as any, (client as any).disconnectedTabCompleteFunc);
    }
  }

  isCmd(cmd: string): boolean {
    if (!cmd.startsWith(this.prefix)) cmd = this.prefix + cmd;
    const cmdRunner = this.getAllCmds();
    return !!cmdRunner.connected[cmd] || !!cmdRunner.disconnected[cmd];
  }

  printHelp = (client: ServerClient | Client, ...subcategories: string[]) => {
    let cmds = Object.entries(this.getActiveCmds(client));
    cmds = cmds.filter(([key, val]) => key.startsWith(subcategories.join(" ")));
    cmds.sort();

    this.srv.message(client, "§6---------- Proxy Commands: ------------- ", false);
    for (const [cmdKey, cmd] of cmds) {
      let toSend;
      if (cmd instanceof Function) {
        toSend = `§6${cmdKey}:§r Unknown.`;
      } else {
        toSend = `§6${cmdKey}:§r `;
        if (cmd.description) toSend += cmd.description;
        else toSend += "Unknown.";
      }

      this.srv.message(client, toSend, false);
    }
  };

  public printUsage = (client: ServerClient | Client, ...wantedCmds: string[]) => {
    const wantedCmd = wantedCmds.join(' ');
    const cmdRunner = this.getActiveCmds(client, true);
    const cmds = this.findCmdsContaining(cmdRunner, wantedCmd);
    if (cmds.length === 0) return this.srv.message(client, "Cannot find command!");
    this.srv.message(client, "§6---------- Proxy Command Usage: ------------- ", false);
    for (const [key, cmd] of cmds) {
      if (cmd instanceof Function) {
        this.srv.message(client, `Usage of ${key} is unknown, assume no arguments!`, false);
      } else {
        if (cmd.usage == null && cmd.description == null) {
          this.srv.message(client, `Usage of ${key} is unknown, assume no arguments!`, false);
          return;
        }

        let toSend;
        if (cmd.usage) toSend = `§6${this._prefix}${key}: ${cmd.usage} |§r `
        else toSend = `§6${key}: (No args) |§r `
        if (cmd.description) toSend += cmd.description;
        else toSend += "Unknown.";

        this.srv.message(client, toSend, false);
      }
    }
  };
}
