'use strict';

var statusCodes = require('http-status-codes');
const Layer = require('express/lib/router/layer');

Object.defineProperty(Layer.prototype, 'handle',{
	enumerable: true,
	get: function () { return this.__handle; },
	set: function (fn) {
		if (fn.length <= 3)
			fn = wrap(fn);
		this.__handle = fn;
	}
});

function wrap(fn) {
	return (req, res, next) => {
		res.requestId = req.requestId;
		const routePromise = fn(req, res, next);
		if (routePromise && routePromise.catch) {
			routePromise.catch(err => next(err));
		}
	};
}

function error (status, err){
	return{
		status: status,
		data:{
			statusError: statusCodes.getStatusText(status),
			err: err
		}
	};
}

function unauthorised (err)
{
	return error(statusCodes.UNAUTHORIZED, err);
}

function badRequest (err)
{
	return error(statusCodes.BAD_REQUEST, err);
}

function notFound (err)
{
	return error(statusCodes.NOT_FOUND, err);
}

function serverError (err)
{
	return error(statusCodes.INTERNAL_SERVER_ERROR, err);
}

function notAcceptable(err)
{
	return error(statusCodes.NOT_ACCEPTABLE, err);
}

function sendError(res, e)
{
	e.data.requestId = res.requestId;
	res.status(e.status).send (e.data);
}

function mongoErrors(errors)
{
	var data = {};
	for(let key in errors)
	{
		data[key]={
			type: errors[key].kind,
			message: errors[key].message
		};
	}
	return data;
}

var log = require('bunyan').getLogger('error');

process.on('uncaughtException', function(ex){
	console.error('Uncaught Exception');
	console.error(ex.stack);
	log.fatal('Uncaught Exception',{exception: ex});
	process.nextTick(function (){
		process.exit(2);
	});
});

module.exports.unauthorised = unauthorised;
module.exports.badRequest = badRequest;
module.exports.notFound = notFound;
module.exports.notAcceptable=notAcceptable;
module.exports.serverError = serverError;
module.exports.sendError = sendError;
module.exports.mongoErrors = mongoErrors;