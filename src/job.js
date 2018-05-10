
/**
 * Class which will carry a job and its properties
 */
class Job {
  /**
   * @param job An async function
   * @param priority The priority of the job
   * @param jobId The id of the job
   */
  constructor(job, priority, jobId) {
    this.job = job;
    this.priority = priority;
    this.jobId = jobId;

    // When the job is executed and its result has been promised to someone,
    // we will remove it from memory
    this.executed = false;
    this.promised = false;

    this.promise = new Promise(fulfill => {
      this.fulfill = fulfill;
    });
  }

  /**
   * Return a promise that will be fulfilled with the job result when the job is complete.
   * If the job has failed, the promise will never be resolved.
   */
  getPromise() {
    this.promised = true;
    return this.promise;
  }

  /**
   * Execute the job
   * @return the job's promise
   */
  execute() {
    let result = this.job();
    this.executed = true;
    if (!(result instanceof Promise)) {
      let error = new Error("The job didn't return a Promise");
      return Promise.reject(error);
    }
    this.fulfill(result);
    return result;
  }
}

module.exports = Job;
