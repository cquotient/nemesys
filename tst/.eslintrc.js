module.exports = {
	'env': {
		'es6': true,
		'node': true
	},
	'extends': 'eslint:recommended',
	'rules': {
		// TODO - fix all the inconsistent ones, then re-enable
		// 'indent': [
		// 	'error',
		// 	'tab'
		// ],
		'linebreak-style': [
			'error',
			'unix'
		],
		// TODO - fix all the inconsistent ones, then re-enable
		// 'quotes': [
		//     'error',
		//     'single'
		// ],
		'semi': [
			'error',
			'always'
		],
		'no-console': 0,
		'no-unused-vars': 0
	},
	'globals': {
		'describe': false,
		'it': false,
		'before': false,
		'beforeEach': false,
		'after': false,
		'afterEach': false
	}
};
