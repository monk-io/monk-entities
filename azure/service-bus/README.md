# Azure Service-Bus

Entity to manage Azure Service Bus.
It will allow us to create new Azure Service Bus using Monk.

## Usage

We'll use Monk CLI to load and run everything:

      # load templates
      monk load MANIFEST
      
      # run to trigger a "create" event
      monk run service-bus/busnamespace

Below is the sample body named `namespaceObject` to create Service Bus namespace and it can be extend with [Azure Service Bus Namespace REST API reference](https://learn.microsoft.com/en-us/rest/api/servicebus/stable/namespaces/create-or-update?tabs=HTTP

```json
   {
     "sku": {
       "name": "Standard",
       "tier": "Standard"
     },
     "location": "South Central US",
     "tags": {
       "tag1": "value1",
       "tag2": "value2"
     }
   }
```

When we don't need this service bus namespace anymore,
we can delete it with `monk delete`:

      monk delete service-bus/busnamespace

This should remove Entity from Monk and the Azure service bus namespace resource from Azure.

### Queue

In order to create or update a Queue as a nested resource within a Azure Service Bus namespace.

      monk run service-bus/busqueue

Below is the sample body named `createQueue` to create service bus and it can be extend with [Azure service bus Service Bus REST API reference](https://learn.microsoft.com/en-us/rest/api/servicebus/stable/queues/create-or-update?tabs=HTTP)

```json
   {
     "properties": {
       "enablePartitioning": true
     }
   }
```

When we don't need this service bus anymore,
we can delete it with: 

      monk delete service-bus/busqueue



### Topic

In order to create or update a Topic as a nested resource within a Azure Service Bus.

      monk run service-bus/bustopic

Below is the sample body named `createTopic` to create Service Topic  and it can be extend with [Azure Service Bus Consumer Group REST API reference](https://learn.microsoft.com/en-us/rest/api/servicebus/stable/topics/create-or-update?tabs=HTTP)

```json
   {
     "properties": {
       "enableExpress": true
     }
   }
```

When we don't need this Consumer Group anymore,
we can delete it with: 

      monk delete service-bus/bustopic