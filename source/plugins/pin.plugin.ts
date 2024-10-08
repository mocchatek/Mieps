import * as Discord from "discord.js"

import * as Lang from "../lang/plugins/pin.js"
import * as Plugin from "../modules/plugin.js"

import { State } from "../modules/state.js"
import { embedFromMessage } from "../modules/embedMaker.js"


// ========== Constants ==========
const timeLimit = 600000;

// ========== Plugin ==========

export default class MessagePinner extends Plugin.Plugin implements Plugin.iPlugin
{
	name = "message_pinner";
	description = Lang.pluginDescription;

	state = new State( this.name );

	setupTemplate: Plugin.SetupTemplate = [
		{ name: "pin_channel", description: Lang.pinChannel, type: Plugin.InputType.Channel },
		{ name: "pin_count", description: Lang.pinCount, type: Plugin.InputType.Number },
		{ name: "pin_emoji", description: Lang.pinEmoji, type: Plugin.InputType.Emoji }
	];

	private pin = new Pin(this);

	async init(): Promise<void>
	{
		this.pin.emoji = await this.getSetting<Discord.Emoji>( "pin_emoji", Plugin.InputType.Emoji );
	}

	commands = [
		this.pin
	]
}

// ========== Functions ==========

async function checkForAuthor(reaction: Discord.MessageReaction, author: Discord.User): Promise<boolean>
{
	await reaction.users.fetch();

	return reaction.users.cache.has( author.id );
}

async function fetchMessages(message: Discord.Message, author: Discord.User): Promise<Array<Discord.Message>>
{
	let messages: Array<Discord.Message> = [ message ];
	let channel = message.channel;
	if (channel.partial) channel = await channel.fetch();

	let msg = message;

	// Add up to 25 messages from same author
	for (var i = 0; i < 25; i++)
	{
		var nextFetch = await channel.messages.fetch({
			limit: 1,
			before: msg.id
		});

		var nextMsg = nextFetch.first();
		
		// There is no next message
		if (!nextMsg)
		{
			break;
		}

		// Next message is not by author
		if (nextMsg.author.id !== author.id)
		{
			break;
		}

		// Next message was posted more than 10 min ago
		if (msg.createdTimestamp - nextMsg.createdTimestamp > timeLimit)
		{
			break;
		}

		messages.push(nextMsg);
		
		msg = nextMsg;
	}

	return messages;
}

// ========== Emoji Commands ==========

class Pin extends Plugin.EmojiCommand
{
	constructor(private plugin: MessagePinner)
	{
		super("pin");
	}

	permission = Plugin.Permission.User;

	getHelpText()
	{
		return Lang.pinHelp;
	}

	async run(reaction: Discord.MessageReaction, member: Discord.GuildMember): Promise<void>
	{
		let count = await this.plugin.getSetting( "pin_count", Plugin.InputType.Number ) as number;

		let message = reaction.message;
		if (message.partial) message = await message.fetch();
		let messageChannel = message.channel;
		if (messageChannel.partial) messageChannel = await message.channel.fetch();
		let author = message.author;

		let pinChannel = await this.plugin.getSetting( "pin_channel", Plugin.InputType.Channel ) as Discord.TextChannel;
		if (pinChannel.partial) pinChannel = await pinChannel.fetch();

		// Check if author has reacted
		if (!await checkForAuthor(reaction, author))
		{

			// Check if author should be notified
			if (reaction.count && reaction.count >= count - 1)
			{
				// Check if author was notified before
				let notificationMessages = this.plugin.state.read("notes", messageChannel.id) as Array<string> | undefined;

				if (notificationMessages && notificationMessages.includes( message.id ))
				{
					return; // Exit if Author was notified before
				}

				if (!notificationMessages) notificationMessages = [];

				notificationMessages.push( message.id );

				this.plugin.state.write("notes", messageChannel.id, notificationMessages);

				message.reply( Lang.authorMissingFeedback(
					pinChannel,
					this.emoji
				));
			}

			return;
		}

		// Check if there are enough Reactions
		if (!reaction.count || reaction.count < count)
		{
			return;
		}

		// Check if message was pinned before
		let channelMessages = this.plugin.state.read( "pins", messageChannel.id ) as Array<String> | undefined;

		if (channelMessages && channelMessages.includes( message.id ))
		{
			return; // Exit if message was pinned before
		}

		// Note it down as a pinned message
		if (!channelMessages) channelMessages = [];

		channelMessages.push( message.id );

		this.plugin.state.write("pins", messageChannel.id, channelMessages);

		let messages = await fetchMessages(message, author);

		let embeds: Array<Discord.MessageCreateOptions> = [];

		// Iterate the Array backwards, as the order is reversed
		for (var i = messages.length - 1; i >= 0; i--)
		{

			embeds.push( await embedFromMessage(
				messages[i],
				true,
				(i == messages.length - 1),
				(i == 0)
			));

		}

		await pinChannel.send( Lang.pinHeadingMessage( author, messageChannel ) );

		for (const embed of embeds)
		{
			await pinChannel.send(embed);
		}
	}

}
