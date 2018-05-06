const crypto = require('crypto');
const EventEmitter = require('events');
const Job = require('./src/job');


function qyu(config) {
  config = config || {};
  return new Qyu(config.rateLimit, config.statsInterval);
}

module.exports = qyu;

class Qyu {
  constructor(rateLimit, statsInterval) {
    this.rateLimit = rateLimit || (isNaN(rateLimit) ? 50 : rateLimit);
    this.statsInterval = statsInterval || (isNaN(statsInterval) ? 1000 : statsInterval);

    this.isRunning = false;
    this.nbJobsRunning = 0;
    this.nbJobsProcessedSinceLastCheck = 0;
    this.eventEmitter = new EventEmitter();

    // General map containing all jobs by their ids
    // Jobs will be removed from memory when they are executed and someone is waiting
    // for the result (by calling wait(jobId))
    this.jobs = {};

    // Create ten queues, to queue jobs by their priority
    this.jobsQueues = {};
    for (let i = 1; i <= 10; ++i) {
      this.jobsQueues[i] = [];
    }
  }

  /**
   * Register a listener for the passed event.
   * Available events are:
   *   - 'done': emitted each time a job is finished, with the following
   *             parameters: (jobId, jobResult)
   *   - 'error': emitted each time a job returns an error, with the
   *              following parameters: (jobId, jobResult)
   *   - 'drain': emitted each time the queue has processed all jobs
   *   - 'stats': after the queue is started, will emit at a fixed interval the
   *              number of jobs processed each second. The interval is set
   *              when the queue is instantiated.
   *
   * @param eventName
   * @param callback
   */
  on(eventName, callback) {
    this.eventEmitter.on(eventName, callback);
  }

  /**
   * Push a job in the queue
   *
   * @param job a job to execute. It must be an async function
   * @param priority optional priority, from 1 to 10, 1 being the highest priority.
   *                 If missing or invalid, the priority will be set to 5
   */
  push(job, priority) {
    if (!priority || priority < 1 || priority > 10) {
      priority = 5;
    }
    let id = crypto.randomBytes(16).toString("hex");
    let queuedJob = new Job(job, priority, id);
    this.jobsQueues[priority].push(id);
    this.jobs[id] = queuedJob;
    if (this.isRunning) {
      this._processNextJobs();
    }
    return id;
  }

  /**
   * Pause jobs processing
   *
   * @return a Promise which will be resolved when all jobs currently running are done.
   */
  pause() {
    this.isRunning = false;
    return new Promise(resolve => {
      this.deferredPause = resolve;
    });
  }

  /**
   * Start jobs processing
   *
   * @return a Promise which will be resolved when the first job has actually been started.
   */
  start() {
    this.isRunning = true;
    let res = new Promise(resolve => {
      this.deferredStart = resolve;
    });
    this._startStatsEmitter();
    this._processNextJobs();
    return res;
  }

  /**
   * Wait for a specific job to be completed
   *
   * @param jobId the id of the job to wait for
   * @return a Promise which will be resolved with the result of the job
   */
  wait(jobId) {
    let job = this.jobs[jobId];
    if (job.executed) {
      delete this.jobs[jobId];
    }
    return job ? job.getPromise() : undefined;
  }

  _processNextJobs() {
    while (this.isRunning && this.nbJobsRunning < this.rateLimit) {
      let i = 1;
      for (i; i <= 10; ++i) {
        let nextJobId = this.jobsQueues[i].shift();
        if (nextJobId) {
          ++this.nbJobsRunning;
          ++this.nbJobsProcessedSinceLastCheck;
          let nextJob = this.jobs[nextJobId];
          nextJob.execute().then(res => {
            this.eventEmitter.emit('done', nextJobId, res);
            this._handleJobFinished(nextJob);
          })
          .catch(err => {
            this.eventEmitter.emit('error', nextJobId, err);
            this._handleJobFinished(nextJob);
          });
          if (this.deferredStart) {
            // First job has been started, fulfill the promise
            this.deferredStart();
            this.deferredStart = undefined;
          }
          break;
        }
      }
      if (i == 11) { // All queues are empty, no more jobs
        if (this.nbJobsRunning == 0) {
          this.eventEmitter.emit('drain');
        }
        // Quit the loop, the method will be called again when existing jobs
        // are finished or when new jobs are added.
        break;
      }
    }
  }

  _handleJobFinished(job) {
    --this.nbJobsRunning;
    if (job.promised) {
      // The job is executed and the result has been promised, we can remove it from memory
      delete this.jobs[job.jobId];
    }
    if (this.isRunning) {
      this._processNextJobs();
    }
    else if (this.nbJobsRunning == 0) {
      // The qyu is paused and all jobs have now finished
      this._stopStatsEmitter();
      this.deferredPause();
    }
  }

  _startStatsEmitter() {
    this.statsEmitter = setInterval(() => {
      let jobsPerSecond = this.nbJobsProcessedSinceLastCheck * 1000 / this.statsInterval;
      this.eventEmitter.emit('stats', jobsPerSecond);
      this.nbJobsProcessedSinceLastCheck = 0;
    }, this.statsInterval);
  }

  _stopStatsEmitter() {
    clearInterval(this.statsEmitter);
  }
}
