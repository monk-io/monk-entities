# Offline entity tests (`monk entity test`)

A package's tests live in `src/<package>/test/*.test.ts`. They define
instances of the package's entities, drive them through lifecycle steps and
actions, and check what happened. Every request the entities make is
answered by the test: by handlers, by a fake API, or by a recording of a
real one. Nothing reaches the network and no cluster is needed, so tests run
in seconds, locally and in CI.

```bash
monk entity test src/neon                 # run the package's tests
monk entity test -v src/neon              # list passing tests too
monk entity test --run lifecycle src/neon # only tests whose names match
monk entity test --explore src/neon       # rerun each test with faults injected
```

Pull requests run `monk entity check` on every package and
`monk entity test --explore` on every package with tests (see
`.github/workflows/entity-tests.yml`).

## A first test

```ts
import { test, expect, json } from "monk/test";
import { Order } from "../order.ts";

test("create places an order", (t) => {
    t.http.handle("POST https://api.shop.test/v1/orders", () => json(201, { id: "o-1", status: "pending" }));
    const o = t.entity(Order, { secret_ref: "shop-token", item: "socks" });
    o.secret("shop-token", "test-token");
    o.create();
    expect(o.state.id).toBe("o-1");
});
```

- `t.entity(Class, definition)` defines an instance, as a stack would. The
  definition is type-checked against the class's Definition and checked
  against the built schema when the first step runs. `o.state` is typed by
  the class's State.
- Steps: `o.create()`, `o.start()`, `o.stop()`, `o.update()`, `o.delete()`,
  `o.checkReadiness()`, `o.checkLiveness()`, `o.do("action", { arg: "v" })`.
  Each runs in a fresh runtime, as on a cluster; state is kept between steps,
  and a step that throws keeps the state from before it.
- `o.waitReady(attempts)` checks readiness until the instance is ready.
- A step that throws, or that makes a request nothing answers, throws from
  the test. Assert on failures with `expect(() => o.create()).toThrow(/…/)`.
- `o.output` is what the last step printed; `t.http.requests()` lists the
  requests made so far; `t.clock.elapsed` is how long entity code slept.
  Sleeping is instant.
- Secrets: `o.secret(key, value)` sets one of the instance's own;
  `t.secret(key, value)` a global one (the instance needs it in
  `permitted-secrets`). Cloud credentials: `t.provider("aws", {...})`.
- Every test starts from nothing: no instances, handlers or secrets.

## Answering requests

### Handlers

`t.http.handle(route, (req) => response)` answers requests on a route;
`t.http.use(route, (req, next) => response)` can also hand a request on to
the handlers registered before it and change what they answer. Routes are
`"METHOD scheme://host/path"`: `METHOD` may be `*`, `:name` matches one path
segment (`req.params.name`), and a final `/*` matches the rest. Handlers
added later run first.

Responses: `json(status, body)`, `text(status, body)`, `dropped("timeout" |
"reset" | "lost")` for a request that fails without a response, and
`withJson(resp, (body) => { ... })` for changing a JSON response.

### Fake APIs

A fake keeps the data an API holds, so creates, reads and deletes agree:

```ts
const shop = fakeApi("https://api.shop.test/v1", () => ({
    state: { orders: new Map<string, any>() },
    routes: {
        "POST /orders": (req) => { ... },
        "GET /orders/:id": (req) => { ... },
    },
}));

test("...", (t) => {
    const api = t.use(shop);   // a fresh copy of its data for this test
    ...
    expect(api.state.orders.size).toBe(1);
});
```

### Recordings of real APIs

A test can run against the real API once and replay it from then on:

```ts
test("a branch goes through its lifecycle", (t) => {
    t.recorded("https://console.neon.tech/api/v2");
    const b = t.entity(Branch, { secret_ref: "neon-api-key", project_id: t.env("NEON_PROJECT_ID", "proj-test"), name: "test-branch" });
    b.secret("neon-api-key", t.env("NEON_API_KEY", "test-key", { secret: true }));
    b.create();
    b.waitReady(20);
    b.delete();
});
```

```bash
NEON_API_KEY=... NEON_PROJECT_ID=... monk entity test --record src/neon
```

- `--record` sends the test's requests to the real API and, if the test
  passes, writes what the API answered to
  `test/recordings/<file>/<test>.json`. `--live` does the same without
  writing anything. Plain runs answer from the recording.
- Only APIs named with `t.recorded` go live; tests that only use handlers or
  fakes run as usual.
- Live tests create real resources. Whatever a live test leaves behind,
  passed or failed, is deleted at the end; anything that can't be is
  reported by name.
- `t.env(name, fallback)` reads a value from the environment on live runs
  (it must be set), and the recorded value or `fallback` otherwise. With
  `{ secret: true }` the value is never written to the recording, and
  replays get `fallback`. Call `t.recorded` before `t.env`.
- Recordings drop request headers and keep only the response headers entity
  code reads. Secrets the test used, fields named like secrets (passwords,
  tokens, keys, connection strings) and fields about people (creators,
  emails, pictures) are replaced with placeholders. Still read a recording
  before committing it.
- `t.live` tells whether the test reaches a real API; assertions about
  values a recording or fake holds belong in `if (!t.live)`.

