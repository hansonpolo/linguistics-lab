# ---------- 构建前端 ----------
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- 运行 ----------
FROM node:22-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server ./server

# 数据卷：SQLite 库、WAL 文件都写在这里
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 8787
CMD ["node", "server/index.js"]
