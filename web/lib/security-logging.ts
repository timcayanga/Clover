type ErrorLike = {
  name?: unknown;
  message?: unknown;
};

const truncate = (value: string, max = 160) => (value.length <= max ? value : `${value.slice(0, max - 1)}…`);

export const summarizeErrorForLog = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: truncate(error.message.replace(/\s+/g, " ").trim()),
    };
  }

  if (error && typeof error === "object") {
    const errorLike = error as ErrorLike;
    const name = typeof errorLike.name === "string" ? errorLike.name : "Error";
    const message = typeof errorLike.message === "string" ? errorLike.message : "";
    return {
      name,
      message: message ? truncate(message.replace(/\s+/g, " ").trim()) : "",
    };
  }

  return {
    name: "Error",
    message: typeof error === "string" ? truncate(error.replace(/\s+/g, " ").trim()) : "Unknown error",
  };
};
