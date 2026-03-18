#!/usr/bin/env node

const autocannon = require('autocannon');

const scenarioName = (process.argv[2] || process.env.LOAD_TEST_SCENARIO || 'health').toLowerCase();
const baseUrl = (process.env.LOAD_TEST_URL || 'http://localhost:3000').replace(/\/$/, '');
const connections = toNumber(process.env.LOAD_TEST_CONNECTIONS, 20);
const duration = toNumber(process.env.LOAD_TEST_DURATION, 20);
const pipelining = toNumber(process.env.LOAD_TEST_PIPELINING, 1);

const scenarios = {
  health: {
    title: 'Health check sem throttle',
    method: 'GET',
    path: '/health',
  },
  login: {
    title: 'Login para validar throughput e 429',
    method: 'POST',
    path: '/auth/login',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: process.env.LOAD_TEST_LOGIN_EMAIL || 'load-test@example.com',
      password: process.env.LOAD_TEST_LOGIN_PASSWORD || 'invalid-password',
    }),
  },
  auth: {
    title: 'Endpoint autenticado de listagem',
    method: 'GET',
    path: process.env.LOAD_TEST_AUTH_PATH || '/bills?page=1&limit=10',
    headers: process.env.LOAD_TEST_BEARER_TOKEN
      ? {
          authorization: formatBearer(process.env.LOAD_TEST_BEARER_TOKEN),
        }
      : undefined,
    validate() {
      if (!process.env.LOAD_TEST_BEARER_TOKEN) {
        throw new Error('Defina LOAD_TEST_BEARER_TOKEN para o cenário auth.');
      }
    },
  },
};

async function main() {
  const scenario = scenarios[scenarioName];

  if (!scenario) {
    throw new Error(`Cenário inválido: ${scenarioName}. Use health, login ou auth.`);
  }

  if (typeof scenario.validate === 'function') {
    scenario.validate();
  }

  const options = {
    url: `${baseUrl}${scenario.path}`,
    method: scenario.method,
    connections,
    duration,
    pipelining,
    headers: scenario.headers,
    body: scenario.body,
  };

  console.log(`Scenario: ${scenarioName} (${scenario.title})`);
  console.log(`Target: ${options.url}`);
  console.log(`Connections: ${connections}`);
  console.log(`Duration: ${duration}s`);
  console.log(`Pipelining: ${pipelining}`);

  const result = await runAutocannon(options);

  const statusCodes = Object.entries(result.statusCodeStats || {})
    .map(([statusCode, stats]) => `${statusCode}=${stats.count}`)
    .join(', ');

  console.log('');
  console.log('Summary');
  console.log(`Requests: ${result.requests.total}`);
  console.log(`Errors: ${result.errors}`);
  console.log(`Timeouts: ${result.timeouts}`);
  console.log(`2xx: ${result['2xx'] || 0}`);
  console.log(`4xx: ${result['4xx'] || 0}`);
  console.log(`5xx: ${result['5xx'] || 0}`);
  console.log(`Latency p95: ${Math.round(result.latency.p95)} ms`);
  console.log(`Latency p99: ${Math.round(result.latency.p99)} ms`);
  console.log(`Req/sec avg: ${Math.round(result.requests.average)}`);
  console.log(`Throughput avg: ${Math.round(result.throughput.average / 1024)} KB/s`);
  console.log(`Status codes: ${statusCodes || 'n/a'}`);

  if ((result['4xx'] || 0) > 0 || (result['5xx'] || 0) > 0) {
    process.exitCode = 1;
  }
}

function runAutocannon(options) {
  return new Promise((resolve, reject) => {
    const instance = autocannon(options, (error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });

    autocannon.track(instance, {
      renderProgressBar: true,
      renderLatencyTable: true,
      renderResultsTable: true,
    });
  });
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatBearer(token) {
  return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
