FROM node:18-slim

WORKDIR /app

# Install dependencies separately for better caching
COPY package*.json ./
RUN npm install --production

# Copy source
COPY src ./src

ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]

