ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-alpine

RUN npm install netlify-cli -g

RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app

WORKDIR /home/node/app

USER node

ENV NETLIFY_SITE_ID=""
ENV NETLIFY_AUTH_TOKEN=""

CMD ["sh", "-c", "netlify deploy --prod --dir=/home/node/app/build"]