# Dockerfile del backend (Node.js + TypeScript, multietapa)
# Imagen base con versión específica (RF-TEC-005)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Copiar migraciones SQL (tsc no las incluye en dist) (RF-TEC-009)
COPY src/migrations/ ./migrations/
# Volumen para archivos persistentes (RF-TEC-007)
RUN mkdir -p /uploads
VOLUME ["/uploads"]
# Usuario sin privilegios (RF-TEC-005)
USER node
EXPOSE 4000
# Ejecuta migraciones y luego la app (RF-TEC-009)
CMD ["sh", "-c", "node dist/migrate.js && node dist/index.js"]
