# Firebase Database

Entity to manage Firebase Realtime Database resources.

It’s using GCP authorization to work with Firebase resources here.

Entity has the following lifecycle commands:

```
lifecycle:
    sync: <<< db-instance-sync.js
    # custom actions on instances
    disable: ""
    reenable: ""
    # working with security rules
    get-rules: ""
    set-rules: ""
    # actions to work with db data
    get: ""
    set: ""
    push: ""
    remove: ""
```

Database definition is like this:

```
myinstance:
  defines: firebase/firebase-db-instance
  name: common-access-project-4swaig
  location: us-central1
  project-id: common-access-project
```

## Usage

Available operations:

```
monk load MANIFEST
monk load example.yaml

# create instance
monk run firebase/myinstance

# disable instance
monk do firebase/myinstance/disable

# delete (need to disable first, or will get error)
monk purge firebase/myinstance

# reenable instance
monk do firebase/myinstance/reenable

# get security rules
monk do firebase/myinstance/get-rules

# set security rules (allows public read/write, careful!)
monk do firebase/myinstance/set-rules rules='{"rules":{".read":true,".write":true}}'

# set json value for a given path
monk do firebase/myinstance/set path=/path/to/location value='{"hey":"haw","hello":"world"}'

# get value for a given path
monk do firebase/myinstance/get path=/path/to/location/hey

# remove given path
monk do firebase/myinstance/remove path=/path/to/location/hey

# push value into the list at given path
monk do firebase/myinstance/push path=/path/to/location/ value='{"hey":"haw"}'
```
