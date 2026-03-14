import { HttpError } from "../utils/http-error.js";

export const notFoundHandler = (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next(new HttpError(404, "API-Endpunkt nicht gefunden."));
  }

  return res.status(404).send("Nicht gefunden.");
};

export const errorHandler = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({
      error: {
        message: error.message,
        details: error.details
      }
    });
  }

  console.error(error);

  return res.status(500).json({
    error: {
      message: "Interner Serverfehler."
    }
  });
};
