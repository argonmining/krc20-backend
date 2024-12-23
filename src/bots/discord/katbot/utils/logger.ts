export class Logger {
    static error(message: string, meta?: object): void {
      console.error(`ERROR: ${message}`, meta);
      // In a production environment, you'd want to use a proper logging service here
    }
  
    static info(message: string, meta?: object): void {
      console.log(`INFO: ${message}`, meta);
    }
  
    static warn(message: string, meta?: object): void {
      console.warn(`WARN: ${message}`, meta);
    }

    static debug(message: string, meta?: object): void {
        console.log(`DEBUG: ${message}`, meta);
    }
}