import dotenv from "dotenv";
import fastify from "fastify";
import fastifyCors = require("@fastify/cors");
import fastifyIO from "fastify-socket.io";
import Redis from "ioredis";
import closeWithGrace from "close-with-grace";
import { randomUUID } from "crypto";

dotenv.config();

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
// const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";
const CORS_ORIGIN = "http://localhost:3000";
const UPSTASH_REDIS_REST_URI = process.env.UPSTASH_REDIS_REST_URI;
const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const CONNECTION_COUNT_KEY = "chat:connection-count";
const CONNECTION_COUNT_UPDATED_CHANNEL = "chat:connection-count-updated";
const NEW_MESSAGE_CHANNEL = "chat:new-message";
// const MESSAGES_KEY = "chat:messages";

// function sendMessageToRoom({ room, messageContents }) {
//   const channel = `chat:${room}:messages`;
// }

// Publisher and Subscriber instances
if (!UPSTASH_REDIS_REST_URI) {
  console.error("UPSTASH_REDIS_REST_URI is not defined");
  process.exit(1);
}

const publisher = new Redis(UPSTASH_REDIS_REST_URI, {});
const subscriber = new Redis(UPSTASH_REDIS_REST_URI);

let connectedClients = 0;

async function buildServer() {
  const server = fastify();

  await server.register(fastifyCors, {
    origin: "*",
    methods: methods,
  });

  await server.register(fastifyIO, {
    cors: {
      origin: CORS_ORIGIN,
      methods: methods,
    },
  });

  const currentCount = await publisher.get(CONNECTION_COUNT_KEY);

  if (!currentCount) {
    await publisher.set(CONNECTION_COUNT_KEY, 0);
  }

  /* @ts-ignore */
  server.io.on("connection", async (io: any) => {
    console.log("Client connected");

    const incResult = await publisher.incr(CONNECTION_COUNT_KEY);

    connectedClients++;

    await publisher.publish(
      CONNECTION_COUNT_UPDATED_CHANNEL,
      String(incResult)
    );

    io.on(NEW_MESSAGE_CHANNEL, async ({ message }) => {
      publisher.publish(NEW_MESSAGE_CHANNEL, message.toString());
    });

    io.on("disconnect", async () => {
      console.log("Client disconnected");

      const decResult = await publisher.decr(CONNECTION_COUNT_KEY);

      connectedClients--;

      await publisher.publish(
        CONNECTION_COUNT_UPDATED_CHANNEL,
        String(decResult)
      );
    });
  });

  subscriber.subscribe(CONNECTION_COUNT_UPDATED_CHANNEL, (err, count) => {
    if (err) {
      console.error(
        `Error subscribing to ${CONNECTION_COUNT_UPDATED_CHANNEL} channel`,
        err
      );
      return;
    }

    console.log(
      `${count} clients connected to ${CONNECTION_COUNT_UPDATED_CHANNEL} channel`
    );
  });

  subscriber.subscribe(NEW_MESSAGE_CHANNEL, (err, count) => {
    if (err) {
      console.error(`Error subscribing to ${NEW_MESSAGE_CHANNEL} channel`, err);
      return;
    }

    console.log(`${count} clients connected to ${NEW_MESSAGE_CHANNEL} channel`);
  });

  subscriber.on("message", (channel, message) => {
    if (channel === CONNECTION_COUNT_UPDATED_CHANNEL) {
      /* @ts-ignore */
      server.io.emit(CONNECTION_COUNT_UPDATED_CHANNEL, {
        count: message,
      });

      return;
    }

    if (channel === NEW_MESSAGE_CHANNEL) {
      /* @ts-ignore */
      server.io.emit(NEW_MESSAGE_CHANNEL, {
        message: message,
        id: randomUUID(),
        createdAt: new Date(),
        port: PORT,
      });

      return;
    }
  });

  server.get("/healthcheck", () => {
    return { status: "ok", port: PORT };
  });

  return server;
}

async function main() {
  const server = await buildServer();

  try {
    await server.listen({
      port: PORT,
      host: HOST,
    });

    closeWithGrace({ delay: 500 }, async () => {
      console.log("shutting down");

      if (connectedClients > 0) {
        console.log(`Removing ${connectedClients} from the count`);

        const currentCount = parseInt(
          (await publisher.get(CONNECTION_COUNT_KEY)) || "0",
          10
        );

        const newCount = Math.min(currentCount - connectedClients, 0);

        await publisher.set(CONNECTION_COUNT_KEY, newCount);
      }

      await server.close();
      console.log("Shutdown completed");
    });

    console.log(`Server is listening on ${HOST}:${PORT}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
