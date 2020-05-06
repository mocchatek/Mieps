import * as fs from 'fs';

import {Plugin, ChatCommand, EmojiCommand, MessageStream, CommandType, Permission} from "./plugin.js";
import {criticalError} from "./errorHandling.js";
import {State} from "./state.js";
import * as lang from "../lang/pluginManager.js"
import * as Discord from 'discord.js';
import * as Query from "./inputCollector.js";

export class PluginManager {
	public plugins: Map<string, Plugin> = new Map();

	private chatCommands: Map<string, ChatCommand> = new Map();
	private emojiCommands: Map<string, EmojiCommand> = new Map();
	private messageStreams: Map<string, MessageStream> = new Map();

	private pluginState = new State("plugin_manager");

	// used to setup permissions in the configurator
	private permissionPlugin: Plugin = {
		name: "permissions",
		pluginManager: this,
		client: this.client,
		setupTemplate: [
			{name:"User", type: Query.InputType.Role, description: lang.userRoleDesc()},
			{name:"UserCommandChannel", type: Query.InputType.Channel, description: lang.userChannelDesc()},
			{name:"Mod", type: Query.InputType.Role, description: lang.modRoleDesc()}
		]
	}

	constructor(private client: Discord.Client, private instanceConfig: {control_channel: string}) {
		this.loadPlugin(this.permissionPlugin);
	}

	public getState(): State {
		return this.pluginState;
	}

	public getChatCommands(): Map<string, ChatCommand> {
		return this.chatCommands;
	}

	public getEmojiCommands(): Map<string, EmojiCommand> {
		return this.emojiCommands;
	}

	public addChatCommand(command: ChatCommand): void {
		this.chatCommands.set(command.name, command);
	}

	public addEmojiCommand(command: EmojiCommand): void {
		this.emojiCommands.set(command.emoji.toString(), command);
	}

	/**
	 * Searches for Plugins on Disk, and loads all found plugins.
	 * This does not activate the Plugins
	 */
	public async scanForPlugins(path: fs.PathLike, suffix: string): Promise<void> {
		try {
			const files = fs.readdirSync(path);
			files.filter(file => file.endsWith(suffix));

			for (const file of files) {
				try {
					let plugin = (await import(file)).Plugin as Plugin;
					this.loadPlugin(plugin);
				} catch(e) {
					console.error(`Failed to load Plugin ${file}`);
				}
			}
		} catch(e) {
			criticalError("Failed to Load Plugins", e);
		}
	}

	/**
	 * Loads a single Plugin from Memory
	 * @param plugin Plugin to load
	 */
	public loadPlugin(plugin: Plugin): void {
		this.plugins.set(plugin.name, plugin);

		if (!plugin.setupTemplate) {
			this.pluginState.write(plugin.name, "configured", true);
		} else {
			// If the Plugin has a SetupTemplate, it will also need a state, to make use of it
			plugin.state = new State(plugin.name);
		}
	}

	/** Run a message as a command */
	public async runChatCommand(message: Discord.Message): Promise<void> {
		// Get the member
		let member = message.member;
		if (!member) return;

		// Check if member is in a Query. Members in Query should not be able to issue new commands
		if (Query.isUserInQuery(member.user)) return;

		// Get the arguments
		let args = message.content.toLowerCase().match(/(?<=!|\s)\S+/gm);
		if (!args || args.length === 0) return;

		// Find the command
		let cmd = args.shift() as string;
		let commannd = this.chatCommands.get(cmd);
		if (!commannd) return;

		// Check for permissons
		let memberPerm = this.getHighestMemberPermission(member);
		let perm = memberPerm >= commannd.permission;

		// If Member is a User, and Command is for Users, check they are posting in the right channel
		if (memberPerm === Permission.User && commannd.permission === Permission.User) {
			if (message.channel.id !== this.permissionPlugin.state?.read("config", "UserCommandChannel")) {
				perm = false;
			}
		}

		// Run the command
		if (perm) commannd.run(message, args);
	}

	/** Run a reaction as a emoji command */
	public async runEmojiCommand(reaction: Discord.MessageReaction, member: Discord.GuildMember): Promise<void> {
		// Find command
		let command = this.emojiCommands.get(reaction.emoji.toString());
		if (!command) return;

		// Check for permissons
		let memberPerm = this.getHighestMemberPermission(member);
		let perm = memberPerm >= command.permission;

		if (perm) {
			command.run(reaction);
		} else if (command.removeInvalid) {
			reaction.users.remove(member);
		}
	}

