# Handling API failures (`monkec/resilience`)

Every API times out, rate limits, answers 5xx now and then, and sometimes
loses the response to a request it carried out. An entity step that fails is
run again later, so the question is what happens on that run: does it create
a second resource, fail forever on a 404, or crash on a garbled body?

`monkec/resilience` has small, separate helpers for the common cases. Use the
ones you need; none requires a particular client or base class.
`monk entity test --explore` (see `doc/entity-test.md`) shows which faults
an entity handles.

## How a request failed

`HttpClient` throws an `Error` named `HttpError` that says how a request
failed:

| Property | |
|---|---|
| `status` | the status the API answered with; `0` if no answer came |
| `kind` | `"status"` (an error status), `"transport"` (no answer: timeout, reset), `"malformed"` (see `expectJson`) |
| `method`, `url` | the request |
| `body`, `headers` | the response, if any |

Read them with `httpFailure(err)`, which returns them, or `undefined` for
any other error:

```ts
import { httpFailure } from "monkec/resilience";

try {
    client.get(`/things/${id}`);
} catch (e) {
    if (httpFailure(e)?.status !== 404) throw e;
}
```

The error messages are as before, so code that matches on them keeps
working; prefer the properties in new code.

Create the client with `expectJson: true` when the API always answers with
JSON. A body that isn't JSON, like a proxy's HTML error page, then throws an
`HttpError` of kind `"malformed"` instead of being returned as a string that
later code reads fields from.

```ts
this.client = new HttpClient({ baseUrl, headers, expectJson: true });
```

## Retrying

```ts
import { retry, isRetryable } from "monkec/resilience";

const data = retry(() => this.client.request(method, path, { body }).data, {
    when: (e) => isRetryable(e, method),
    what: `${method} ${path}`,
});
```

`retry` waits 1s, 2s, 4s… between attempts (options `attempts`, `delayMs`,
`maxDelayMs`), or as long as the API's `Retry-After` asks. It gives up once
the waits would pass `budgetMs` (default 2 minutes), so a step ends in good
time and the next run takes over.

`isRetryable(err, method)` decides what is safe to send again:

- 423, 429 and 503 always: the API refused the request without carrying it
  out.
- Timeouts, resets, 500, 502, 504 and garbled answers only for GET, HEAD,
  OPTIONS, PUT and DELETE: the request may have gone through, and only these
  are harmless to repeat.
- Never a `POST` that may have gone through: sending it again can create a
  second resource. Use `ensureCreated` for creates.

Pass your own `when` for API-specific cases.

## Creating without duplicates

```ts
import { ensureCreated } from "monkec/resilience";

const { resource, adopted } = ensureCreated({
    find: () => list().find((x) => x.name === this.definition.name),
    create: () => this.client.post("/things", { body }).data,
    what: `thing ${this.definition.name}`,
});
this.state.existing = adopted;
this.state.id = resource.id;
```

`ensureCreated` looks the resource up first. If it exists, it is
**adopted**: someone else's, which `delete()` should leave in place (check
`this.state.existing`). Otherwise it creates it. If the create fails in a
way that leaves unknown whether it worked (no response, 5xx, garbled
answer), it looks again a few times before giving up. A resource found then
didn't exist when the step started, so it is the entity's own.

`find` needs something the entity chose to look the resource up by: a name,
or a client token the API stores. For resources the API names itself there
is nothing to find, and a lost create response can't be told apart from no
create.

Why look again within the step: when a step throws, the state it set is not
kept, so the next run can't know the previous one already sent the create.

## Deleting

```ts
import { deleteIfExists } from "monkec/resilience";

if (!deleteIfExists(() => this.client.delete(`/things/${this.state.id}`))) {
    cli.output("already deleted");
}
```

A 404 or 410 counts as deleted: the resource was removed elsewhere, or an
earlier delete went through and its response was lost.

## Waiting for operations

When polling an operation, retry the poll requests (they are GETs), and
throw as soon as the operation reports failure. Don't wrap the whole loop in
a `try`/`catch` that keeps polling: that turns "the operation failed" into
"the operation timed out" minutes later. See `waitForOperation` in
`src/neon/neon-base.ts`.
