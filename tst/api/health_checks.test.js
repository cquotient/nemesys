'use strict';

const Promise = require('bluebird');
const expect = require('chai').expect;
const sinon = require('sinon');

const AWSProvider = require('../../src/api/aws_provider');
const health_checks = require('../../src/api/health_checks');

describe('health checks', function () {
	let sandbox, mock_ec2;

	beforeEach(function () {
		sandbox = sinon.sandbox.create();

		mock_ec2 = {
			waitForAsync: sandbox.stub().returns(
				Promise.resolve({
					Reservations: [
						{
							Instances: [
								{
									InstanceId: '123',
									State: {
										Name: 'running'
									}
								}
							]
						}
					]
				})
			)
		};

		sandbox.stub(AWSProvider, 'get_ec2', () => mock_ec2);
	});

	afterEach(function () {
		sandbox.restore();
	});

	it('wait for status calls waitForAsync', function () {
		return health_checks
			.wait_until_status('us-east-1', '123', 'instanceExists')
			.then(function (result) {
				expect(mock_ec2.waitForAsync.calledWith('instanceExists', {
					InstanceIds: ['123']
				})).to.be.true;

				expect(result).eql('123');
			});
	});
});