	/** Run all message Streams. Return whether message should be processed further */
	public async runChatStreams(message: Discord.Message): Promise<boolean> {
		let proceed = true;

		for (const [key, stream] of this.messageStreams) {
			// If channel is not whitelisted, skip it
			if (stream.channels && !stream.channels.includes(message.channel as Discord.TextChannel)) continue;

			let p = await stream.run(message);
			proceed = p && proceed;
		}

		return proceed;
	}

	/**
	 * Sets the client for Plugins to use,
	 * calls all Plugins init function,
	 * then loads their commands
	 */
	public initiateAll(): void {		
		this.plugins.forEach(p => {
			this._initiatePlugin(p);
		});
	}

	/** Attempts to activate all Plugins */
	public activateAll(): void {
		this.plugins.forEach(plugin => {
			this.activatePlugin(plugin.name);
		});
	}

	/** Load a Plugins commands, and set it to active. Returns false, if the Plugin was not found */
	public activatePlugin(name: string): boolean {
		let plugin = this.plugins.get(name);

		if (plugin && this.pluginState.read(plugin.name, "configured")) {
			this.pluginState.write(plugin.name, "active", true);
			this._initiatePlugin(plugin);
			return true;
		} else {
			return false;
		}
	}

	/** Deactive a Plugin, bypassing all its commands and processors. Returns false, if the Plugin was not found */
	public deactivatePlugin(name: string): boolean {
		let plugin = this.plugins.get(name);

		if (plugin) {
			this._unloadCommands(plugin);
			this.pluginState.write(plugin.name, "active", false);
			return true;
		} else {
			return false;
		}
	}

	/** Sets whether or not a plugin is configured */
	public setConfigured(name: string, configured: boolean): void {
		this.pluginState.write(name, "configured", configured);
	}

	/** Load a Plugin as a Built-In, which is required for other plugins/the bots operation, and cannot be deactivated, or configured */
	public addBuiltin(plugin: Plugin): void {
		plugin.init?.();
		this._loadCommands(plugin);
	}

	public checkPermission(member: Discord.GuildMember, permission: Permission): boolean {
		let channel = member.guild.channels.resolve(this.instanceConfig.control_channel) as Discord.TextChannel | null;
		
		if (!channel) {
			criticalError("Control channel not found! Please set a valid channel id, in instance.json");
			return false;
		}

		switch (permission) {
			case Permission.Any: {
				return true;
			} break;
				
			case Permission.User: {
				let role = this.permissionPlugin.state?.read("config", "User") as string | undefined;

				if (!role) {
					channel.send(lang.roleNotSet());
					return false;
				}

				return (member.roles.cache.get(role)) ? true : false;
			} break;

			case Permission.Mod: {
				let role = this.permissionPlugin.state?.read("config", "Mod") as string | undefined;

				if (!role) {
					channel.send(lang.roleNotSet());
					return false;
				}

				return (member.roles.cache.get(role)) ? true : false;
			} break;

			case Permission.Admin: {
				return member.permissions.has(Discord.Permissions.FLAGS.ADMINISTRATOR);
			} break;
		}
		
		return false;
	}

	public getHighestMemberPermission(member: Discord.GuildMember): Permission {
		if (this.checkPermission(member, Permission.Admin)) return Permission.Admin;
		if (this.checkPermission(member, Permission.Mod)) return Permission.Mod;
		if (this.checkPermission(member, Permission.User)) return Permission.User;
		
		return Permission.Any;
	}

	// ========== Private Functions ==========

	private _initiatePlugin(p: Plugin): void {
		if (this.pluginState.read(p.name, "active")) {
			p.init?.();
			this._loadCommands(p);
		}
	}

	/** Loads a Plugins commands */
	private _loadCommands(plugin: Plugin): void {
		plugin.commands?.forEach(command => {
			if (command.type === CommandType.Chat) this.chatCommands.set(command.name, command as ChatCommand);
			if (command.type === CommandType.Emoji) this.emojiCommands.set((command as EmojiCommand).emoji.toString(), command as EmojiCommand);
		});

		if (plugin.messageStream) this.messageStreams.set(plugin.name, plugin.messageStream);
	}

	// Remove a Plugins Commands from the Command Maps, so they wont be called again
	private _unloadCommands(plugin: Plugin): void {
		plugin.commands?.forEach(command => {
			if (command.type === CommandType.Chat) this.chatCommands.delete(command.name);
			if (command.type === CommandType.Emoji) this.emojiCommands.delete((command as EmojiCommand).emoji.toString());
		});

		if (plugin.messageStream) this.messageStreams.delete(plugin.name);
	}
}
