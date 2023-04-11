# Service Usage

Service usage defines API to enable/disable other APIs on GCP.

See https://cloud.google.com/service-usage/docs/reference/rest

It can take 1-2 minutes to enable unused service.

With serviceusage entity we could do it automatically, another entity that uses specific apis could depend on it being
enabled.

Example:

```yaml
namespace: gcp

enable-firebasedatabase:
  defines: gcp/serviceusage
  name: firebasedatabase.googleapis.com
  project: <- `${project}`

enable-firebasehosting:
  defines: gcp/serviceusage
  name: firebasedatabase.googleapis.com
  project: <- `${project}`

db:
  depends:
    wait-for:
      runnables:
        - gcp/enable-firebasedatabase
      timeout: 150
  defines: gcp/firebase-db-instance
  location: us-central1
  name: <- `${database}`
  project: <- `${project}`
  rules: <<< database.rules.json

website:
  depends:
    wait-for:
      runnables:
        - gcp/enable-firebasehosting
      timeout: 150
  defines: gcp/firebase-site
  name: <- `${website}`
  project: <- `${project}`
```
