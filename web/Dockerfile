# Dockerfile del frontend: build con Vite, sirve con nginx (RF-TEC-005/006)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json vite.config.ts ./
COPY index.html ./
COPY src/ ./src/
# La API se consume vía proxy inverso de nginx (RF-TEC-002)
RUN npm run build

FROM nginx:1.27-alpine AS runtime
# nginx corre como usuario no root por defecto en esta imagen
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
