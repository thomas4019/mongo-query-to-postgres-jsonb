docker build --tag mongotest -f scripts/Dockerfile ./
docker run --rm --name mongotest mongotest
# docker exec -it mongotest /bin/bash