# Azure Service-Hub

Entity to manage Azure Service Hub.
It will allow us to create new Azure Service Hub using Monk.

## Usage

We'll use Monk CLI to load and run everything:

      # load templates
      monk load MANIFEST
      
      # run to trigger a "create" event
      monk run service-hub/hubnamespace

Below is the sample body named `namespaceObject` to create Event Hub namespace and it can be extend with [Azure Service hub Namespace REST API reference](https://learn.microsoft.com/en-us/rest/api/servicebus/stable/namespaces/create-or-update?tabs=HTTP

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

When we don't need this event hub namespace anymore,
we can delete it with `monk delete`:

      monk delete event-hub/hubnamespace

This should remove Entity from Monk and the Azure Event Hub namespace resource from Azure.

### Queue

In order to create or update a Queue as a nested resource within a Azure Service Hub namespace.

      monk do  service-hub/hubnamespace/createQueue

Below is the sample body named `createQueue` to create Event Hub and it can be extend with [Azure Event hub Service Hub REST API reference](https://learn.microsoft.com/en-us/rest/api/servicebus/stable/queues/create-or-update?tabs=HTTP)

```json
   {
     "properties": {
       "enablePartitioning": true
     }
   }
```

When we don't need this Event Hub anymore,
we can delete it with: 

      monk do  event-hub/hubnamespace/deleteQueue



### Topic

In order to create or update a Topic as a nested resource within a Azure Service Hub.

      monk do  event-hub/hubnamespace/createTopic

Below is the sample body named `createTopic` to create Service Topic  and it can be extend with [Azure Service hub Consumer Group REST API reference](https://learn.microsoft.com/en-us/rest/api/servicebus/stable/topics/create-or-update?tabs=HTTP)

```json
   {
     "properties": {
       "enableExpress": true
     }
   }
```

When we don't need this Consumer Group anymore,
we can delete it with: 

      monk do  event-hub/hubnamespace/deleteTopic