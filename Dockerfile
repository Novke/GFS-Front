# Build: Angular produkcioni build (BASE_HREF=/ na stejdžingu i prodi; /gfs/ je bio istorijski). Runtime: nginx.
# Bazne slike sa AWS ogledala zvaničnih Docker slika (iste slike kao na Docker Hub-u): anonimni pull sa Docker Hub-a
# deli limit po IP adresi GitHub runnera i ume da obori CI.
FROM public.ecr.aws/docker/library/node:24-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG BASE_HREF=/
RUN npx ng build --configuration production --base-href "$BASE_HREF"
# Okruzenje (prod/staging) za traku u AppComponent; ng serve nema ovaj fajl -> bez trake.
ARG APP_ENV=prod
RUN printf '{"env":"%s"}\n' "$APP_ENV" > dist/gfs-front/browser/assets/env.json

FROM public.ecr.aws/docker/library/nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /build/dist/gfs-front/browser /usr/share/nginx/html
EXPOSE 80
