# Monk MongoDB Atlas Example

Example of deploying a MongoDB Atlas database and connecting to it from a runnable.

## Usage

1. Create account in Atlas Cloud
2. Create an organization
3. In Access Manager -> Applications -> Create a new Service Account with role Organization Project Creator
```
monk load MANIFEST
monk load example.yaml

Loaded 0 runnables, 0 process groups, 0 services, 3 entities and 0 entity instances from 3 files
✨ Loaded:
 └─⚙️ Entities: 
    ├─🧩 mongodb-atlas/cluster
    ├─🧩 mongodb-atlas/project
    └─🧩 mongodb-atlas/user
```

```
monk load example.yaml

Loaded 1 runnables, 1 process groups, 0 services, 0 entities and 3 entity instances with 0 errors and 2 warnings
✨ Loaded:
 ├─🔩 Runnables:        
 │  └─🧩 mongodb-example/mongo-express
 ├─🔗 Process groups:   
 │  └─🧩 mongodb-example/stack
 └─⚙️ Entity instances: 
    ├─🧩 mongodb-example/cluster
    ├─🧩 mongodb-example/project
    └─🧩 mongodb-example/user
```

3. Create a secret for the Mongo Cloud Service Account keys, one secret for Client ID:Secret pair

example:
```
monk secrets add -g mongo_token="mdb_sa_id_YOUR_ID:mdb_sa_sk_YOUR_SECRET"
```

4. Deploy example stack using Monk.

```
monk run mongodb-example/stack
```

```
monk ps -a

✔ Got state
Group/Runnable/Containers                                          Ready   Status   Uptime   Peer   Ports         
🔗 local/mongodb-example/stack                                             running                                 
   👽 local/mongodb-example/cluster                                true    running                                 
   🔩 local/mongodb-example/mongo-express                          true    running                                 
    └─📦 c417538d6c11832370944f093183fbd5-o-express-mongo-express          running  14m 13s  local  8081:8081/TCP  
   👽 local/mongodb-example/project                                true    running                                 
   👽 local/mongodb-example/user                                   true    running   
```

5.  Check connection to Mongo Express Runnable in browser at http://localhost:8081 (Default auth in Express is admin:pass)

6. To delete the stack run:

```
monk delete mongodb-example/stack
```