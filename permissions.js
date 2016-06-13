'use strict';

var settings = require( './settings.js' );
var _ = require( './helper.js' );

var permissions = {};

permissions.hasGlobalRole = function( user, roleName )
	{
		var found = false;
		client.Guilds.forEach( function( guild )
			{
				if ( found )
					return;
				
				var member = user.memberOf( guild );
				if ( !member )
					return;
				
				var role = guild.roles.find( (r) => { return r.name === roleName } );
				if ( !role )
					return;
				
				if ( member.hasRole( role ) )
				{
					found = true;
					return;
				}
			} );
		return found;
	};
	
permissions.hasAdmin = function( user )
	{
		var adminrole = settings.get( 'config', 'admin_role', 'admin' );
		if ( permissions.hasGlobalRole( user, adminrole ) || permissions.isOwner( user ) )
			return true;
		return false;
	};
	
permissions.isOwner = function( user )
	{
		var ownerid = settings.get( 'config', 'owner_id', '' );
		if ( user.id == ownerid )
			return true;
		return false;
	};

permissions.userHasCommand = function( user, command )
	{
		if ( !command.flags )
			return true;
		
		if ( command.flags.length == 1 && command.flags.indexOf( 'no_pm' ) != -1 )
			return true;
		
		if ( command.flags.indexOf( 'owner_only' ) != -1 && permissions.isOwner( user ) )
			return true;
		
		if ( command.flags.indexOf( 'admin_only' ) != -1 && permissions.hasAdmin( user ) )
			return true;
		
		return false;
	};
	
permissions.discord = require('discordie').Permissions;

var client = null;
permissions.init = function( _cl )
	{
		client = _cl;
		_.log( 'initialized permissions' );
	};
	
module.exports = permissions;
