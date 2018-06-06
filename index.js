var log = require('./logger.js')('debug').getLogger('server');
require('dotenv').config();
var error = require('./error.js');
var containerRouter = require('./routers/container.js');
var express = require('express');
var path = require('path');
var http = require('http');
var morgan = require('morgan');
var bodyParser = require('body-parser');

var port = process.env.PORT || 3000;
var app = express();

app.use(morgan('dev'));

var server = http.createServer(app);

var apiv1 = express.Router();

apiv1.use(bodyParser.json());
apiv1.use('/containers', containerRouter.router);

// api v1
app.use('/api/v1', apiv1);

app.use(function (err, req, res, next) {
	next;
	log.error(err, 'Error');
	error.sendError(res, error.serverError(err));
});

server.listen(port, function (err) {
	if (err) {
		log.error('Server ' + err);
	}
	else {
		log.info('Server start port ' + port);
	}
});
