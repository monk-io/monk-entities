# Cloud Functions

Implementation of Cloud Function with v2 version of funcs,
which requires you to enable following API in Google Cloud Platform:
Artifact Registry, Cloud Build, Cloud Run,

## Usage

Load entity type and definition

```bash
monk load cloudfunc.yaml example.yaml
```

You need to upload sources code in zip file, for node js runtime it has to contain package.json and index.js files.
First run will return Upload URL and storage source properties that you need to fill in template file.

```
monk run firebase/myfunc
✔ Starting the job: firebase/myfunc... DONE
✔ Executing entity create script for templates/local/firebase/myfunc DONE
✔ Upload url: https://storage.googleapis.com/gcf-v2-uploads-548884607057-us-central1/f5bac347-cf61-4d00-9731-ae413525fa1d.zip?GoogleAccessId=service-548884607057@gcf-admin-robot.iam.gserviceaccount.com&Expires=1675069720&Signature=oVJp5bYIetczZGAsskxeOf2HI9OoRtnkA5cBt62ewcJbhpZNOOh4Gp8kROHvLVCaGulDOYPXYjjm60eME3gg1CfT0xQsfVRprMvhVpYLgTZ0u48ERb0cptdm3AGWyfxCQ%2FIh93HGfaCU1ES8%2BBb8BIpKXZXXZ0NclqD5ftCNRKtBWfVQMf5VlZ5HAvmg6q%2Br3DzasAm1lIEGmKaGVnwrFSouCtpkyn8mDidiYbRVMPhDsr4qkUpYtTLbpE1n1px8onc3eJixGhh9K9DZGxTft7pAxOuQxtH0qjRrgvGK%2B9UG7g081PooSXOFVjrFY%2F7jVp9arYOd69t4tHkk7nzitQ%3D%3D DONE
✔ Storage source: {"bucket":"gcf-v2-uploads-548884607057-us-central1","object":"f5bac347-cf61-4d00-9731-ae413525fa1d.zip"} DONE

# use curl with signed url to upload
curl -X PUT -H 'content-type: application/zip' --data-binary '@func.zip' 'https://storage.googleapis.com/gcf-v2-uploads-548884607057-us-central1/f5bac347-cf61-4d00-9731-ae413525fa1d.zip?GoogleAccessId=service-548884607057@gcf-admin-robot.iam.gserviceaccount.com&Expires=1675069720&Signature=oVJp5bYIetczZGAsskxeOf2HI9OoRtnkA5cBt62ewcJbhpZNOOh4Gp8kROHvLVCaGulDOYPXYjjm60eME3gg1CfT0xQsfVRprMvhVpYLgTZ0u48ERb0cptdm3AGWyfxCQ%2FIh93HGfaCU1ES8%2BBb8BIpKXZXXZ0NclqD5ftCNRKtBWfVQMf5VlZ5HAvmg6q%2Br3DzasAm1lIEGmKaGVnwrFSouCtpkyn8mDidiYbRVMPhDsr4qkUpYtTLbpE1n1px8onc3eJixGhh9K9DZGxTft7pAxOuQxtH0qjRrgvGK%2B9UG7g081PooSXOFVjrFY%2F7jVp9arYOd69t4tHkk7nzitQ%3D%3D'
```

Edit template with
source `{"bucket":"gcf-v2-uploads-548884607057-us-central1","object":"f5bac347-cf61-4d00-9731-ae413525fa1d.zip"}` that
was generated in monk run.

```
# load updated template
monk load cloudfunc.yaml

# run again to create Cloud Function resource
monk run firebase/myfunc
```

After that function should be created and available in Firebase console.

When you don't need it anymore you can remove it with:

```
monk delete firebase/myfunc
```
