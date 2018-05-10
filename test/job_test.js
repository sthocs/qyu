const Job = require('../src/job');

const chai = require('chai');
const chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
const assert = require('assert');
const expect = chai.expect;
chai.should();

describe('Job', function() {
  describe('#constructor', function() {
    it('should init properties correctly', function() {
      let jobObject = new Job(testJob, 3, 'test_id');

      assert.equal(jobObject.job, testJob);
      assert.equal(jobObject.priority, 3);
      assert.equal(jobObject.jobId, 'test_id');
      assert.ok(!jobObject.executed);
      assert.ok(!jobObject.promised);
    });
  });

  describe('#getPromise', function() {
    it('should return a promise fulfilled with the job result after execution', function(done) {
      let jobObject = new Job(testJob, 3, 'test_id');

      expect(jobObject.getPromise()).to.eventually.have.property('test').notify(done);
      jobObject.execute();
    });

    it('should return a promise fulfilled with the result of the job which was executed before', function() {
      let jobObject = new Job(testJob, 3, 'test_id');

      jobObject.execute();
      return expect(jobObject.getPromise()).to.eventually.have.property('test');
    });
  });

  describe('#execute', function() {
    it('should return a promise rejected when the job is not async', function() {
      let jobObject = new Job(() => {}, 3, 'test_id');

      return jobObject.execute().should.be.rejected;
    });

    it('should return a promise fulfilled with the result of the job', function() {
      let jobObject = new Job(testJob, 3, 'test_id');

      return expect(jobObject.execute()).to.eventually.have.property('test');
    });
  });
});

async function testJob() {
  await new Promise(resolve => {
    setTimeout(resolve, 30)
  });
  return { test: 'ok!' }
}
