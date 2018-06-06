'use strict';

var pack = require('./package.json');
var bunyan = require('bunyan');
module.exports = function(name)
{
	bunyan.getLogger = function(s)
	{
		var log = bunyan.createLogger({
			name: name,
			module: s,
			version: pack.version
		});
		log.level ('debug');
		return log;
	};
	return bunyan;
};