**One recording, many tests.** `t.recorded(base, { from: "<test name>" })`
replays another test's recording from the same file. Handlers added after it
change what it answers, so failure cases are a few lines each:

```ts
test("a failed operation says so", (t) => {
    t.recorded(API, { from: "a branch goes through its lifecycle" });
    t.http.use(`GET ${API}/projects/:p/operations/:id`, (req, next) =>
        withJson(next(), (b) => { b.operation.status = "failed"; }));
    ...
    expect(() => b.start()).toThrow(/failed/);
});
```

Tests that replay another's always replay, live runs included.

**Recordings don't hold state.** A recording knows what the API answered,
not what it stores: a resource created by a request whose response was lost
appears in no recorded listing. Where a test depends on that, add a small
handler that remembers what creates made and adds it to later listings (see
`rememberCreated` in `src/neon/test/branch.test.ts`).

## Faults

A test can make requests fail:

```ts
t.fault("POST https://api.shop.test/v1/orders", 503, { times: 2 });
api.fault("GET /orders/:id", "timeout", { after: 1 });   // on a fake or recording, relative to its base
```

Kinds: an HTTP status, `"timeout"` (the request never reaches the API),
`"reset"` (the connection drops), `"lost"` (the API carries the request out,
but its response never arrives) and `"malformed"` (the API answers with a
body that isn't what it should be). Options: `times`, `after`, `when(req)`,
`body`, `headers`.

### Exploration

`monk entity test --explore` reruns each test again and again, with one
fault injected into one of the requests its normal run made: 500, 503, 429,
timeout, reset, lost and malformed (401 with `--faults`). A step a fault
fails is run again, as the next reconcile would. Each case ends as one of:

| Outcome | Meaning |
|---|---|
| recovered | the step succeeded despite the fault |
| converged | the step failed cleanly; its re-run succeeded |
| unreached | the run never made that request |
| differs | the test's own assertions failed |
| crash | the step failed with a programming error (e.g. a `TypeError` from reading a failed response) |
| stuck | the step's re-run failed too |
| duplicate | the API was changed more often than on the normal run (a create repeated after a lost response) |
| runaway | a step made too many requests, or slept too long |
| leak | a secret appeared in output or an error |

The last six fail the test, unless `test/faults.snap` accepts them. Write the
snapshot with `--explore --update` and commit it; any later change of
outcome fails until it is accepted again. `--case <request>:<fault>` reruns
one case and prints what the entity did.

Assertions about exactly what happened (requests made, time slept, output)
hold on the normal run only; guard them with `if (!t.exploring)`. Use
`o.waitReady()` instead of counting readiness checks. A test that pins down
one failure itself can opt out with `test(name, fn, { explore: false })`.

For handling failures in entity code, see `doc/resilience.md`.

## End-to-end tests (`--e2e`)

Offline tests check an entity's logic. End-to-end tests check that a real
setup works on a real Monk cluster: several entities wired together and an
app that uses what they made. They live in `src/<package>/test/*.e2e.ts`,
with the monk YAML they run next to them (e.g. `test/e2e/*.yaml`).

```bash
NEON_API_KEY=... NEON_PROJECT_ID=... monk entity test --e2e src/neon
monk entity test --e2e --socket tcp://host:2137 src/neon   # another cluster
monk entity test --e2e --keep src/neon                     # leave a failed run in place
```

The package is built and loaded on the cluster, with the packages it imports
(`--dist` loads the repository's `dist/` instead, for clusters that run the
bundled build). Each test then drives the cluster as the monk CLI does:

```ts
import { e2e, expect } from "monk/e2e";
import { Branch } from "../branch.ts";

e2e("a branch serves an app that connects to it", (c) => {
    c.secret("neon-api-key", c.env("NEON_API_KEY", { secret: true }));
    c.load("e2e/branch-app.yaml", { vars: { project_id: c.env("NEON_PROJECT_ID") } });
    c.run("neon-e2e/stack");
    c.waitReady("neon-e2e/stack", { timeout: 900 });
    expect(c.entity(Branch, "neon-e2e/branch").ready).toBe(true);
    c.waitLogs("neon-e2e/probe", "db-ok", { timeout: 600 });
    c.do("neon-e2e/branch", "get-branch-details");
});
```

- `c.load(file, { vars })` loads monk YAML relative to the test, filling in
  `{{ name }}` placeholders; `{{ id }}` is the run's own suffix, for names
  outside Monk (a branch name) that runs must not share.
- Each run gives the namespaces it loads a suffix (`neon-e2e-3f9a1c`) so runs
  don't collide; tests keep using the names the YAML has.
- `c.run`, `c.update`, `c.do`, `c.describe`, `c.logs` and `c.delete` do what
  `monk run`, `update`, `do`, `describe`, `logs` and `delete --force` do.
  `c.run` waits until what it ran is ready, unless `{ wait: false }`.
- `c.entity(Class, path)` is a running entity with its state typed by its
  class; `c.waitReady` and `c.waitLogs` poll until a condition holds.
- `c.env(name)` reads the environment (it must be set unless given a
  `fallback`); `{ secret: true }` keeps the value out of what is printed.
- When a test ends, passed or failed, whatever it ran is deleted (entities
  delete what they made), and the secrets it set and templates it loaded are
  removed. `--keep` leaves a failed run in place to look into.

End-to-end tests create real resources and take minutes; they don't run on
pull requests.
