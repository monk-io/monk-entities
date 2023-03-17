# Service Usage

Service usage defines API to enable/disable other APIs on GCP.

See https://cloud.google.com/service-usage/docs/reference/rest

It can take 1-2 minutes to enable unused service.

With serviceusage entity we could do it automatically, another entity that uses specific apis could depend on it being
enabled.

Example:

```yaml
namespace: poc

enable-firebasedatabase:
  defines: poc/serviceusage
  name: firebasedatabase.googleapis.com
  project: <- `${project}`

enable-firebasehosting:
  defines: poc/serviceusage
  name: firebasedatabase.googleapis.com
  project: <- `${project}`

db:
  depends:
    wait-for:
      runnables:
        - poc/enable-firebasedatabase
      timeout: 150
  defines: poc/firebase-db-instance
  location: us-central1
  name: <- `${database}`
  project: <- `${project}`
  rules: <<< database.rules.json

website:
  depends:
    wait-for:
      runnables:
        - poc/enable-firebasehosting
      timeout: 150
  defines: poc/firebase-site
  name: <- `${website}`
  project: <- `${project}`
```
