docker-compose down

export UPSTASH_REDIS_REST_URI = redis://default:{password}@tops-swine-41255.upstash.io:41255

export CORS_ORIGIN = http://localhost:3000

docker-compose up -d --build
