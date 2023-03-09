# Azure Storage Account

Entity to manage Azure Storage Account.
It will allow us to create new Azure Storage Account using Monk.

## Usage

We'll use Monk CLI to load and run everything:

      # load templates
      monk load MANIFEST
      
      # run to trigger a "create" event
      monk run objectstorage/storage

Below is the sample body named `storageAccountObject` to create Storage Account and it can be extend with [Azure Storage Account REST API reference](https://learn.microsoft.com/en-us/rest/api/storagerp/storage-accounts/create?tabs=HTTP)

```json
   {
     "sku": {
       "name": "Standard_GRS"
     },
     "kind": "Storage",
     "location": "eastus",
     "properties": {
       "keyPolicy": {
         "keyExpirationPeriodInDays": 20
       },
       "sasPolicy": {
         "sasExpirationPeriod": "1.15:59:59",
         "expirationAction": "Log"
       },
       "allowBlobPublicAccess": true,
       "publicNetworkAccess": "Enabled",
       "defaultToOAuthAuthentication": false,
       "allowSharedKeyAccess": true,
       "encryption": {
         "services": {
           "file": {
             "keyType": "Account",
             "enabled": true
           },
           "blob": {
             "keyType": "Account",
             "enabled": true
           }
         },
         "requireInfrastructureEncryption": false,
         "keySource": "Microsoft.Storage"
       }
     },
     "tags": {
       "key1": "value1",
       "key2": "value2"
     }
   }
```

In order to see endpoint url of the Storage Account execute below commands;

      # run getPrimaryEndpoint lifecycle in entity
      monk do  objectstorage/storage/getPrimaryEndpoint
      # run monk describe command to see whole state of the entity
      monk describe objectstorage/storage
    

When we don't need this event hub namespace anymore,
we can delete it with `monk delete`:

      monk delete objectstorage/storage

This should remove Entity from Monk and the Azure Event Storage Account resource from Azure.
