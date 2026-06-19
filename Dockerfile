FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci --production

FROM node:20-alpine
# git: required for in-app "Update now" (git pull). Native deps are already
# compiled in the builder stage, so no build toolchain is needed at runtime.
RUN apk add --no-cache git
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
RUN git config --global --add safe.directory /app
VOLUME /app/data
EXPOSE 3001
CMD ["node", "server/index.js"]
