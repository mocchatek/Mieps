import * as Discord from "discord.js";
import {State} from "./state.js";
import {InputType} from "./inputCollector.js";
import {PluginManager} from "./pluginManager";
import { criticalPluginError } from "./errorHandling.js";

export {InputType} from "./inputCollector.js";

// Matches discord IDs only
const idRegex = /^[0-9]*$/;

export enum CommandType {
	Chat,
	Emoji
}

export interface iCommand {
	type: CommandType,
	permission: Permission,
	getHelpText: () => string,
	name: string
}

export class ChatCommand implements iCommand {
	type = CommandType.Chat;
	name: string;
	allowNoArgs = false;
	getHelpText() {return ""};
	permission = Permission.Admin;

	constructor(name: string) {
		this.name = name;
	}

	async run(message: Discord.Message, args: Array<string>): Promise<void> {};
}

export class EmojiCommand implements iCommand {
	type = CommandType.Emoji;
	name: string;
	getHelpText() {return ""};
	permission = Permission.Admin;

	// Whether to remove uses of this Emoji for Users without the right permissions
	removeInvalid = true;
	
	emoji?: Discord.Emoji;

	constructor(name: string) {
		this.name = name;
	}

	async run(reaction: Discord.MessageReaction, member: Discord.GuildMember): Promise<void> {};
}

export interface iPlugin {
	/** The name of the Plugin */
	name: string,
	/** The Plugin Manager that handles this Plugin */
	pluginManager: PluginManager,
	/** The Bots Client */
	client: Discord.Client,
	/** Called once the Bot is ready */
	init?: () => Promise<void>,
	/** A short description of what the plugin does */
	description?: string,
	/** Will be run on every message */
	messageStream?: MessageStream,
	/** All commands this plugin contains */
	commands?: Array<iCommand>,
	/** A template for settings to be set on the discord server */
	setupTemplate?: SetupTemplate,
	/** The Plugins State */
	state?: State
}

export class Plugin implements iPlugin {
	public name = "base_plugin";
	constructor(public pluginManager: PluginManager, public client: Discord.Client) {};

	state?: State;

	public async getSetting<T>(setting: string, type: InputType): Promise<T | undefined> {
		if (!this.state) {
			criticalPluginError(this.pluginManager.controlChannel, `Tried to acess setting ${setting} while no state was set`, this);
			return undefined;
		}

		let s = this.state.read("config", setting) as any;
		if (!s) {
			criticalPluginError(this.pluginManager.controlChannel, `Could not acess Setting ${setting}`, this);
			return undefined;
		}

		let guild = this.pluginManager.guild;
		let response: any;

		switch (type) {
			case InputType.Channel:
				response = guild.channels.cache.get(s);
				break;

			case InputType.Emoji:
				if (s.match(idRegex)) {
					// custom Emoji
					response = guild.emojis.cache.get(s);
				} else {
					// unicode Emoji
					response = new Discord.Emoji(this.client, {id: null, name: s})
				}
				break;

			case InputType.Role:
				response = await guild.roles.fetch(s);
				break;

			case InputType.User:
				response = await guild.members.fetch(s);
				break;

			case InputType.Message:
				try {
					response = await (await guild.channels.cache.get(s[0]) as Discord.TextChannel | undefined)?.messages?.fetch(s[1]);
				} catch {}
				break;
			
			case InputType.ChannelList:
				response = [];
			
				if (Array.isArray(s)) {
					for (let id of s as string[]) {
						let channel = guild.channels.cache.get(id);
						if (channel) {
							response.push(channel);
						}
					}
				}
				break;

			case InputType.RoleList:
				response = [];
			
				if (Array.isArray(s)) {
					for (let id of s as string[]) {
						let role = guild.roles.cache.get(id);
						if (role) {
							response.push(role);
						}
					}
				}
				break;

			default:
				response = s;
				break;
		}

		if (!response) {
			criticalPluginError(this.pluginManager.controlChannel, `Could not find any ${InputType[type]} with the id ${s} on the server. Maybee it no longer exists? Reconfigure the plugin to fix this Error`, this);
			return undefined;
		}

		return response as T;
	}
}

/** A List of settings, to be set by the admin */
export type SetupTemplate = Array<Setting>

export interface MessageStream {
	/** What Channels to run on */
	channels?: Array<Discord.TextChannel>,
	name: string,
	/** Return boolean indicates if message should be passed on to the command processing stage */
	run: (message: Discord.Message) => boolean;
}

export interface Setting {
	name: string,
	type: InputType,
	description?: string
}

export enum Permission {
	Any = 0,
	User = 2,
	Mod = 5,
	Admin = 10
}
