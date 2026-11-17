#!/usr/bin/env bash
# Postgres descartável para a suíte E2E (não usa o volume do docker-compose).
#   npm run test:db:up    sobe o banco e aplica as migrações
#   npm run test:db:down  remove o container e os dados
set -euo pipefail

NAME=rateio-test-db
PORT="${TEST_DB_PORT:-55432}"
URL="postgresql://ci:ci@localhost:${PORT}/rateio_test"

case "${1:-up}" in
  up)
    if ! docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
      docker run -d --rm --name "$NAME" \
        -e POSTGRES_USER=ci -e POSTGRES_PASSWORD=ci -e POSTGRES_DB=rateio_test \
        -p "${PORT}:5432" postgres:16-alpine >/dev/null
    fi

    # TCP só responde depois que a inicialização do Postgres termina
    for _ in $(seq 1 30); do
      if docker exec "$NAME" pg_isready -h 127.0.0.1 -U ci -d rateio_test >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done

    DATABASE_URL="$URL" DIRECT_URL="$URL" npx prisma migrate deploy
    echo "Banco de teste pronto em $URL"
    ;;
  down)
    docker stop "$NAME" >/dev/null 2>&1 || true
    echo "Banco de teste removido"
    ;;
  *)
    echo "Uso: $0 up|down" >&2
    exit 1
    ;;
esac
