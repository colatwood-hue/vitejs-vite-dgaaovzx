#!/usr/bin/env bash
# Local development only: drop and recreate the database, migrate and seed.
set -euo pipefail
DB=${1:-thedash}
su postgres -c "dropdb --force --if-exists $DB && createdb -O dash $DB"
npm run db:migrate
npm run db:seed
