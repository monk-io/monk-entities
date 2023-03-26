# Azure Service-Bus

Entity to manage Azure Service Bus.
It will allow us to create new Azure Service Bus using Monk.

## Namespace

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

### Namespace Authorization

We'll use Monk CLI to load and run everything:
      
      # run to trigger a "create" event
      monk run service-bus/namespaceAuthorizationRule

primaryConnectionString/secondaryConnectionString including keys will be saved as secret in existing cluster after run above entity, For more details: [Secret](https://monk-docs.web.app/docs/entities#module-secret)

Below is the sample body named `authorizationRuleObject` to create Service Bus namespace authorization rule and it's primary/secondary key also it can be extend with [Azure Service Bus Namespace-Authorization Rules REST API reference](https://learn.microsoft.com/en-us/rest/api/servicebus/stable/namespaces-authorization-rules/create-or-update-authorization-rule?tabs=HTTP)

```json
   {
     "properties": {
       "rights": [
         "Listen",
         "Send"
       ]
     }
   }
```

When we don't need this service bus namespace authorization rules anymore,
we can delete it with `monk delete`:

      monk delete service-bus/namespaceAuthorizationRule

This should remove Entity from Monk and the Azure service bus namespace authorization rules resource from Azure.


## Queue

In order to create or update a Queue as a nested resource within a Azure Service Bus namespace.

w      monk run service-bus/busqueue

Below is the sample body named `queueObject` to create service bus and it can be extend with [Azure service bus Queue REST API reference](https://learn.microsoft.com/en-us/rest/api/servicebus/stable/queues/create-or-update?tabs=HTTP)

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

### Queue Authorization

We'll use Monk CLI to load and run everything:
      
      # run to trigger a "create" event
      monk run service-bus/queueAuthorizationRule

primaryConnectionString/secondaryConnectionString including keys will be saved as secret in existing cluster after run above entity, For more details: [Secret](https://monk-docs.web.app/docs/entities#module-secret)

Below is the sample body named `authorizationRuleObject` to create Service Bus queue authorization rule and it's primary/secondary key also it can be extend with [Azure Service Bus Queues-Authorization Rules REST API reference](https://learn.microsoft.com/en-us/rest/api/servicebus/stable/queues-authorization-rules/create-or-update-authorization-rule?tabs=HTTP)

```json
   {
     "properties": {
       "rights": [
         "Listen",
         "Send"
       ]
     }
   }
```

When we don't need this service bus namespace authorization rules anymore,
we can delete it with `monk delete`:

      monk delete service-bus/queueAuthorizationRule

This should remove Entity from Monk and the Azure service bus queue authorization rules resource from Azure.

## Topic

In order to create or update a Topic as a nested resource within a Azure Service Bus.

      monk run service-bus/bustopic

Below is the sample body named `topicObject` to create Service Topic  and it can be extend with [Azure Service Bus Topics REST API reference](https://learn.microsoft.com/en-us/rest/api/servicebus/stable/topics/create-or-update?tabs=HTTP)

```json
   {
     "properties": {
       "enableExpress": true
     }
   }
```

### Topic Authorization

We'll use Monk CLI to load and run everything:
      
      # run to trigger a "create" event
      monk run service-bus/topicAuthorizationRule

primaryConnectionString/secondaryConnectionString including keys will be saved as secret in existing cluster after run above entity, For more details: [Secret](https://monk-docs.web.app/docs/entities#module-secret)

Below is the sample body named `authorizationRuleObject` to create Service Bus queue authorization rule and it's primary/secondary key also it can be extend with [Azure Service Bus Topics-Authorization Rules REST API reference](https://learn.microsoft.com/en-us/rest/api/servicebus/stable/topics%20%E2%80%93%20authorization%20rules/create-or-update-authorization-rule?tabs=HTTP)

```json
   {
     "properties": {
       "rights": [
         "Listen",
         "Send"
       ]
     }
   }
```

When we don't need this service bus namespace authorization rules anymore,
we can delete it with `monk delete`:

      monk delete service-bus/topicAuthorizationRule

This should remove Entity from Monk and the Azure service bus topic authorization rules resource from Azure.


