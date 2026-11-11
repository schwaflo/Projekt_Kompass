# Projekt-Kompass als statische Seite hinter nginx.
# Bauen:   docker build -t projekt-kompass .
# Starten: docker run --rm -p 8080:80 projekt-kompass     → http://localhost:8080
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY praesentation /usr/share/nginx/html/praesentation
COPY prompts /usr/share/nginx/html/prompts
COPY design-systems /usr/share/nginx/html/design-systems
COPY examples /usr/share/nginx/html/examples
COPY vendor /usr/share/nginx/html/vendor
COPY tests /usr/share/nginx/html/tests
EXPOSE 80
