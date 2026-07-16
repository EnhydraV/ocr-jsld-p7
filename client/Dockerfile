# Basic Dockerfile for frontend
# Note: This is a basic version. Students should optimize it with:
# - Multi-stage builds (build stage + nginx serve stage)
# - Smaller base images (alpine)
# - Security best practices
# - Static file serving optimization

FROM node:22

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 4200

CMD ["npm", "run", "preview"]
