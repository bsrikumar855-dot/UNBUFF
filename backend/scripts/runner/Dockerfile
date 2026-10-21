# Local code-runner image for EXECUTION_PROVIDER=docker (development only).
# Build: docker build -t unbluff-runner:1 backend/scripts/runner
FROM alpine:3.20
RUN apk add --no-cache python3 nodejs g++ openjdk21-jdk \
 && adduser -D -u 10001 runner
USER runner
WORKDIR /work
