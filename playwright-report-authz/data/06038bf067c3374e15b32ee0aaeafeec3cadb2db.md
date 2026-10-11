# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: matrix.spec.ts >> Authorization matrix >> GET /auth/status is open to everyone — as anonymous → 200
- Location: e2e\authz\matrix.spec.ts:418:11

# Error details

```
AggregateError: apiRequestContext.call: connect ECONNREFUSED ::1:5134
connect ECONNREFUSED 127.0.0.1:5134
Call log:
  - → GET http://localhost:5134/api/auth/status
    - user-agent: Playwright/1.63.0 (x64; windows 10.0) node/24.18
    - accept: */*
    - accept-encoding: gzip,deflate,br

```