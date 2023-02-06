# S3 Bucket

Entity to manage AWS S3 bucket.
It will allow us to create new Buckets and upload files using Monk.

## Usage

We'll use Monk CLI to load and run everything:

      # load templates
      monk load s3-bucket.yaml example.yaml
      
      # run to trigger a "create" event
      monk run objectstorage/mybucket

An empty bucket with public read access should be created in AWS,
available at:  
https://my-bucket-with-unique-name.s3.amazonaws.com/

Now we can use presign an url to upload some file to Bucket to desired location path.

      monk do guides/mybucket/presign path=/image.png

This commands prints to console signed url and headers:

      ...
      ✔ Pre-signed URL: https://my-bucket-with-unique-name.s3.amazonaws.com/image.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAUACQQXWL7VRHQCYH%2F20221222%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20221222T213534Z&X-Amz-Expires=300&X-Amz-SignedHeaders=host%3Bx-amz-acl&X-Amz-Signature=7a8dd9acf0752f6a3223d7d335b5daf9a3503b2bdf5447bdeb5bd46ab725b403 DONE
      ✔ Pre-signed headers {"x-amz-acl":["public-read"]} DONE

We can upload the actual file using _curl_ tool with parameters from a response to the previous command:

      curl -X PUT -T /path-to-file/image.png -H "x-amz-acl: public-read" "https://my-bucket-with-unique-name.s3.amazonaws.com.s3.amazonaws.com/image.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAUACQQXWL7VRHQCYH/20221222/us-east-1/s3/aws4_request&X-Amz-Date=20221222T194021Z&X-Amz-Expires=300&X-Amz-SignedHeaders=host&X-Amz-Signature=f215ef40722f2d967fd35453ed94cbf12508a929ed6b57fc7e13ccd08dc5f2de"

Now you should see uploaded image at your location:  
https://my-bucket-with-unique-name.s3.amazonaws.com/image.png.

We can upload many more files, but when we don't need this Bucket anymore,
we can delete it with `monk delete`:

      monk delete guides/mybucket

This should remove Entity from Monk and the Bucket resource from AWS.
