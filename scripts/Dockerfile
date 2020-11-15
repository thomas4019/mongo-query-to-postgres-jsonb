FROM mongo:3.4
RUN apt-get update && apt-get -y install wget
RUN wget -q https://github.com/mongodb/mongo/archive/r4.2.10.tar.gz
RUN tar -xzf r4.2.10.tar.gz && mv mongo-r4.2.10 mongo
RUN wget -q -O - https://deb.nodesource.com/setup_12.x | bash -
RUN apt-get install -y nodejs
WORKDIR /srv
RUN npm i pgmongo
RUN rm -r node_modules/mongo-query-to-postgres-jsonb

RUN sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
RUN wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
RUN apt-get update
RUN apt-get -y install postgresql

COPY . node_modules/mongo-query-to-postgres-jsonb
COPY scripts/test.sh .
