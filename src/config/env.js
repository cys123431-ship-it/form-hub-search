const defaultPort = 4321;

export const env = {
  port: Number(process.env.PORT ?? defaultPort),
  host: process.env.HOST ?? "0.0.0.0",
};
