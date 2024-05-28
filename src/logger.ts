import util from "util";
import { Logger } from "@restorecommerce/logger";

const remap = {
  error: 'error',
  warn: 'warn',
  info: 'info',
  debug: 'debug',
  trace: 'silly'
};

export const wrapLogger = (logger: Logger, extra?: object) => {
  return new Proxy({}, {
    get(target, p, receiver): any {
      if (p === 'child') {
        return function (child: object) {
          return wrapLogger(logger, {
            ...(extra || {}),
            ...(child || {})
          });
        }
      }

      return function (format?: any, ...param: any[]) {
        const log = (logger as any)[(remap as any)[p]];
        const params = param.map(p => {
          if (typeof p === 'object') {
            return JSON.stringify(p);
          }
          return p;
        });

        const formatted = util.format(format, ...params);
        log(formatted, extra);
      };
    }
  });
}
