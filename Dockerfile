FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_NEW_API_CONSOLE_URL=
ENV VITE_NEW_API_CONSOLE_URL=${VITE_NEW_API_CONSOLE_URL}
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.docker.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
