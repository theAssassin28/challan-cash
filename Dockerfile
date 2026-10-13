FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data
VOLUME /data
EXPOSE 8787
CMD ["npm", "start"]
