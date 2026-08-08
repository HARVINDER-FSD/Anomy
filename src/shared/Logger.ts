type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class LoggerService {
  private isDevelopment = true;

  debug(tag: string, message: string, ...args: any[]) {
    if (this.isDevelopment) {
    }
  }

  info(tag: string, message: string, ...args: any[]) {
  }

  warn(tag: string, message: string, ...args: any[]) {
  }

  error(tag: string, message: string, error?: any) {
  }
}

export const Logger = new LoggerService();
