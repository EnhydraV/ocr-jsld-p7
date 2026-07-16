# Basic Dockerfile for backend
# Note: This is a basic version. Students should optimize it with:
# - Multi-stage builds
# - Smaller base images (alpine)
# - Security best practices
# - Layer optimization

FROM node:22

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npx prisma generate

RUN npm run build

EXPOSE 8080

CMD ["npm", "start"]
