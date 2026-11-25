# specgate — requirement coverage for your codebase.
#
# The image contains only the CLI. Scan a project by mounting it:
#
#   docker run --rm -v "$PWD:/workspace" -w /workspace ghcr.io/aazh2026/specgate:0.1.4
#
# The default working directory is /workspace, which is where the project is
# expected to be mounted.

FROM node:20-alpine

LABEL org.opencontainers.image.title="specgate" \
      org.opencontainers.image.description="Requirement coverage for your codebase. Like test coverage, but for acceptance criteria." \
      org.opencontainers.image.url="https://github.com/aazh2026/specgate" \
      org.opencontainers.image.source="https://github.com/aazh2026/specgate" \
      org.opencontainers.image.licenses="MIT"

# Only the runtime parts are needed: bin/, src/ and package.json. The version
# is read from package.json at runtime, so it must be present.
WORKDIR /opt/specgate
COPY package.json ./
COPY bin ./bin
COPY src ./src
COPY assets ./assets

RUN chmod 0755 bin/specgate.js \
    && ln -s /opt/specgate/bin/specgate.js /usr/local/bin/specgate

WORKDIR /workspace
VOLUME ["/workspace"]

ENTRYPOINT ["specgate"]
CMD ["."]
