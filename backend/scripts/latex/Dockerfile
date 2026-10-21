# Local LaTeX compiler image for LATEX_COMPILER=docker (development only).
# Build: docker build -t unbluff-latex:1 backend/scripts/latex
FROM alpine:3.20
RUN apk add --no-cache texlive texmf-dist-latexrecommended texmf-dist-latexextra texmf-dist-fontsrecommended \
 && adduser -D -u 10001 tex
USER tex
WORKDIR /work
