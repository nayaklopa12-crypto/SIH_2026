# Antarctic Navigation Intelligence — frontend (Next.js 15).
FROM node:20-alpine

WORKDIR /app

# NEXT_PUBLIC_* vars are inlined at build time and read in the BROWSER, so this
# must be a URL the user's browser can reach (the published backend port on the
# host), not a Docker-internal service name. Defaults to localhost:8000.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

COPY frontend ./
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start", "--", "-H", "0.0.0.0", "-p", "3000"]
