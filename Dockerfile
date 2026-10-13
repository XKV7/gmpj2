# Render 외의 호스팅(Railway, Fly.io, 개인 서버 등)용 이미지
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production \
    PORT=3001 \
    MOYEO_DATA_DIR=/data \
    MOYEO_HTTPS=0
VOLUME ["/data"]
EXPOSE 3001
CMD ["npm", "start"]
