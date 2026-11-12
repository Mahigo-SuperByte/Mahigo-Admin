FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . ./
ENV NODE_ENV=production
ENV DATA_DIR=/var/lib/mahigo
RUN mkdir -p /var/lib/mahigo
VOLUME ["/var/lib/mahigo"]
EXPOSE 3000
CMD ["npm","start"]
