const isDev =
  typeof __DEV__ !== "undefined"
    ? __DEV__
    : process.env.NODE_ENV !== "production";

type LogArgs = unknown[];

export const logger = {
  debug: (...args: LogArgs) => {
    if (isDev) {
      console.log(...args);
    }
  },
  info: (...args: LogArgs) => {
    if (isDev) {
      console.info(...args);
    }
  },
  warn: (...args: LogArgs) => {
    if (isDev) {
      console.warn(...args);
    }
  },
  error: (...args: LogArgs) => {
    if (isDev) {
      console.error(...args);
    }
  },
};
