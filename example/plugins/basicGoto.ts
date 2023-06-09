import { Client } from "@icetank/mcproxy"
import { CmdPerm, CommandMap } from "../../src/commandHandler"
import { ProxyServerPlugin } from "../../src/basePlugin"
import {goals } from 'mineflayer-pathfinder'
import { Bot } from "mineflayer"
import { ServerClient } from "minecraft-protocol"



/**
 * Gen here again.
 *
 * Example plugin to go from point A to point B.
 *
 * I will include this plugin in the main project as a POC.
 *
 * Note: this does not leverage the spectator setting present in most of the proxy.
 *  That is because that is a separate plugin. That is intentional.
 *  This is purposefully simple so it can be easy to follow.
 *
 */
export class GotoPlacePlugin extends ProxyServerPlugin {
  connectedCmds: CommandMap = {
    goto: {
      usage: 'goto <x> <y> <z>',
      description: 'go from point A to point B',
      callable: this.gotoFunc.bind(this),
      allowedIf: CmdPerm.LINKED
    },

    gotoXZ: {
      usage: 'gotoXZ <x> <z>',
      description: 'go from point A to point B, XZ',
      callable: this.gotoXZFunc.bind(this),
      allowedIf: CmdPerm.LINKED
    },

    pathstop: {
      usage: 'pathstop',
      description: 'Stop mineflayer-pathfinder',
      callable: this.stop.bind(this),
      allowedIf: CmdPerm.UNLINKED
    }
  }

  async stop (client: Client) {
    // these both exist due to how these commands are called.
    const bot = this.server.remoteBot!
    const proxy = this.server.conn!
    bot.pathfinder.setGoal(null)
    this.server.message(client, 'Stopped pathfinding!')
    this.syncClientToBot(client, bot)
    proxy.link(client)
  }

  async gotoFunc (client: Client, x: string, y: string, z: string) {
    // these both exist due to how these commands are called.
    const bot = this.server.remoteBot!

    if (client !== this.server.controllingPlayer) {
      this.server.message(client, 'You cannot cause the bot to go anywhere, you are not controlling it!')
      return
    }

    const numX = (x === '~') ? bot.entity.position.x : Number(x)
    const numY = (y === '~') ? bot.entity.position.y : Number(y)
    const numZ = (z === '~') ? bot.entity.position.z : Number(z)

    const goal = new goals.GoalBlock(numX, numY, numZ)

    this.server.message(client, `Moving to: ${numX} ${numY} ${numZ}`)

    await this.travelTo(client, goal)
  }

  async gotoXZFunc (client: Client, x: string, z: string, range?: string) {
    // these both exist due to how these commands are called.
    const bot = this.server.remoteBot!

    if (client !== this.server.controllingPlayer) {
      this.server.message(client, 'You cannot cause the bot to go anywhere, you are not controlling it!')
      return
    }

    const numX = (x === '~') ? bot.entity.position.x : Number(x)
    const numZ = (z === '~') ? bot.entity.position.z : Number(z)
    const numRange = range ? Number(range) : 3

    this.server.message(client, `Moving to: (${numX}, ${numZ}) w/ range ${numRange}`)

    // unlink client so bot can move
    const goal = new goals.GoalNearXZ(numX, numZ, numRange)
    await this.travelTo(client, goal)
  }

  private async travelTo (client: Client, goal: goals.Goal): Promise<void> {
    // these both exist due to how these commands are called.
    const bot = this.server.remoteBot!
    const proxy = this.server.conn!

    proxy.unlink()

    if (bot.pathfinder.isMoving()) {
      bot.pathfinder.setGoal(null)
    }

    try {
      await bot.pathfinder.goto(goal)
      this.server.message(client, 'Made it!')
      this.serverLog('Pathfinder:goto_success')
    } catch (e) {
      this.server.message(client, 'Did not make it...')
      this.serverLog('Pathfinder:goto_failure', e)
    }

    // basic clean up, then we're all good :thumbsup:
    finally {
      this.syncClientToBot(client, bot)
      proxy.link(client)
    }
  }

  // sync client back to bot's position
  syncClientToBot (client: Client | ServerClient, bot: Bot) {
    client.write('position', {
      ...bot.entity.position,
      yaw: bot.entity.yaw,
      pitch: bot.entity.pitch,
      onGround: bot.entity.onGround
    })
  }
}
