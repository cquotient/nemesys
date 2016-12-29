'use strict';

let sandbox;

beforeEach(function(){
	let Logger = require('../src/logger');
	sandbox = require('sinon').sandbox.create();
	sandbox.stub(Logger, 'error');
	sandbox.stub(Logger, 'info');
	sandbox.stub(process, 'exit');
});

afterEach(function(){
	sandbox.restore();
});
