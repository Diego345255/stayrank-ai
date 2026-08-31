FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html app.js styles.css i18n.js methodology.html robots.txt sitemap.xml /usr/share/nginx/html/
COPY guides /usr/share/nginx/html/guides
EXPOSE 80
