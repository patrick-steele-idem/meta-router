import { Handler } from "express";

export default ((_, res) => {
  res.status(200).set("Content-Type", "text").end("a");
}) as Handler;
