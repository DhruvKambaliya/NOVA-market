FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json

RUN npm ci --omit=dev

COPY server/src ./server/src

ENV NODE_ENV=production

EXPOSE 8080

CMD ["npm", "run", "start", "--workspace=server"]