'use strict';

var commands = require( '../commands.js' );
var permissions = require( '../permissions.js' );
var settings = require( '../settings.js' );
var _ = require( '../helper.js' );

var notices = require( './notices.js' );

function clearMessages( msg, limit, target, after )
{	
	if ( isNaN( limit ) )
		return msg.channel.sendMessage( _.fmt( '`%s` is not a number', limit ) );
	
	if ( parseInt( limit ) > 100 )
		return msg.channel.sendMessage( _.fmt( 'can only delete `100` messages at a time' ) );
	
	if ( !client.User.can( permissions.discord.Text.MANAGE_MESSAGES, msg.channel ) )
		return msg.channel.sendMessage( "invalid 'manage messages' permission in this channel" );
	
	if ( target )
	{
		target = commands.findTarget( msg, target );
		if ( target === false )
			return;
	}
	else if ( !after )
		limit++; // clear the user's !clear command as well
	
	var before = msg;
	if ( after ) before = null;
	
	limit = Math.min( limit, 100 );
	var lookback = 100; // number of messages to look back into
	msg.channel.fetchMessages( lookback, null, after ).then( () =>
		{
			var msglist = msg.channel.messages;
			if ( after ) msglist.reverse();
			
			var toDelete = [];
			for ( var i = msglist.length-1; i >= 0; i-- )
			{
				var message = msglist[i];
				
				if ( message.deleted || ( target !== false && target.id != message.author.id ) )
					continue;
				
				if ( toDelete.length >= limit )
					break;
					
				toDelete.push( message );
			}
			
			client.Messages.deleteMessages( toDelete ).then( () =>
				{
					var byUser = '';
					if ( target !== false )
						byUser = _.fmt( ' by `%s`', _.nick( target ) );
					var numCleared = toDelete.length;
					if ( !after ) numCleared -= 1;  // subtract user's !clear command
					msg.channel.sendMessage( _.fmt( '`%s` cleared `%s` messages%s', _.nick( msg.member ), numCleared, byUser ) );
				}).catch( e => msg.channel.sendMessage( _.fmt( 'error deleting messages: `%s`', e.message ) ) );
		}).catch( e => msg.channel.sendMessage( _.fmt( 'error fetching messages: `%s`', e.message ) ) );
}

commands.register( {
	category: 'moderation',
	aliases: [ 'clear' ],
	help: 'clear messages',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'limit=100 [user]',
	callback: ( client, msg, args ) =>
	{
		var split = args.split( ' ' );
		var limit = split[0] || 99;
		var target = split[1] || false;
		
		clearMessages( msg, limit, target, null );
	}});

commands.register( {
	category: 'moderation',
	aliases: [ 'clearafter' ],
	help: 'clear messages after a message ID',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'messageID [limit=100]',
	callback: ( client, msg, args ) =>
	{	
		var split = args.split( ' ' );
		var after = split[0];
		var limit = split[1] || 99;
		
		if ( isNaN( after ) )
			return msg.channel.sendMessage( _.fmt( '`%s` is not a numeric message ID', after ) );
		
		clearMessages( msg, limit, false, after );
	}});

function kickMember( member, admin, reason )
{
	var guild = member.guild;
	
	reason = reason || '';
	if ( reason != '' )
		reason = '(reason: `' + reason + '`)';
	notices.sendGuildNotice( guild.id, _.fmt( '`%s` was kicked by `%s` %s', _.nick( member ), _.nick( admin, guild ), reason ) );
	
	notices.suppressNotice( guild.id, 'GUILD_MEMBER_REMOVE', member.id );
	member.kick();
	
	member.openDM().then( dm => dm.sendMessage( _.fmt( '**NOTICE:** You have been kicked from `%s` by `%s` %s', guild.name, _.nick( admin, guild ), reason ) ) );
}
module.exports.kickMember = kickMember;

commands.register( {
	category: 'moderation',
	aliases: [ 'kick' ],
	help: 'kick a member from the server',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'target [reason]',
	callback: ( client, msg, args ) =>
	{	
		var args = _.sanesplit( args, ' ', 1 );
		var target = args[0];
		var reason = args[1];
		
		target = commands.findTarget( msg, target );
		if ( target === false )
			return;
		
		kickMember( target, msg.member, reason );
	}});

function banMember( member, admin, reason )
{
	var guild = member.guild;
	
	reason = reason || '';
	if ( reason != '' )
		reason = '(reason: `' + reason + '`)';
	notices.sendGuildNotice( guild.id, _.fmt( '`%s` was banned by `%s` %s', _.nick( member ), _.nick( admin, guild ), reason ) );
	
	notices.suppressNotice( guild.id, 'GUILD_MEMBER_REMOVE', member.id );
	notices.suppressNotice( guild.id, 'GUILD_BAN_ADD', member.id );
	member.ban(0);
	
	member.openDM().then( dm => dm.sendMessage( _.fmt( '**NOTICE:** You have been banned from `%s` by `%s` %s', guild.name, _.nick( admin, guild ), reason ) ) );
}
module.exports.banMember = banMember;

commands.register( {
	category: 'moderation',
	aliases: [ 'ban' ],
	help: 'ban a member from the server',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'target [reason]',
	callback: ( client, msg, args ) =>
	{	
		var args = _.sanesplit( args, ' ', 1 );
		var target = args[0];
		var reason = args[1];
		
		target = commands.findTarget( msg, target );
		if ( target === false )
			return;
		
		banMember( target, msg.member, reason );
	}});

commands.register( {
	category: 'moderation',
	aliases: [ 'region', 'changeregion', 'setregion' ],
	help: 'change server region',
	flags: [ 'admin_only', 'no_pm' ],
	args: '[region]',
	callback: ( client, msg, args ) =>
	{
		var guild = msg.guild;
		guild.fetchRegions().then( regionList =>
			{
				var regions = [];
				for ( var i in regionList )
				{
					var r = regionList[i];
					if ( !r.deprecated && !r.vip && !r.custom )
						regions.push( r.id );
				}
				
				if ( !args || regions.indexOf( args ) == -1 )
					return msg.channel.sendMessage( _.fmt( 'available regions:\n```%s```', regions.join( ', ' ).replace( /((?:[^, ]*\, ){3})/g, '$1\n' ) ) );
				
				notices.suppressNotice( msg.member.guild.id, 'GUILD_UPDATE' );
				notices.sendGuildNotice( msg.member.guild.id, _.fmt( '`%s` changed server region to `%s`', _.nick( msg.member ), args ) );
				guild.edit( undefined, undefined, args );
			});
	}});

var client = null;
module.exports.setup = function( _cl )
	{
		client = _cl;
		_.log( 'loaded plugin: moderation' );
	};