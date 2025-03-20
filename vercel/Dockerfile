FROM node:18-alpine

RUN npm i -g vercel

RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app

WORKDIR /home/node/app

USER node

ENV VERCEL_TOKEN=""

CMD ["sh", "-c", "vercel deploy --prod --public --yes -t $VERCEL_TOKEN"]