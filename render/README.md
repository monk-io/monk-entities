# Monk Render example

Example of deploying a Redis Cloud Database using Monk.

## Usage

1. Create account in Redis Cloud, add payment method and get your API account and user keys.
2. Load the Redis Cloud stack
```
monk load MANIFEST

Loaded 0 runnables, 0 process groups, 0 services, 2 entities and 0 entity instances from 2 files
✨ Loaded:
 └─⚙️ Entities: 
    ├─🧩 redis-cloud/database
    └─🧩 redis-cloud/subscription
```

```
monk load example.yaml

Loaded 1 runnables, 1 process groups, 0 services, 0 entities and 2 entity instances
✨ Loaded:
 ├─🔩 Runnables:        
 │  └─🧩 redis-cloud-example/redis-client
 ├─🔗 Process groups:   
 │  └─🧩 redis-cloud-example/stack
 └─⚙️ Entity instances: 
    ├─🧩 redis-cloud-example/redis-database
    └─🧩 redis-cloud-example/redis-subscription
```

3. Create secrets for the Redis Cloud API keys. Secret for password (redis-cloud-db-password) is optional, will be generated automatically if not provided.

```
monk secrets add -g render-api-key="YOUR_API_KEY"
monk secrets add -g docker-access-token="YOUR_DOCKER_ACCESS_TOKEN"
```

4. Deploy example stack using Monk.

```
monk run redis-cloud-example/stack
```

```
monk ps -a

✔ Got state
Group/Runnable/Containers                                          Ready   Status   Uptime   Peer   Ports  
🔗 local/redis-cloud-example/stack                                         running                          
   🔩 local/redis-cloud-example/redis-client                       true    running                          
    └─📦 local-dd1fa22dc0d41816577792f24b-mple-redis-client-redis          running  44s      local          
   👽 local/redis-cloud-example/redis-database                     true    running                          
   👽 local/redis-cloud-example/redis-subscription                 true    running                            

        

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
```