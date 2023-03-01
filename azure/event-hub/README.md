# Azure Event-Hub

Entity to manage Azure Event Hub.
It will allow us to create new Azure Event Hub using Monk.

## Usage

We'll use Monk CLI to load and run everything:

      # load templates
      monk load MANIFEST
      
      # run to trigger a "create" event
      monk run event-hub/hubnamespace

Below is the sample body named `namespaceObject` to create Event Hub namespace and it can be extend with [Azure Event hub Namespace REST API reference](https://learn.microsoft.com/en-us/rest/api/eventhub/stable/namespaces/create-or-update?tabs=HTTP)

```json
    {
      "properties": {
        "partitionCount": 5,
        "messageRetentionInDays": 3,
        "status": "Active"
      }
    }
```

When we don't need this event hub namespace anymore,
we can delete it with `monk delete`:

      monk delete event-hub/hubnamespace

This should remove Entity from Monk and the Azure Event Hub namespace resource from Azure.

### Event Hub

In order to create or update a Event Hub as a nested resource within a Azure Event Hub namespace.

      monk do  event-hub/hubnamespace/createEventhub

Below is the sample body named `eventHubObject` to create Event Hub and it can be extend with [Azure Event hub Event Hub REST API reference](https://learn.microsoft.com/en-us/rest/api/eventhub/stable/event-hubs/create-or-update?tabs=HTTP)

```json
    {
      "properties": {
        "partitionCount": 5,
        "messageRetentionInDays": 3,
        "status": "Active"
      }
    }
```

When we don't need this Event Hub anymore,
we can delete it with: 

      monk do  event-hub/hubnamespace/deleteEventHub



### Consumer Group

In order to create or update a Consumer Group as a nested resource within a Azure Event Hub.

      monk do  event-hub/hubnamespace/createConsumerGroup

Below is the sample body named `consumerGroupObject` to create Event Hub Consumer Group and it can be extend with [Azure Event hub Consumer Group REST API reference](https://learn.microsoft.com/en-us/rest/api/eventhub/stable/consumer-groups/create-or-update?tabs=HTTP)

```json
    {
      "properties": {
        "userMetadata": "consumergroup"
      }
    }
```

When we don't need this Consumer Group anymore,
we can delete it with: 

      monk do  event-hub/hubnamespace/deleteConsumerGroup


### Schema Registry

In order to create or update a Schema Registry as a nested resource within a Azure Event Hub.

      monk do  event-hub/hubnamespace/createSchema

Below is the sample body named `eventHubSchemaObject` to create Event Hub Schema registry and it can be extend with [Azure Event hub Schema Registry REST API reference](https://learn.microsoft.com/en-us/rest/api/eventhub/stable/schema-registry/create-or-update?tabs=HTTP)

```json
    {
      "properties": {
         groupProperties: {},
         schemaCompatibility: "None",
         schemaType: "Avro"
      }
    }
```

When we don't need this Consumer Group anymore,
we can delete it with: 

      monk do  event-hub/hubnamespace/deleteSchema