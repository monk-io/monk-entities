# Monk Redis Cloud example

Example of deploying a Redis Cloud Database using Monk.

## Usage

1. Create account in Redis Cloud, add payment method and get your API account and user keys.

2. Build entities
```
./build.sh redis-cloud
```

3. Load the Redis Cloud stack
```
monk load ./dist/redis-cloud/MANIFEST

Loaded 0 runnables, 0 process groups, 0 services, 5 entities, 0 entity instances and 2 modules from 7 files
✨ Loaded:
 ├─⚙️ Entities: 
 │  ├─🧩 redis-cloud/essentials-database
 │  ├─🧩 redis-cloud/essentials-subscription
 │  ├─🧩 redis-cloud/pro-database   
 │  ├─🧩 redis-cloud/pro-subscription
 │  └─🧩 redis-cloud/subscription   
 └─✨ Modules:  
    ├─🧩 redis-cloud/base
    └─🧩 redis-cloud/common

```

```
monk load ./src/redis-cloud/example.yaml

Loaded 1 runnables, 1 process groups, 0 services, 0 entities, 2 entity instances and 0 modules
✨ Loaded:
 ├─🔩 Runnables:        
 │  └─🧩 redis-cloud-example/redis-client
 ├─🔗 Process groups:   
 │  └─🧩 redis-cloud-example/stack
 └─⚙️ Entity instances: 
    ├─🧩 redis-cloud-example/essentials-database
    └─🧩 redis-cloud-example/essentials-subscription

```

4. Create secrets for the Redis Cloud API keys. Secret for password (redis-cloud-db-password) is optional, will be generated automatically if not provided.

```
monk secrets add -g redis-cloud-account-key="YOUR_ACCOUNT_KEY"
monk secrets add -g redis-cloud-user-key="YOUR_USER_KEY"
```

5. Deploy example stack using Monk.

```
monk run redis-cloud-example/stack
```

```
monk ps -a

✔ Got state
Group/Runnable/Containers                                          Ready   Status   Uptime   Peer   Ports  
🔗 local/redis-cloud-example/stack                                         running                          
   👽 local/redis-cloud-example/essentials-database                true    running                          
   👽 local/redis-cloud-example/essentials-subscription            true    running                          
   🔩 local/redis-cloud-example/redis-client                       true    running                         
    └─📦 local-dd1fa22dc0d41816577792f24b-mple-redis-client-redis          running  26s      local                     

        

```

-  Check connection to Redis Cloud database from the Redis client runnable

```
monk exec redis-cloud-example/redis-client bash -c 'redis-cli -u redis://${REDIS_USER}:${REDIS_PASSWORD}@${REDIS_ADDR} INCR mycounter'

✔ Connecting to shell started.
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.
(integer) 1
```

- To delete the stack run:

```
monk delete redis-cloud-example/stack
```