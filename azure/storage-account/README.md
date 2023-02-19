# Azure Storage Account

Entity to manage Azure Storage Account.
It will allow us to create new Azure Storage Accounts using Monk.

## Usage

We'll use Monk CLI to load and run everything:

      # load templates
      monk load MANIFEST
      
      # run to trigger a "create" event
      monk run objectstorage/storage

An Azure Storage Account in Azure,
available at:  
https://monkazurestorageaccount.blob.core.windows.net

When we don't need this Bucket anymore,
we can delete it with `monk delete`:

      monk delete objectstorage/storage

This should remove Entity from Monk and the Azure Storage Account resource from Azure.
