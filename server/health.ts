// server/health.ts
import { Router, type Request, type Response } from "express";

const healthRouter = Router();

/** Returns the process health status. */
function handleHealthCheck(_request: Request, response: Response): void {
  response.json({ ok: true });
}

healthRouter.get("/health", handleHealthCheck);

/** Express router exposing the process health check. */
export default healthRouter;
