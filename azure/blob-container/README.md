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

      monk purge objectstoragecontainer/storage

This should remove Entity from Monk and the Azure Storage Account Containers resource from Azure.
