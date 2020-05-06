import * as Discord from "discord.js";

//const filterRegex = /[^a-zA-Z0-9 #]+/;

/**
 * Searches a Guild for a member, with a pretty lax input
 * @param userName Lowercase name of the user
 * @param guild Guild to search for member
 */
export async function findMember (userName: string, guild: Discord.Guild): Promise<Discord.GuildMember | undefined> {
	let member: Discord.GuildMember | undefined;

	let memberList = await guild.members.fetch();

	if (userName.includes('#')) {
		member = memberList.find(m => userName === m.user.tag.toLowerCase());
	}

	if (member === undefined) {
		member = memberList.find(m => m.displayName.toLowerCase() === userName);
	}

	if (member === undefined && userName.includes('<@')) {
		let userID = userName.replace(/<@|>/g, '');
		member = memberList.find(m => m.id.toLowerCase() === userID);
	}

	return member;
}
