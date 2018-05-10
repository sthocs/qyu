const qyu = require('../app');

const q = qyu({
  rateLimit: 5, // maximum number of jobs being processed at the same time
  statsInterval: 500 // When stat event is sent, in ms
});

var jobsDone = 0;

q.on('done', ( id, result ) => {
  ++jobsDone;
  console.log(`Job ${id} done. Result: ${JSON.stringify(result)}`);
});

q.on('error', ( id, error ) => {
  console.log(`Job ${id} threw an error: ${error.message}`);
});

q.on('drain', () => {
  console.log('No more jobs to do');
});

q.on('stats', ( nbJobsPerSecond ) => {
  console.log(`${nbJobsPerSecond} jobs/s processed`)
});

(async () => {
  const jobs = [];

  for (let i = 0; i < 5; ++i) {
    for (let j = 1; j <= 10; ++j) {
      const id = q.push(
        generateJob(`Job ${jobs.length + 1} ; priority ${j}`), // function to execute
        j,   // optional priority, from 1 to 10, 1 being the highest priority - default: 5
      ); // returns the internal id
      jobs.push(id);
    }
  }
  console.log(`${jobs.length} jobs pushed`);

  q.start().then(() => console.log('Queue started'));

  setTimeout(() => {
    console.log('\nPushing 2 more jobs\n')
    let id = q.push(generateJob('Let me pass first'), 1); // highest priority
    let lastJobId = q.push(generateJob('I cover your back'), 10); // lowest priority
    q.wait(id).then(res => console.log('Job executed: ' + res))
    q.wait(lastJobId).then(res => {
      console.log('Last job executed: ' + res);
      setTimeout(() => {
        // Wait for all jobs to terminate in case they take more time than the last one
        console.log('Total jobs executed: ' + jobsDone);
      }, 1500);
      q.pause();
    });
  }, 3000);

  await wait(4000);
  console.log('\npausing...\n')
  q.pause().then(() => console.log('\npaused'));
  await wait(5000);
  console.log('restarting!')
  q.start().then(() => console.log('restarted\n'));
})();


// Generate a job that will run for 500-1500ms and will return the passed result
function generateJob(result) {
  return async function job() {
    await wait(Math.floor((Math.random() * 1000) + 500));
    return result ? result : { Hello: 'world!' };
  }
}

function wait(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  });
}
