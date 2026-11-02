FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
WORKDIR /app
COPY --chown=node:node server/server.cjs server/openai.cjs ./server/
COPY --chown=node:node js ./js/
USER node
EXPOSE 8787
CMD ["node", "server/server.cjs"]
