# Supabase

Using Supabase Serverless Postgres with Monk.

## Usage

### Supabase token

Generate a new token: https://supabase.com/dashboard/account/tokens


### Token example
```
sbp_9fc63f2a40136c30a16601a4bddd17c893a694f3
```

See example.yaml for a simple example of how to use supabase Serverless Postgres with Monk.
It creates the following resources:
- Organization
- Project
- Branch
- Database
- Example application container with connection to the database

We'll use Monk CLI to load and run everything:

      # set secret with supabase token (https://supabase.com/dashboard/account/tokens)
      monk secrets add -g supabase-token=<SUPABASE_TOKEN>
      # set secret with supabase db password
      monk secrets add -g supabase-db-password=my-test-db-password

      # run 
      monk run supabase-example/stack
      
      # load Entity types and example template
      monk load MANIFEST
      monk load example.yaml

This should deploy a supabase Serverless Postgres instance and container with a simple example application.
Open http://localhost:8080/api/products in your browser to check if it works.
It should show a list of products with data from the DB.

## Project entity state
```
 │  └─✨ Entity State:
 │     ├─ created_at          2025-04-23T15:30:01.064398Z :: string
 │     ├─ database
 │     │  ├─ host                db.qufhwvyozsmbryfitjsy.supabase.co :: string
 │     │  ├─ postgres_engine     15 :: string
 │     │  ├─ release_channel     ga :: string
 │     │  └─ version             15.8.1.073 :: string
 │     ├─ id                  qufhwvyozsmbryfitjsy :: string
 │     ├─ name                my-project-1 :: string
 │     ├─ organization_id     zhjwgcwaefwgcvufpzyk :: string
 │     ├─ region              us-east-2 :: string
 │     └─ status              ACTIVE_HEALTHY :: string
```

## Connect

```
postgresql://postgres:[YOUR-PASSWORD]@db.qufhwvyozsmbryfitjsy.supabase.co:5432/postgres
```
