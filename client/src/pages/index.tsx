import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import Image from "next/image";
import { useEffect, useState } from "react";
import io, { Socket } from "socket.io-client";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "ws://127.0.0.1";

const CONNECTION_COUNT_UPDATED_CHANNEL = "chat:connection-count-updated";
const NEW_MESSAGE_CHANNEL = "chat:new-message";

type Message = {
  message: string;
  id: string;
  createdAt: string;
  port: string;
};

function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const socketIo = io(SOCKET_URL, {
      reconnection: true,
      upgrade: true,
      transports: ["websocket", "polling"],
    });

    setSocket(socketIo);

    return () => {
      socketIo.disconnect();
    };
  }, []);

  return socket;
}

export default function Home() {
  const [newMessage, setNewMessage] = useState("");
  const [messages, setMessages] = useState<Array<Message>>([]);
  const socket = useSocket();

  useEffect(() => {
    if (socket) {
      socket.on("connect", () => {
        console.log("connected to socket");
      });

      socket.on(NEW_MESSAGE_CHANNEL, (message: Message) => {
        setMessages((prevMessages) => [message, ...prevMessages]);
      });

      socket.on("disconnect", () => {
        console.log("disconnected");
      });
    }
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    socket?.emit(NEW_MESSAGE_CHANNEL, {
      message: newMessage,
    });
    setNewMessage("");
  };

  return (
    <main className="flex flex-col p-4 w-full max-w-3xl m-auto">
      {messages.map((message) => (
        <div key={4}>{message.message}</div>
      ))}

      <form onSubmit={handleSubmit} className="flex items-center">
        <Textarea
          placeholder="Tell us what's on your mind"
          value={newMessage}
          className="rounded-lg mr-4"
          onChange={(e) => setNewMessage(e.target.value)}
          maxLength={280}
        />
        <Button className="h-full">Send Message</Button>
      </form>
    </main>
  );
}
