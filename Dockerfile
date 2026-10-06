FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY scripts/build.cjs scripts/build.cjs
COPY components/scripts/experiences.js components/scripts/experiences.js
COPY components/sass/style.scss components/sass/style.scss
COPY builds/development/index.html builds/development/index.html
RUN node scripts/build.cjs

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 ZOE_DATA_DIR=/data ZOE_SECURE_COOKIES=1
WORKDIR /app
COPY --from=build --chown=node:node /app/builds/development ./builds/development
COPY --chown=node:node server.cjs ./server.cjs
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
VOLUME ["/data"]
CMD ["node", "server.cjs"]
