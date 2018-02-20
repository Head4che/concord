const commands = require( '../commands.js' )
const permissions = require( '../permissions.js' )
const settings = require( '../settings.js' )
const _ = require( '../helper.js' )

const notices = require( './notices.js' )

// TO DO: redo
function clearMessages( msg, limit, target, after )
{
	if ( isNaN( limit ) )
		return msg.channel.send( _.fmt( '`%s` is not a number', limit ) )
	
	if ( parseInt( limit ) > 100 )
		return msg.channel.send( _.fmt( 'can only delete `100` messages at a time' ) )
	
	if ( !client.user.hasPermission( require( 'discord.js' ).Permissions.FLAGS.MANAGE_MESSAGES, msg.channel ) )
		return msg.channel.send( "invalid 'manage messages' permission in this channel" )
	
	if ( target )
	{
		target = commands.findTarget( msg, target )
		if ( target === false )
			return
	}
	else if ( !after )
		limit++ // clear the user's !clear command as well
	
	let before = msg
	if ( after ) before = null
	
	limit = Math.min( limit, 100 )
	const lookback = 100 // number of messages to look back into
	msg.channel.fetchMessages( lookback, null, after ).then( () =>
		{
			const msglist = msg.channel.messages
			if ( after ) msglist.reverse()
			
			const toDelete = []
			for ( let i = msglist.length - 1; i >= 0; i-- )
			{
				const message = msglist[i]
				
				if ( message.deleted || ( target !== false && target.id !== message.author.id ) )
					continue
				
				if ( toDelete.length >= limit )
					break
					
				toDelete.push( message )
			}
			
			client.Messages.deleteMessages( toDelete ).then( () =>
				{
					let byUser = ''
					if ( target !== false )
						byUser = _.fmt( ' by `%s`', _.nick( target ) )
					let numCleared = toDelete.length
					if ( !after ) numCleared -= 1  // subtract user's !clear command
					msg.channel.send( _.fmt( '`%s` cleared `%s` messages%s', _.nick( msg.member ), numCleared, byUser ) )
				}).catch( e => msg.channel.send( _.fmt( 'error deleting messages: `%s`', e.message ) ) )
		}).catch( e => msg.channel.send( _.fmt( 'error fetching messages: `%s`', e.message ) ) )
}

commands.register( {
	category: 'moderation',
	aliases: [ 'clear' ],
	help: 'clear messages',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'limit=100 [user]',
	callback: ( client, msg, args ) =>
	{
		const split = args.split( ' ' )
		const limit = split[0] || 99
		const target = split[1] || false
		
		clearMessages( msg, limit, target, null )
	} })

commands.register( {
	category: 'moderation',
	aliases: [ 'clearafter' ],
	help: 'clear messages after a message ID',
	flags: [ 'admin_only', 'no_pm' ],
	args: 'messageID [limit=100]',
	callback: ( client, msg, args ) =>
	{
		const split = args.split( ' ' )
		const after = split[0]
		const limit = split[1] || 99
		
		if ( isNaN( after ) )
			return msg.channel.send( _.fmt( '`%s` is not a numeric message ID', after ) )
		
		clearMessages( msg, limit, false, after )
	} })

const tempBlacklists = {}
const tempBlacklistDelay = 10 * 1000
function updateTempBlacklists()
{
	for ( const uid in tempBlacklists )
	{
		if ( _.time() > tempBlacklists[uid] )
		{
			delete tempBlacklists[uid]
			
			const index = commands.tempBlacklist.indexOf( uid )
			commands.tempBlacklist.splice( index, 1 )
		}
	}
	
	setTimeout( updateTempBlacklists, tempBlacklistDelay )
}

const nextWarning = {}
const eventAllowance = {}
const lastEvent = {}
function processCooldown( member )
{
	if ( permissions.hasAdmin( member ) && settings.get( 'moderation', 'cooldown_admin_immunity', false ) ) return
	if ( commands.tempBlacklist.includes( member.id ) ) return
	if ( commands.blacklistedUsers.includes( member.id ) ) return
	
	const guild = member.guild
	
	const timespan = settings.get( 'moderation', 'cooldown_timespan', 10 ) * 1000
	const warning = settings.get( 'moderation', 'cooldown_warning_ratio', 1.5 )
	const rate = settings.get( 'moderation', 'cooldown_rate', 3.5 )
	
	if ( !eventAllowance[ member.id ] )
		eventAllowance[ member.id ] = rate
	
	if ( !lastEvent[ member.id ] )
		lastEvent[ member.id ] = Date.now()
	
	const time_passed = Date.now() - lastEvent[ member.id ]
	lastEvent[ member.id ] = Date.now()
	eventAllowance[ member.id ] += time_passed * ( rate / timespan )
	eventAllowance[ member.id ] -= 1
	
	if ( eventAllowance[ member.id ] > rate )
		eventAllowance[ member.id ] = rate
	
	if ( eventAllowance[ member.id ] < 1 )
	{
		delete eventAllowance[ member.id ]
		
		commands.tempBlacklist.push( member.id )
		tempBlacklists[ member.id ] = _.time() + settings.get( 'moderation', 'cooldown_blacklist_time', 60 )
		member.createDM().then( dm => dm.send( _.fmt( '**NOTICE:** You have been temporarily blacklisted due to excess spam' ) ) )
		
		const owner = client.users.find( 'id', settings.get( 'config', 'owner_id', '' ) )
		if ( owner )
			owner.createDM().then( d => d.send( _.fmt( '**NOTICE:** Automatically added `%s#%s` to temporary blacklist for spam', member.username, member.discriminator ) ) )
	}
	else if ( eventAllowance[ member.id ] <= warning )
	{
		if ( !nextWarning[ member.id ] || Date.now() >= nextWarning[ member.id ] )
		{
			nextWarning[ member.id ] = Date.now() + timespan / 2
			member.createDM().then( dm => dm.send( _.fmt( '**WARNING:** Potential spam detected. Please slow down or you will be temporarily blacklisted' ) ) )
		}
	}
}
module.exports.processCooldown = processCooldown

var client = null
module.exports.setup = _cl => {
    client = _cl
    updateTempBlacklists()
    _.log( 'loaded plugin: moderation' )
}
