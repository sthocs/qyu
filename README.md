# Qyu - In-memory rate-limited queue library

This library will permit you to execute jobs by priority, at a limited rate.

## Install

Copy this project into the lib dir of your project, and require it:
```js
  const qyu = require('lib/qyu/app');
```

## Quick Start
### Initialize the queue

```js
  const q = qyu({
    rateLimit: 10, // maximum number of jobs being processed at the same time. Default 50
    statsInterval: 500 // When stat event is sent, in ms. Default: 1000ms
  });
```

### Push jobs
A job must be an async function.

```js
  const id = q.push(
    job,
    3 // optional priority, from 1 to 10, 1 being the highest priority - default: 5
  );

  async function job() {
    await new Promise(resolve => setTimeout(resolve, 300));
    return {Hello: 'world!'}
  }
```

### Start, pause, wait...

```js
  await q.pause(); // returns a promise resolved when `q` has paused (no jobs being processed)
  await q.start(); // returns a promise resolved when `q` has started (first time) or unpaused

  const res = await q.wait(id); // resolves when the job is complete with the job result
```

### Events
You can register to some events of the queue:
```js
  q.on('done', (id, result) => {
    console.log(`Job ${id} done. Result: ${JSON.stringify(result)}`);
  });
```

Available events:
- `'done'`: emitted when a job is done
  - `id`: the id of the finished job
  - `result`: the result of the finished job
- `'error'`: emitted when a job produces an error
  - `id`: the id of the job that failed
  - `error`: the error thrown
- `'drain'`: emitted when the queue becomes empty
- `'stats'`: emitted each `statsInterval`ms (defined when instantiating the queue)
  - `nbJobsPerSecond`: the number of jobs processed each second

## See it in action

```
  node example/example.js
```
