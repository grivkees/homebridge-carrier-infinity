/* eslint-disable @typescript-eslint/no-explicit-any */
import { Logger, LogLevel } from 'homebridge';

export class PrefixLogger implements Logger {
  constructor(
        private readonly internal: Logger,
        readonly prefix: string,
  ){}

  public info(message: string, ...parameters: any[]): void {
    this.log(LogLevel.INFO, message, ...parameters);
  }

  public success(message: string, ...parameters: any[]): void {
    this.log(LogLevel.SUCCESS, message, ...parameters);
  }

  public warn(message: string, ...parameters: any[]): void {
    this.log(LogLevel.WARN, message, ...parameters);
  }

  public error(message: string, ...parameters: any[]): void {
    this.log(LogLevel.ERROR, message, ...parameters);
  }

  public debug(message: string, ...parameters: any[]): void {
    this.log(LogLevel.DEBUG, message, ...parameters);
  }

  public log(level: LogLevel, message: string, ...parameters: any[]): void {
    this.internal.log(level, `[${this.prefix}] ${message}`, ...parameters);
  }
}