import * as Path from 'path'
import * as Fs from 'fs'

import * as Discord from "discord.js"

import * as config from "./config/server.json"

import { BuiltIn } from "./modules/builtinCommands.js"
import { PluginManager } from "./modules/pluginManager.js"
import { criticalError } from "./modules/errorHandling.js"


// ------ Initialize Bot ------

console.log("Mieps is initializing...");

process.on('unhandledRejection', (...args) => {
	console.log("UNHANDLED REJECTION:");
	console.error(args);
});
process.on('uncaughtException', (...args) => {
	console.log("UNCAUGHT EXCEPTION:");
	console.error(args);
});

// attempt to load instance config
var instanceConfig = {
	api_key: "",
	control_channel: ""
};

console.log("loading settings...");

let instancePath = Path.resolve("./instance.json");

try
{
	let cfgFile = Fs.readFileSync(instancePath, 'utf8');
	
	instanceConfig = JSON.parse(cfgFile);
}
catch
{
	let cfgFile = JSON.stringify(instanceConfig);

	try
	{
		Fs.writeFileSync(instancePath, cfgFile, 'utf8');
	}
	catch(e)
	{
		criticalError("Failed to create empty config File", e as Error);
	}
	
	criticalError(`Please configure the "instance.json" file`);
}

if (instanceConfig.api_key === "" || instanceConfig.control_channel === "")
{
	criticalError(`Please configure the "instance.json" file`);
}

// create client and connect
const client = new Discord.Client({
	intents: [
		Discord.Intents.FLAGS.GUILDS,
		Discord.Intents.FLAGS.GUILD_MEMBERS,
		Discord.Intents.FLAGS.GUILD_MESSAGES,
		Discord.Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
		Discord.Intents.FLAGS.MESSAGE_CONTENT
	]
});

client.login( instanceConfig.api_key );

console.log("connecting to Discord...");

const pluginManager = new PluginManager(client, instanceConfig);

// scan the plugin folder for plugin files
pluginManager.scanForPlugins( Path.resolve( config.plugin_folder ), config.plugin_suffix );

// add built-in plugin
var builtin = new BuiltIn(client, pluginManager);

pluginManager.addBuiltin(builtin);

// ------ Client Events ------

client.on("ready", () => {

	pluginManager.initiateAll();

	console.log("Mieps ready!");

});

client.on("message", async (message) => {
	if (message.partial) {
		try {
			message = await message.fetch();
		} catch (error) {
			console.error('Something went wrong when fetching the message: ', error);
			return;
		}
	}

	// don't react to non-text messages, or bot messages
	if (message.author.bot || message.channel.type !== "GUILD_TEXT") return;

	// run the message streams
	let runCommands = await pluginManager.runChatStreams(message);

	// if message streams did not block further execution, check for commands and run
	if (runCommands)
	{
		if (message.content.startsWith( config.command_prefix ))
		{
			pluginManager.runChatCommand(message);
		}
	}

});

client.on("messageReactionAdd", async (reaction, user) => {
	if (reaction.partial) {
		try {
			reaction = await reaction.fetch();
		} catch (error) {
			console.error('Something went wrong when fetching the reaction: ', error);
			return;
		}
	}

	if (user.bot || reaction.message.channel.type !== "GUILD_TEXT") return;
	
	pluginManager.runEmojiCommand(reaction, user as Discord.User);

});

client.on("guildMemberAdd", pluginManager.runJoinStreams);
client.on("guildMemberRemove", pluginManager.runLeaveStreams);

// trigger Reactions for uncached messages
// @ts-ignore: Argument type error
client.on("raw", async (packet) => {
	// we only want reaction add events
    if ('MESSAGE_REACTION_ADD' !== packet.t) return;

	let channel = client.channels.cache.get( packet.d.channel_id ) as Discord.TextChannel;

	// if for whatever reason, the channel does not exists, abort
	if (!channel) return;

	if (channel.partial) {
		try {
			channel = await channel.fetch();
		} catch (error) {
			console.error('Something went wrong when fetching the channel: ', error);
			return;
		}
	}

	// if it's not a text channel, abort as well
	if (channel.type !== "GUILD_TEXT") return;

    // there's no need to emit if the message is cached, because the event will fire anyway for that
	if (channel.messages.cache.has( packet.d.message_id )) return;
	
	// fetch and cache message
	let message = await channel.messages.fetch( packet.d.message_id, {
		cache: true,
	});

	// set the emoji to either a custom one, or a default one
	const emoji = packet.d.emoji.id ?? packet.d.emoji.name;

	const reaction = message.reactions.cache.get(emoji);

	if (reaction)
	{
		// update the reaction cache
		reaction.users.cache.set( packet.d.user_id, client.users.cache.get( packet.d.user_id ) as Discord.User);

		// emit reaction event, with now cached message and reaction
		client.emit('messageReactionAdd', reaction as Discord.MessageReaction, client.users.cache.get( packet.d.user_id ) as Discord.User);
	}

});
