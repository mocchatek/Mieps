import * as Discord from "discord.js"

import * as Lang from "../lang/embedMaker.js"
import { EmbedMessage } from "./plugin.js";


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
): Promise<EmbedMessage>
{
	
	// if the message is another bot embed, copy it
	if (message.author.bot && message.embeds.length === 1 && message.content.trim() === "")
	{
		return { embeds: message.embeds.slice(0, 1) };
	}

	let embed = new Discord.MessageEmbed();

	// set embeds author
	let av: string | null = null;
	
	if (showUserIcon)
	{ 
		av = message.author.avatarURL();
	}

	if (showUserName)
	{
		embed.author = {
			name: message.member?.displayName ?? message.author.username,
			iconURL: av ?? undefined
		};
	}
	
	// colorize embed
	embed = embed.setColor(message.member?.displayColor ?? '#ffffff');

	// add content
	embed = embed.setDescription( message.content );

	if (showTimestamp)
	{
		embed = embed.setTimestamp( message.createdTimestamp );
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

			embed = embed.addField(`\u2514\u2500\u25b7 ${ Lang.reply } ${authorName}:`, replyTxt);
		}
	}

	const result = {} as EmbedMessage;

	// reattach image
	let attachment = message.attachments.first();

	if (attachment && (attachment.width || attachment.height))
	{
		embed = embed.setImage( `attachment://${attachment.name}` );
		result.files = [ attachment.url ];
	}
	
	result.embeds = [ embed ];
	return result;
}
