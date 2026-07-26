/**
 * Official DigitalOcean Node.js Hello World Function
 * Based on: https://github.com/digitalocean/sample-functions-nodejs-helloworld
 */

function main(args) {
    let name = 'stranger';
    
    if (args.name) {
        name = args.name;
    }
    
    return {
        body: `Hello ${name}!`
    };
}

exports.main = main;
