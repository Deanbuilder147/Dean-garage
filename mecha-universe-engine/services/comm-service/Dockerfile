FROM node:20-alpine

RUN apk add --no-cache dumb-init

WORKDIR /app

COPY package.json tsconfig.json ./
COPY src/ ./src/

RUN npm install --legacy-peer-deps && npm run build

ENV NODE_ENV=production
ENV PORT=3005

EXPOSE 3005

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
