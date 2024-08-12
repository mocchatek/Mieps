import * as Discord from "discord.js"

import * as Lang from "../lang/embedMaker.js"

/**
 * creates a embed from a message
 * @param message message to create embed from
 * @param showUserIcon if the authors icon should be included
 * @param showUserName if the users name should be included
 * @param showTimestamp if the original message timestamp should be included
 */
export async function embedFromMessage(
	message: Discord.Message,
	showUserIcon: boolean = true,
	showUserName: boolean = true,
	showTimestamp: boolean = true
): Promise<Discord.MessageCreateOptions>
{
	
	// if the message is another bot embed, copy it
	if (message.author.bot && message.embeds.length === 1 && message.content.trim() === "")
	{
		return { embeds: message.embeds.slice(0, 1) };
	}

	let embedBuilder = new Discord.EmbedBuilder();

	// set embeds author
	let av: string | null = null;
	
	if (showUserIcon)
	{ 
		av = message.author.avatarURL();
	}

	if (showUserName)
	{
		embedBuilder.setAuthor({
			name: message.member?.displayName ?? message.author.username,
			iconURL: av ?? undefined
		});
	}
	
	// colorize embed
	embedBuilder = embedBuilder.setColor(message.member?.displayColor ?? '#ffffff');

	// add content
	embedBuilder = embedBuilder.setDescription( message.content );

	if (showTimestamp)
	{
		embedBuilder = embedBuilder.setTimestamp( message.createdTimestamp );
	}

	// fetch reply and add preview text
	let replyMsg: Discord.Message | null = null;

	if (message.reference?.channelId === message.channel.id && message.reference.messageId)
	{
		try {
			replyMsg = await message.channel.messages.fetch( message.reference.messageId );
		}
		catch {}
		
		if (replyMsg)
		{
			let replyTxt = "> " + replyMsg.cleanContent;

			replyTxt = replyTxt.replace( /(\r\n|\r|\n)/gm, "\n> ");

			if (replyTxt.length > 64)
			{
				replyTxt = replyTxt.slice(0, 64 - 3) + "...";
			}

			let authorName = "";

			if (replyMsg.member !== null)
			{
				authorName = replyMsg.member.displayName;
			}
			else
			{
				authorName = replyMsg.author.username;
			}

			embedBuilder.addFields({
				name: `\u2514\u2500\u25b7 ${ Lang.reply } ${authorName}:`,
				value: replyTxt
			});
		}
	}

	const result = {} as Discord.MessageCreateOptions;

	// reattach image
	let attachment = message.attachments.first();

	if (attachment && (attachment.width || attachment.height))
	{
		embedBuilder = embedBuilder.setImage( `attachment://${attachment.name}` );
		result.files = [ attachment.url ];
	}
	
	result.embeds = [ embedBuilder ];
	return result;
}
