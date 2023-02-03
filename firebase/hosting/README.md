# Hosting

Entities to manage Firebase Hosting Site and Channel.

## Usage

We'll use Monk CLI to load and run everything:

      # load templates
      monk load hosting.yaml
      
      # run site resource create a new website
      # it will populate entity state with site url
      monk run poc/mysite

      # run channel resource to create a channel for the website
      # it will populate entity state with site url for the channel
      monk run poc/mysite-beta

we can delete it with `monk delete`:

      monk delete poc/mysite-beta
      monk delete poc/mysite
