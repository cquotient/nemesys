'use strict';
const fs = require('fs');
const path = require('path');

fs.readdirSync(path.join(__dirname, 'api')).forEach((file) => {
	let f = path.join(__dirname, 'api', file);
	if (fs.statSync(f).isDirectory()) {
		exports[file] = require(f);
	}
});

