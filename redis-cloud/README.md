# Monk Redis Cloud example

Example of deploying a Redis Cloud Database using Monk.

## Usage

1. Create account in Redis Cloud, add payment method and get your API account and user keys.
2. Load the Redis Cloud example stack
```
monk load MANIFEST

Loaded 0 runnables, 0 process groups, 0 services, 3 entities and 0 entity instances from 3 files
✨ Loaded:
 └─⚙️ Entities: 
    ├─🧩 redis-cloud/account
    ├─🧩 redis-cloud/database
    └─🧩 redis-cloud/subscription


monk load example.yaml

Loaded 1 runnables, 1 process groups, 0 services, 0 entities and 3 entity instances
✨ Loaded:
 ├─🔩 Runnables:        
 │  └─🧩 redis-cloud-example/redis-client
 ├─🔗 Process groups:   
 │  └─🧩 redis-cloud-example/stack
 └─⚙️ Entity instances: 
    ├─🧩 redis-cloud-example/redis-account
    ├─🧩 redis-cloud-example/redis-database
    └─🧩 redis-cloud-example/redis-subscription

```

2. Create instance of Redis Cloud account in Monk. Used to retrieve payment methods and plans from Redis Cloud API.

```
monk run redis-cloud-example/redis-account
```

3. Get the list of available payment methods and plans for your account. You can use the plan id and payment method id in the next step.
``` 
monk do local/redis-cloud-example/redis-account/get-payment-methods
monk do local/redis-cloud-example/redis-account/get-plans subscription_type=essentials cloud_provider=AWS region=us-east-1

```

4. Change the plan id and payment method id for subscription in the example stack to the ones you got in the previous step.
No need to specify payment details for free plans

```yaml
  # redis-cloud-example/stack.yaml
  # ...
  redis-subscription:
    plan_id: "YOUR_PLAN_ID"
    payment_method_id: "YOUR_PAYMENT_METHOD_ID"
```

5. Create secrets for the Redis Cloud API keys. Secret for password (redis-cloud-db-password) is optional, will be generated automatically if not provided.

```
monk secrets add -g redis-cloud-account-key="YOUR_ACCOUNT_KEY"
monk secrets add -g redis-cloud-user-key="YOUR_USER_KEY"
```

6. Deploy example stack using Monk.

```
monk run redis-cloud-example/stack
```

```
monk ps

✔ Got state
Group/Runnable/Containers                                          Ready   Uptime   Peer   Ports  
🔗 local/redis-cloud-example/stack                                                                 
   🔩 local/redis-cloud-example/redis-client                       true                            
    └─📦 local-dd1fa22dc0d41816577792f24b-mple-redis-client-redis          15m 50s  local          
   👽 local/redis-cloud-example/redis-database                     true                            
   👽 local/redis-cloud-example/redis-subscription                 true                            
👽 local/redis-cloud-example/redis-account                         true                            

        

```

-  Check connection to Redis Cloud database from the Redis client runnable

```
monk exec redis-cloud-example/redis-client bash -c 'redis-cli -u redis://${DB_USER}:${DB_PASSWORD}@${DB_ADDR} INCR mycounter'

✔ Connecting to shell started.
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.
(integer) 1
```

- To delete the stack run:

```
monk delete redis-cloud-example/stack
monk delete redis-cloud-example/account
```