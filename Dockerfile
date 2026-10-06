# Build: Angular produkcioni build (BASE_HREF=/gfs/ iza host proxy-ja). Runtime: nginx.
FROM node:18-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG BASE_HREF=/
RUN npx ng build --configuration production --base-href "$BASE_HREF"
# Okruzenje (prod/staging) za traku u AppComponent; ng serve nema ovaj fajl -> bez trake.
ARG APP_ENV=prod
RUN printf '{"env":"%s"}\n' "$APP_ENV" > dist/gfs-front/assets/env.json

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /build/dist/gfs-front /usr/share/nginx/html
EXPOSE 80
