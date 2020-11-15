pg_ctlcluster 13 main start
su -c $'psql -c "ALTER USER postgres WITH PASSWORD \'postgres\';"' - postgres
su -c $'psql -c "CREATE DATABASE test;"' - postgres
DEBUG=pgmongo:* node node_modules/.bin/pgmongo localhost &
mongo --port 27018 ../mongo/jstests/core/where1.js