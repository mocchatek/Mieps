import * as Discord from "discord.js"

import * as Plugin from "../modules/plugin.js"
import Settings from "./selfAssignRoles/settings.json"
import * as Lang from "../lang/plugins/selfAssignRoles.js"


// ========== Plugin ==========

export default class selfAssignRoles extends Plugin.Plugin
{
	name = "self_assign_roles";
	
	commands: Array<SetRole> = [];
	description = Lang.description;
	
	async init(): Promise<void>
	{
		this.commands = [];
		
		Settings.topics.forEach( topic => {
			
			this.commands.push(
				new SetRole(topic)
			);
			
		});
		
	}

}

// ========== Interfaces ==========

interface Role
{
	name: string,
	role: string
}

interface Topic
{
	command: string,
	set_message: string,
	cleared_message: string,
	help: string,
	roles: Array<Role>
}

// ========== Functions ==========

/**
 * Constructs a string of available roles, excluding aliases
 * @param array Array of roles to construct string from
 */
function buildRoleString(array: Array<Role>): string
{
	let message = "";
	let set: Array<string> = [];
	
	for (let i = 0; i < array.length; i++)
	{
		if (set.includes( array[i].role )) continue;
		
		set.push( array[i].role );
		
		message += "\n";
		message += array[i].name;
	}
	
	return message;
}

/**
 * Checks if a role name appears in a topic, and returns role object
 * @param name Role name to match
 * @param topic Topic to search for
 */
function findRoleInTopic(name: string, topic: Topic): Role | undefined
{
	let roleObj = topic.roles.find( role => {
		
		return role.name.toLowerCase() === name.replace(/[.,]/g, '');
		
	});
	
	return roleObj;
}

/**
 * Tries to add a role to the author of a message
 * @param message 
 * @param roleName 
 * @param topic Topic which has to contain role
 */
function addRole(message: Discord.Message, roleName: string, topic: Topic): Role | null
{
	let roleObj = findRoleInTopic(roleName, topic) as Role;
	
	if (!roleObj)
	{
		return null;
	}
	
	let role = message.guild?.roles.cache.find( (r: Discord.Role) => r.name === roleObj.role );
	
	if (!role)
	{
		return null;
	}
	
	message.member?.roles.add(role);
	
	return roleObj;
}

/**
 * Tries to remove a role from the message author
 * @param message 
 * @param roleName 
 */
function removeRole(message: Discord.Message, roleName: string): boolean
{
	let role = message.member?.roles.cache.find( (r: Discord.Role) => r.name === roleName );
	
	if (role == undefined)
	{
		return false;
	}
	
	message.member?.roles.remove(role);
	
	return true;
}

/**
 * Replaces all occurrences of "$ROLES" in a string, with actual roles
 * @param messageTxt string to parse
 * @param roles roles to insert
 */
function fillTemplate(messageTxt: string, roles: Array<Role>): string
{
	return messageTxt.replace( /\$ROLES/gm, `${ buildRoleString(roles) }` );
}

// ========== Commands ==========

class SetRole extends Plugin.ChatCommand
{
	topic: Topic;
	
	permission = Plugin.Permission.User;
	
	constructor(topic: Topic)
	{
		super( topic.command );
		this.topic = topic;
	}
	
	getHelpText()
	{
		return fillTemplate( this.topic.help, this.topic.roles );
	}
	
	async run(message: Discord.Message, args: Array<string>): Promise<void>
	{
		let channel = message.channel;
		
		// reset command
		if (args[0] === Lang.resetCommand) {
			// Clear all other roles
			for (const roleObj of this.topic.roles)
			{
				removeRole( message, roleObj.role );
			}
			
			message.channel.send( fillTemplate( this.topic.cleared_message, this.topic.roles ) );
			return;
		}
		
		// Roles that were set with this command
		let setRoles = [];
		
		// Attempts to set all provided roles
		for (const roleName of args)
		{
			let roleObj = addRole( message, roleName, this.topic );
			
			if (roleObj !== null)
			{
				setRoles.push(roleObj);
			}
		}
		
		// If no roles were successfully set, respond with help text
		if (setRoles.length === 0)
		{
			channel.send( this.getHelpText() );
			
			return;
		} else {
			message.channel.send( fillTemplate( this.topic.set_message, setRoles ) );
		}
		
	}
	
}
