# Basic Webhook

Example of using webhooks for Monk Entity.

If your logic needs a lot of dependencies, or you don't want to write JavaScript code, you can register webhook url of
your own service. In this case, Monk will send request for each lifecycle event and will expect a response with updated
Entity state.

     lifecycle:
       sync:
         url: "https://your-webhook-address.com/path-to-url"

Request is JSON with **definition**, **state**, **context**, the same properties as _main_ function in JS code. Response
can contain **state** object and **output** (list of strings) that will be printed to console.

Example of Entity type and webhook server runnable in webhook.yaml:

Lad and run an Entity like the one below to trigger webhook requst:

```yaml 
beep:
  defines: entity-demo/foo
  first-url: https://wikipedia.com
  second-url: https://example.com
```

Webhooks don't stop you from using inlined JavaScript: an Entity can define JS script for some action,
and for that lifecycle it will be called instead of webhook url.

```yaml
  lifecycle:
    create: |
      function main() {
        let res = http.get("https://api.ipify.org");
        if (res.error) {
          throw res.error;
        }
        return {"ip": res.body};
      }
    sync:
      url: "https://your-webhook-address.com/path-to-url"
```

If you want to define custom action for the Entity with webhook logic,
you can do it by assigning empty string to your action name:

     lifecycle:
       do-something: ""
       sync:
         url: "https://your-webhook-address.com/path-to-url"

Call it like this to send a request to webhook server with custom arguments:

      monk do guides/beep/do-something your-arg=value

Webhook server example written in Go can be found in server.go file.
