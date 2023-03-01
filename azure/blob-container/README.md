# Azure Storage Account Container

Entity to manage Azure Storage Account Container.
It will allow us to create new Azure Storage Account Containers using Monk.

## Usage

We'll use Monk CLI to load and run everything:

      # load templates
      monk load MANIFEST
      
      # run to trigger a "create" event
      mmonk run objectstoragecontainer/storage

An Azure Storage Account Container in Azure,
available at:  
https://monkazurestorageaccount.blob.core.windows.net/defautlcontainer

When we don't need this Bucket anymore,
we can delete it with `monk delete`:

      monk delete objectstoragecontainer/storage

This should remove Entity from Monk and the Azure Storage Account Containers resource from Azure.


Below is the sample body named `containerObject` to create Storage Account and it can be extend with [Azure Storage Account Blob Container REST API reference](https://learn.microsoft.com/en-us/rest/api/storagerp/blob-containers/create?tabs=HTTP)

```json
   {
     "properties": {
       "defaultEncryptionScope": "encryptionscope185",
       "denyEncryptionScopeOverride": true,
       "publicAccess": "Container"
     }
   }
```

When we don't need this event hub namespace anymore,
we can delete it with `monk delete`:

      monk delete objectstoragecontainer/storage

This should remove Entity from Monk and the Azure Storage Account blob container resource from Azure.

