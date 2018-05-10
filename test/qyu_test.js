const qyu = require('../app');
const Job = require('../src/job');

const chai = require('chai').should();
const assert = require('assert');
const sinon = require('sinon');

describe('Qyu', function() {
  describe('#constructor', function() {
    it('should set default config values', function() {
      const q = qyu();

      assert.equal(q.rateLimit, 50);
      assert.equal(q.statsInterval, 1000);
      assert.equal(q.isRunning, false);
      assert.equal(q.nbJobsRunning, 0);
      assert.equal(q.nbJobsProcessedSinceLastCheck, 0)
    });

    it('should set passed config values', function() {
      const q = qyu({ rateLimit: 20, statsInterval: 300 });

      assert.equal(q.rateLimit, 20);
      assert.equal(q.statsInterval, 300);
    });
  });

  describe('#on', function() {
    it('should add an event on the internal emitter', function(done) {
      const q = qyu();
      q.on('test', () => {
        done();
      });
      q.eventEmitter.emit('test');
    });
  });

  describe('#push', function() {
    it('should fill internal queue correctly', function() {
      const q = qyu();
      let job1 = createTestJob();
      let job2 = createTestJob();
      let job3 = createTestJob();
      let job4 = createTestJob();
      let job5 = createTestJob();
      let job6 = createTestJob();
      let job7 = createTestJob();
      let jobId1 = q.push(job1, 3);
      let jobId2 = q.push(job2, 6);
      let jobId3 = q.push(job3, 2);
      let jobId4 = q.push(job4, 3);
      let jobId5 = q.push(job5);
      let jobId6 = q.push(job6, 14);
      let jobId7 = q.push(job7, 'hey');

      assert.equal(q.jobsQueues[2][0], jobId3);
      assert.equal(q.jobsQueues[3][0], jobId1);
      assert.equal(q.jobsQueues[3][1], jobId4);
      assert.equal(q.jobsQueues[6][0], jobId2);
      assert.equal(q.jobsQueues[5][0], jobId5);
      assert.equal(q.jobsQueues[5][1], jobId6);
      assert.equal(q.jobsQueues[5][2], jobId7);
      assert.equal(q.jobs[jobId1].job, job1);
      assert.equal(q.jobs[jobId2].job, job2);
      assert.equal(q.jobs[jobId3].job, job3);
      assert.equal(q.jobs[jobId4].job, job4);
      assert.equal(q.jobs[jobId5].job, job5);
      assert.equal(q.jobs[jobId6].job, job6);
      assert.equal(q.jobs[jobId7].job, job7);
    });
  });

  describe('#pause', function() {
    it('should stop the queue', function() {
      const q = qyu();
      let stopStatsEmitter = sinon.fake();
      q._stopStatsEmitter = stopStatsEmitter;

      // first case: jobs still isRunning
      q.isRunning = true;
      q.nbJobsRunning = 2;
      q.pause();

      assert(q.isRunning == false);
      assert(q._deferredPause); // Promised pause is ready to be resolved
      stopStatsEmitter.called.should.be.false; // will stop after all jobs are done

      // second case: no jobs in queue
      q.isRunning = true;
      q.nbJobsRunning = 0;
      q.pause();

      assert(q.isRunning == false);
      stopStatsEmitter.called.should.be.true;
    });
  });

  describe('#start', function() {
    it('should call what is needed', function() {
      const q = qyu();
      let startStatsEmitter = sinon.fake();
      let processNextJobs = sinon.fake();
      q._startStatsEmitter = startStatsEmitter;
      q._processNextJobs = processNextJobs;

      q.start();

      assert.ok(q.isRunning);
      startStatsEmitter.called.should.be.true;
      processNextJobs.called.should.be.true;
    });
  });

  describe('#wait', function() {
    it('should return the job promise', function() {
      const q = qyu();
      let job = new Job();
      job.getPromise = sinon.fake.returns('I promise');
      q.jobs['test_id'] = job;

      var promise = q.wait('test_id');

      assert.equal(promise, 'I promise');
      assert(q.jobs['test_id']); // job wasn't deleted because it's not executed yet
    });

    it('should delete the job if it is already executed', function() {
      const q = qyu();
      let job = new Job();
      job.executed = true;
      q.jobs['test_id'] = job;

      q.wait('test_id');

      assert(q.jobs['test_id'] == undefined);
    });
  });

  describe('#_processNextJobs', function() {
    it('should not execute any job if queue is not started', function() {
      const q = qyu();

      q._processNextJobs();
      q.nbJobsRunning.should.equal(0);
    });

    it('should execute next job and resolve the promise', function() {
      const q = qyu();

      let nextJob = new Job();
      let promiseResolverFake = sinon.fake();
      let executeJobFake = sinon.fake();

      q.isRunning = true;
      q._getNextJob = sinon.stub().onFirstCall().returns(nextJob);
      q._deferredStart = promiseResolverFake;
      q._executeJob = executeJobFake;

      q._processNextJobs();

      q.nbJobsRunning.should.equal(1);
      executeJobFake.calledWith(nextJob).should.be.true;
      promiseResolverFake.called.should.be.true;
      assert.equal(q._deferredStart, undefined);
    });

    it('should emit the drain event', function() {
      const q = qyu();
      q.isRunning = true;

      let spy = sinon.spy();
      q.eventEmitter.on('drain', spy);

      q._processNextJobs();

      spy.called.should.be.true;
    });

    it('should start {rateLimit} jobs max in parallel', function() {
      const q = qyu({ rateLimit: 5 });

      let nextJob = new Job();
      let executeJobFake = sinon.fake();

      q.isRunning = true;
      q._getNextJob = sinon.fake.returns(nextJob);
      q._executeJob = executeJobFake;

      q._processNextJobs();

      // _processNextJobs loop exited at 5. It will restart once a job is finished
      q.nbJobsRunning.should.equal(5);
      executeJobFake.callCount.should.equal(5);
    });
  });

  describe('#_getNextJob', function() {
    it('should return jobs ordered by priority', function() {
      const q = qyu();
      let jobId1 = q.push(createTestJob(), 3);
      let jobId2 = q.push(createTestJob(), 3);
      let jobId3 = q.push(createTestJob());
      let jobId4 = q.push(createTestJob(), 10);
      let jobId5 = q.push(createTestJob(), 12); // out of range, priority will be 5
      let jobId6 = q.push(createTestJob(), 1);
      let jobId7 = q.push(createTestJob());
      let jobId8 = q.push(createTestJob(), 6);
      let jobId9 = q.push(createTestJob(), 'nan'); // NaN, priority will be 5

      assert.equal(q._getNextJob().jobId, jobId6);
      assert.equal(q._getNextJob().jobId, jobId1);
      assert.equal(q._getNextJob().jobId, jobId2);
      assert.equal(q._getNextJob().jobId, jobId3);
      assert.equal(q._getNextJob().jobId, jobId5);
      assert.equal(q._getNextJob().jobId, jobId7);
      assert.equal(q._getNextJob().jobId, jobId9);
      assert.equal(q._getNextJob().jobId, jobId8);
      assert.equal(q._getNextJob().jobId, jobId4);
      assert.equal(q._getNextJob(), undefined);
    });
  });

  describe('#_executeJob', function() {
    it('should emit \'done\' and call _handleJobFinished() after job is done', function(done) {
      const q = qyu();

      let job = new Job(createTestJob(), 5, 'test_id');
      job.execute = sinon.fake.resolves('test passed!');
      let spy = sinon.spy();
      let handleJobFinishedFake = sinon.fake();

      q.eventEmitter.on('done', spy);
      q._handleJobFinished = handleJobFinishedFake;

      q._executeJob(job).then(() => {
        spy.called.should.be.true;
        spy.calledWith('test_id', 'test passed!').should.be.true;
        handleJobFinishedFake.called.should.be.true;
        done();
      });
    });

    it('should emit \'error\' and call _handleJobFinished() when job has failed', function(done) {
      const q = qyu();

      let job = new Job(createTestJob(), 5, 'test_id');
      job.execute = sinon.fake.rejects('test passed!');
      let spy = sinon.spy();
      let handleJobFinishedFake = sinon.fake();

      q.eventEmitter.on('error', spy);
      q._handleJobFinished = handleJobFinishedFake;

      q._executeJob(job).then(() => {
        spy.called.should.be.true;
        assert.equal(spy.firstCall.args[0], 'test_id');
        assert.equal(spy.firstCall.args[1].message, 'test passed!');
        handleJobFinishedFake.called.should.be.true;
        done();
      });
    });
  });

  describe('#_handleJobFinished', function() {
    it('should decrease nb jobs running and increase stats', function() {
      const q = qyu();
      q.nbJobsRunning = 3;
      q.nbJobsProcessedSinceLastCheck = 4;

      q._handleJobFinished(new Job());

      assert.equal(q.nbJobsRunning, 2);
      assert.equal(q.nbJobsProcessedSinceLastCheck, 5);
    });

    it('should delete job if it has been promised', function() {
      const q = qyu();
      q.nbJobsRunning = 3;
      var id = q.push(createTestJob());

      q._handleJobFinished(q.jobs[id]);
      assert(q.jobs[id]); // Job has not been promised, it's kept in memory

      q.jobs[id].promised = true; // This will happen when we call qyu.wait()
      q._handleJobFinished(q.jobs[id]);
      assert(q.jobs[id] == undefined);
    });

    it('should try to process next job when queue is running', function() {
      const q = qyu();
      let processNextJobsFake = sinon.fake();
      q._processNextJobs = processNextJobsFake;

      q._handleJobFinished(new Job());
      processNextJobsFake.called.should.be.false;

      q.isRunning = true;
      q._handleJobFinished(new Job());
      processNextJobsFake.called.should.be.true;
    });

    it('should stop the stats emitter when last job is finished and queue is not running', function() {
      const q = qyu();

      let stopStatsEmitterFake = sinon.fake();
      q._stopStatsEmitter = stopStatsEmitterFake;

      q.isRunning = true;
      q.nbJobsRunning = 1;
      q._handleJobFinished(new Job());
      stopStatsEmitterFake.called.should.be.false;

      q.isRunning = false;
      q.nbJobsRunning = 1;
      q._handleJobFinished(new Job());
      stopStatsEmitterFake.called.should.be.true;
    });
  });

  describe('#_emitStats', function() {
    it('should emit the correct stats and reset the counter', function() {
      const q = qyu();
      q.statsInterval = 2500;
      q.nbJobsProcessedSinceLastCheck = 5;

      let spy = sinon.spy();
      q.eventEmitter.on('stats', spy);

      q._emitStats();

      assert.equal(spy.firstCall.args[0], 2);
      assert.equal(q.nbJobsProcessedSinceLastCheck, 0);
    });
  });

  describe('#_stopStatsEmitter', function() {
    it('should emit stats a last time and resolve the promised pause', function() {
      const q = qyu();
      let emitStatsFake = sinon.fake();
      let deferredPauseFake = sinon.fake();
      q._emitStats = emitStatsFake;
      q._deferredPause = deferredPauseFake;

      q._stopStatsEmitter();

      emitStatsFake.called.should.be.true;
      deferredPauseFake.called.should.be.true;
    });
  });
});


function createTestJob() {
  return async function testJob() {
    await new Promise(resolve => {
      setTimeout(resolve, 30)
    });
    return { Hello: 'tests!' }
  }
}
